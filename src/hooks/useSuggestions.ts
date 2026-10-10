import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionHabitInsight,
  ActionSequenceSuggestion,
  computeHabitInsights,
  computeNextActionSequences,
  computeTimeBracketDistribution,
  isColdStartEvents,
  scoreActionsWithBreakdown,
  ScoredActionBreakdown,
  TimeBracketStat,
  TOP_SUGGESTIONS_COUNT,
} from '../lib/suggestions';
import { getSettings, saveSettings } from '../storage/settings';
import { useSuggestionStore } from '../store/suggestionStore';
import { useUIStore } from '../store/uiStore';
import {
  Action,
  DEFAULT_SUGGESTION_WEIGHTS,
  SuggestionWeights,
} from '../types';
import { useActions } from './useActions';
import { useEvents } from './useEvents';

type WeightsListener = (weights: SuggestionWeights) => void;

const weightsListeners = new Set<WeightsListener>();
let cachedWeights: SuggestionWeights | null = null;

function readInitialWeights(): SuggestionWeights {
  if (cachedWeights !== null) {
    return cachedWeights;
  }
  cachedWeights = getSettings().suggestion_weights;
  return cachedWeights;
}

function broadcastWeights(nextWeights: SuggestionWeights): void {
  cachedWeights = nextWeights;
  weightsListeners.forEach((listener) => {
    listener(nextWeights);
  });
}

function adjustAndNormalizeWeights(
  current: SuggestionWeights,
  targetKey: keyof SuggestionWeights,
  delta: number
): SuggestionWeights {
  const keys: Array<keyof SuggestionWeights> = ['w1', 'w2', 'w3', 'w4'];
  const otherKeys = keys.filter((k) => k !== targetKey);

  const clampedTarget = Math.max(
    0.05,
    Math.min(0.85, Math.round((current[targetKey] + delta) * 100) / 100)
  );
  const remaining = Math.max(0.15, Math.round((1 - clampedTarget) * 100) / 100);
  const currentOtherSum = otherKeys.reduce((acc, k) => acc + current[k], 0);

  const next: SuggestionWeights = { ...current, [targetKey]: clampedTarget };

  if (currentOtherSum <= 0) {
    const share = Math.round((remaining / 3) * 100) / 100;
    next[otherKeys[0]] = share;
    next[otherKeys[1]] = share;
    next[otherKeys[2]] = Math.max(0.01, Math.round((remaining - share * 2) * 100) / 100);
    return next;
  }

  let assignedOther = 0;
  otherKeys.forEach((key, idx) => {
    if (idx < otherKeys.length - 1) {
      const scaled = Math.max(
        0.05,
        Math.round(((current[key] / currentOtherSum) * remaining) * 100) / 100
      );
      next[key] = scaled;
      assignedOther += scaled;
    } else {
      next[key] = Math.max(
        0.05,
        Math.round((remaining - assignedOther) * 100) / 100
      );
    }
  });

  const finalSum = next.w1 + next.w2 + next.w3 + next.w4;
  if (Math.abs(finalSum - 1) > 1e-6) {
    const diff = Math.round((1 - finalSum) * 100) / 100;
    const adjustKey = otherKeys[0];
    next[adjustKey] = Math.max(0.05, Math.round((next[adjustKey] + diff) * 100) / 100);
  }

  return next;
}

export interface UseSuggestionsResult {
  suggestions: Action[];
  scoredActions: ScoredActionBreakdown[];
  isColdStart: boolean;
  isComputing: boolean;
  weights: SuggestionWeights;
  sequenceSuggestions: ActionSequenceSuggestion[];
  habitInsights: ActionHabitInsight[];
  bracketStats: TimeBracketStat[];
  now: Date;
  adjustWeight: (key: keyof SuggestionWeights, delta: number) => void;
  resetWeights: () => void;
  recomputeSuggestions: () => void;
}

export function useSuggestions(): UseSuggestionsResult {
  const showToast = useUIStore((state) => state.showToast);
  const { activeActions } = useActions();
  const { recentEvents, allEvents, todayEvents } = useEvents();

  const suggestions = useSuggestionStore((state) => state.suggestions);
  const isComputing = useSuggestionStore((state) => state.isComputing);
  const computeSuggestions = useSuggestionStore(
    (state) => state.computeSuggestions
  );

  const [weights, setWeights] = useState<SuggestionWeights>(() =>
    readInitialWeights()
  );
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    weightsListeners.add(setWeights);
    const fresh = getSettings().suggestion_weights;
    broadcastWeights(fresh);

    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => {
      weightsListeners.delete(setWeights);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    computeSuggestions(activeActions, recentEvents, weights, now);
  }, [activeActions, recentEvents, weights, now, computeSuggestions]);

  const scoredActions = useMemo(
    () => scoreActionsWithBreakdown(activeActions, recentEvents, weights, now),
    [activeActions, recentEvents, weights, now]
  );

  const isColdStart = useMemo(
    () => isColdStartEvents(recentEvents, now),
    [recentEvents, now]
  );

  const lastTodayActionId = todayEvents[0]?.action_id ?? null;

  const sequenceSuggestions = useMemo(
    () =>
      computeNextActionSequences(
        activeActions,
        allEvents,
        lastTodayActionId,
        4
      ),
    [activeActions, allEvents, lastTodayActionId]
  );

  const habitInsights = useMemo(
    () => computeHabitInsights(activeActions, allEvents, now),
    [activeActions, allEvents, now]
  );

  const bracketStats = useMemo(
    () => computeTimeBracketDistribution(allEvents),
    [allEvents]
  );

  const displayedSuggestions = useMemo(() => {
    if (suggestions.length > 0) {
      return suggestions;
    }
    return scoredActions
      .slice(0, TOP_SUGGESTIONS_COUNT)
      .map((entry) => entry.action);
  }, [suggestions, scoredActions]);

  const adjustWeight = useCallback(
    (key: keyof SuggestionWeights, delta: number) => {
      try {
        const nextWeights = adjustAndNormalizeWeights(weights, key, delta);
        const saved = saveSettings({ suggestion_weights: nextWeights });
        broadcastWeights(saved.suggestion_weights);
      } catch (error: unknown) {
        console.error('[1TD][useSuggestions] Failed to save suggestion weights:', error);
        showToast('Không thể lưu cấu hình trọng số gợi ý.');
      }
    },
    [weights, showToast]
  );

  const resetWeights = useCallback(() => {
    try {
      const saved = saveSettings({
        suggestion_weights: { ...DEFAULT_SUGGESTION_WEIGHTS },
      });
      broadcastWeights(saved.suggestion_weights);
      showToast('Đã đặt lại trọng số gợi ý về mặc định.');
    } catch (error: unknown) {
      console.error('[1TD][useSuggestions] Failed to reset suggestion weights:', error);
      showToast('Không thể đặt lại trọng số gợi ý.');
    }
  }, [showToast]);

  const recomputeSuggestions = useCallback(() => {
    const freshNow = new Date();
    const freshWeights = getSettings().suggestion_weights;
    broadcastWeights(freshWeights);
    setNow(freshNow);
    computeSuggestions(activeActions, recentEvents, freshWeights, freshNow);
  }, [activeActions, recentEvents, computeSuggestions]);

  return {
    suggestions: displayedSuggestions,
    scoredActions,
    isColdStart,
    isComputing,
    weights,
    sequenceSuggestions,
    habitInsights,
    bracketStats,
    now,
    adjustWeight,
    resetWeights,
    recomputeSuggestions,
  };
}
