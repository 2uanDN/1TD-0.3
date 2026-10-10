import { subDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addEvent as dbAddEvent,
  clearAllEvents as dbClearAllEvents,
  deleteEvent as dbDeleteEvent,
  getAllEvents as dbGetAllEvents,
  getEventsByDate as dbGetEventsByDate,
  getEventsSince as dbGetEventsSince,
  updateEventNote as dbUpdateEventNote,
  updateEventOccurredAt as dbUpdateEventOccurredAt,
} from '../db/events';
import { formatLocalIsoOffset, getTimezone } from '../lib/time';
import { newId } from '../lib/uuid';
import {
  clearTransientUndoStack,
  saveTransientUndoStack,
} from '../storage/settings';
import { DEFAULT_TOAST_DURATION_MS, useUIStore } from '../store/uiStore';
import { Action, Event, resolveActionColorHex } from '../types';

interface EventsSnapshot {
  todayEvents: Event[];
  recentEvents: Event[];
  allEvents: Event[];
  isLoaded: boolean;
}

type EventsListener = (snapshot: EventsSnapshot) => void;

const listeners = new Set<EventsListener>();

let sharedState: EventsSnapshot = {
  todayEvents: [],
  recentEvents: [],
  allEvents: [],
  isLoaded: false,
};

let loadPromise: Promise<void> | null = null;

function broadcastEvents(next: Partial<EventsSnapshot>): void {
  sharedState = { ...sharedState, ...next };
  listeners.forEach((listener) => {
    listener(sharedState);
  });
}

function sortNewestFirst(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const diff =
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
    if (!Number.isNaN(diff) && diff !== 0) {
      return diff;
    }
    return b.occurred_at.localeCompare(a.occurred_at);
  });
}

async function fetchTodayAndRecentEvents(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const now = new Date();
      const sevenDaysAgoIso = subDays(now, 7).toISOString();
      const [todayRows, recentRows, allRows] = await Promise.all([
        dbGetEventsByDate(now),
        dbGetEventsSince(sevenDaysAgoIso),
        dbGetAllEvents(),
      ]);

      broadcastEvents({
        todayEvents: sortNewestFirst(todayRows),
        recentEvents: sortNewestFirst(recentRows),
        allEvents: sortNewestFirst(allRows),
        isLoaded: true,
      });
    } catch (error: unknown) {
      console.error('[1TD][useEvents] Failed to load events from IndexedDB:', error);
      useUIStore
        .getState()
        .showToast('Không thể tải dữ liệu hoạt động từ thiết bị.');
      broadcastEvents({ isLoaded: true });
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export interface UseEventsResult {
  todayEvents: Event[];
  recentEvents: Event[];
  allEvents: Event[];
  isLoading: boolean;
  todayCountsByActionId: Record<string, number>;
  lastLoggedAtByActionId: Record<string, string>;
  logEvent: (action: Action) => Promise<Event | null>;
  getEventsForDate: (date: Date | string) => Promise<Event[]>;
  deleteEvent: (eventId: string) => Promise<boolean>;
  clearEvents: () => Promise<boolean>;
  updateNote: (eventId: string, note: string | null) => Promise<Event | null>;
  updateOccurredAt: (eventId: string, occurredAt: string) => Promise<Event | null>;
  refreshEvents: () => Promise<void>;
}

export function useEvents(): UseEventsResult {
  const [snapshot, setSnapshot] = useState<EventsSnapshot>(() => sharedState);

  const refreshEvents = useCallback(async () => {
    await fetchTodayAndRecentEvents();
  }, []);

  useEffect(() => {
    listeners.add(setSnapshot);

    if (!sharedState.isLoaded) {
      void fetchTodayAndRecentEvents();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchTodayAndRecentEvents();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      listeners.delete(setSnapshot);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const todayCountsByActionId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of snapshot.todayEvents) {
      counts[event.action_id] = (counts[event.action_id] ?? 0) + 1;
    }
    return counts;
  }, [snapshot.todayEvents]);

  const lastLoggedAtByActionId = useMemo(() => {
    const latest: Record<string, string> = {};
    for (const event of snapshot.todayEvents) {
      if (!latest[event.action_id]) {
        latest[event.action_id] = event.occurred_at;
      }
    }
    return latest;
  }, [snapshot.todayEvents]);

  const logEvent = useCallback(async (action: Action): Promise<Event | null> => {
    const now = new Date();
    const newEvent: Event = {
      id: newId(),
      action_id: action.id,
      action_name_snapshot: action.name.trim(),
      action_icon_snapshot: action.icon.trim(),
      action_color_snapshot: resolveActionColorHex(action.color),
      occurred_at: formatLocalIsoOffset(now),
      created_at: now.toISOString(),
      timezone_id: getTimezone(),
      note: null,
    };

    const prevToday = sharedState.todayEvents;
    const prevRecent = sharedState.recentEvents;
    const prevAll = sharedState.allEvents;

    // 1. Optimistic UI update before IndexedDB write resolves (SPEC.md § II & AGENTS.md)
    broadcastEvents({
      todayEvents: sortNewestFirst([newEvent, ...prevToday]),
      recentEvents: sortNewestFirst([newEvent, ...prevRecent]),
      allEvents: sortNewestFirst([newEvent, ...prevAll]),
    });

    // 2. Push to session undo stack and trigger 3s UndoToast
    const uiState = useUIStore.getState();
    uiState.pushUndo(newEvent);
    uiState.showToast(
      `Đã ghi nhận ${newEvent.action_name_snapshot} — Hoàn tác`,
      DEFAULT_TOAST_DURATION_MS
    );

    // 3. Persist to IndexedDB asynchronously; rollback on failure
    try {
      const saved = await dbAddEvent(newEvent);
      return saved;
    } catch (error: unknown) {
      console.error('[1TD][useEvents] Failed to persist event to IndexedDB:', error);
      broadcastEvents({
        todayEvents: prevToday,
        recentEvents: prevRecent,
        allEvents: prevAll,
      });
      useUIStore.getState().popUndo();
      useUIStore
        .getState()
        .showToast('Không thể lưu hoạt động vào thiết bị.', DEFAULT_TOAST_DURATION_MS);
      return null;
    }
  }, []);

  const getEventsForDate = useCallback(
    async (date: Date | string): Promise<Event[]> => {
      try {
        return await dbGetEventsByDate(date);
      } catch (error: unknown) {
        console.error('[1TD][useEvents] Failed to query events by date:', error);
        useUIStore
          .getState()
          .showToast('Không thể truy vấn lịch sử hoạt động.');
        return [];
      }
    },
    []
  );

  const deleteEvent = useCallback(async (eventId: string): Promise<boolean> => {
    const prevToday = sharedState.todayEvents;
    const prevRecent = sharedState.recentEvents;
    const prevAll = sharedState.allEvents;

    // Optimistic removal from UI state
    broadcastEvents({
      todayEvents: prevToday.filter((item) => item.id !== eventId),
      recentEvents: prevRecent.filter((item) => item.id !== eventId),
      allEvents: prevAll.filter((item) => item.id !== eventId),
    });

    try {
      await dbDeleteEvent(eventId);
      const currentStack = useUIStore.getState().undoStack;
      if (currentStack.some((item) => item.id === eventId)) {
        const nextStack = currentStack.filter((item) => item.id !== eventId);
        if (nextStack.length === 0) {
          clearTransientUndoStack();
        } else {
          saveTransientUndoStack(nextStack);
        }
        useUIStore.setState({ undoStack: nextStack });
      }
      return true;
    } catch (error: unknown) {
      console.error('[1TD][useEvents] Failed to delete event from IndexedDB:', error);
      broadcastEvents({
        todayEvents: prevToday,
        recentEvents: prevRecent,
        allEvents: prevAll,
      });
      useUIStore
        .getState()
        .showToast('Không thể xóa bản ghi hoạt động.');
      return false;
    }
  }, []);

  const updateNote = useCallback(
    async (eventId: string, note: string | null): Promise<Event | null> => {
      const prevToday = sharedState.todayEvents;
      const prevRecent = sharedState.recentEvents;
      const prevAll = sharedState.allEvents;

      const applyNote = (list: Event[]) =>
        list.map((item) => (item.id === eventId ? { ...item, note } : item));

      broadcastEvents({
        todayEvents: applyNote(prevToday),
        recentEvents: applyNote(prevRecent),
        allEvents: applyNote(prevAll),
      });

      try {
        const updated = await dbUpdateEventNote(eventId, note);
        return updated;
      } catch (error: unknown) {
        console.error('[1TD][useEvents] Failed to update event note:', error);
        broadcastEvents({
          todayEvents: prevToday,
          recentEvents: prevRecent,
          allEvents: prevAll,
        });
        useUIStore
          .getState()
          .showToast('Không thể lưu ghi chú hoạt động.');
        return null;
      }
    },
    []
  );

  const updateOccurredAt = useCallback(
    async (eventId: string, occurredAt: string): Promise<Event | null> => {
      const prevToday = sharedState.todayEvents;
      const prevRecent = sharedState.recentEvents;
      const prevAll = sharedState.allEvents;

      const applyTime = (list: Event[]) =>
        sortNewestFirst(
          list.map((item) =>
            item.id === eventId ? { ...item, occurred_at: occurredAt } : item
          )
        );

      broadcastEvents({
        todayEvents: applyTime(prevToday),
        recentEvents: applyTime(prevRecent),
        allEvents: applyTime(prevAll),
      });

      try {
        const updated = await dbUpdateEventOccurredAt(eventId, occurredAt);
        return updated;
      } catch (error: unknown) {
        console.error('[1TD][useEvents] Failed to update event occurred_at:', error);
        broadcastEvents({
          todayEvents: prevToday,
          recentEvents: prevRecent,
          allEvents: prevAll,
        });
        useUIStore
          .getState()
          .showToast('Không thể cập nhật thời gian hoạt động.');
        return null;
      }
    },
    []
  );

  const clearEvents = useCallback(async (): Promise<boolean> => {
    const prevToday = sharedState.todayEvents;
    const prevRecent = sharedState.recentEvents;
    const prevAll = sharedState.allEvents;

    broadcastEvents({
      todayEvents: [],
      recentEvents: [],
      allEvents: [],
    });

    try {
      await dbClearAllEvents();
      useUIStore.getState().clearUndo();
      return true;
    } catch (error: unknown) {
      console.error('[1TD][useEvents] Failed to clear all events from IndexedDB:', error);
      broadcastEvents({
        todayEvents: prevToday,
        recentEvents: prevRecent,
        allEvents: prevAll,
      });
      useUIStore.getState().showToast('Không thể xóa toàn bộ dữ liệu sự kiện.');
      return false;
    }
  }, []);

  return {
    todayEvents: snapshot.todayEvents,
    recentEvents: snapshot.recentEvents,
    allEvents: snapshot.allEvents,
    isLoading: !snapshot.isLoaded,
    todayCountsByActionId,
    lastLoggedAtByActionId,
    logEvent,
    getEventsForDate,
    deleteEvent,
    clearEvents,
    updateNote,
    updateOccurredAt,
    refreshEvents,
  };
}
