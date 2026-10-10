import React, { useMemo, useState } from 'react';
import { ACTION_ICON_NAMES, ActionIcon } from './ActionIcon';

export interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  actionNameHint?: string;
}

const ICON_KEYWORDS: Record<string, ReadonlyArray<string>> = {
  Sunrise: ['ngủ dậy', 'thức dậy', 'sáng', 'bình minh', 'wake', 'morning'],
  Sun: ['ban ngày', 'nắng', 'trưa', 'sun', 'day'],
  Sunset: ['chiều', 'hoàng hôn', 'tan làm', 'sunset', 'evening'],
  Moon: ['đi ngủ', 'ngủ', 'đêm', 'tối', 'sleep', 'night'],
  Coffee: ['cà phê', 'trà', 'cafe', 'coffee', 'tea'],
  Utensils: ['ăn', 'bữa', 'cơm', 'ăn sáng', 'ăn trưa', 'ăn tối', 'meal', 'food'],
  Droplets: ['uống nước', 'nước', 'water', 'hydrate', 'tắm'],
  Briefcase: ['làm việc', 'công việc', 'họp', 'work', 'office'],
  BookOpen: ['đọc', 'sách', 'học', 'ôn tập', 'read', 'study', 'book'],
  Dumbbell: ['tập', 'gym', 'thể dục', 'thể thao', 'workout', 'fitness'],
  Heart: ['sức khỏe', 'yêu thương', 'chăm sóc', 'health', 'care'],
  Pill: ['thuốc', 'vitamin', 'uống thuốc', 'medicine', 'supplement'],
  Brain: ['thiền', 'suy ngẫm', 'tập trung', 'focus', 'meditate'],
  Code: ['code', 'lập trình', 'dev', 'máy tính'],
  Music: ['nhạc', 'đàn', 'nghe nhạc', 'music'],
  Footprints: ['đi bộ', 'chạy bộ', 'dạo', 'walk', 'run', 'steps'],
  Bike: ['đạp xe', 'xe đạp', 'bike', 'cycle'],
  Bed: ['nghỉ trưa', 'nằm nghỉ', 'chợp mắt', 'nap', 'rest'],
  Smile: ['vui', 'tâm trạng', 'cảm xúc', 'mood', 'relax'],
  CheckCircle2: ['hoàn thành', 'xong', 'việc cần làm', 'done', 'task'],
  Clock: ['hẹn giờ', 'pomodoro', 'thời gian', 'timer'],
  Flame: ['năng lượng', 'calo', 'nấu ăn', 'cook', 'burn'],
  Sparkles: ['dọn dẹp', 'vệ sinh', 'chăm sóc da', 'skincare', 'clean'],
  Leaf: ['thiên nhiên', 'cây', 'thư giãn', 'nature', 'plant'],
  Headphones: ['podcast', 'nghe', 'audio', 'listen'],
  PenTool: ['viết', 'nhật ký', 'vẽ', 'ghi chép', 'write', 'journal'],
  ShoppingBag: ['mua sắm', 'đi chợ', 'chi tiêu', 'shop', 'market'],
  Tv: ['xem phim', 'giải trí', 'tv', 'movie'],
  Users: ['gặp gỡ', 'bạn bè', 'gia đình', 'social', 'family'],
  Zap: ['nhanh', 'năng suất', 'tăng tốc', 'energy'],
  Activity: ['hoạt động', 'nhịp', 'theo dõi', 'activity'],
};

/**
 * Infers the best matching Lucide icon name from an action name string (BLUEPRINT.md § III.3).
 */
export function inferIconFromActionName(actionName: string): string | null {
  const normalized = actionName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const iconName of ACTION_ICON_NAMES) {
    const keywords = ICON_KEYWORDS[iconName] ?? [];
    if (
      iconName.toLowerCase() === normalized ||
      keywords.some((kw) => normalized.includes(kw))
    ) {
      return iconName;
    }
  }
  return null;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  actionNameHint = '',
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const suggestedIcon = useMemo(
    () => inferIconFromActionName(actionNameHint),
    [actionNameHint]
  );

  const filteredIcons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const baseList = ACTION_ICON_NAMES.filter((iconName) => {
      if (!query) return true;
      const keywords = ICON_KEYWORDS[iconName] ?? [];
      return (
        iconName.toLowerCase().includes(query) ||
        keywords.some((kw) => kw.includes(query))
      );
    });

    if (suggestedIcon && baseList.includes(suggestedIcon)) {
      return [
        suggestedIcon,
        ...baseList.filter((item) => item !== suggestedIcon),
      ];
    }
    return baseList;
  }, [searchQuery, suggestedIcon]);

  return (
    <div className="icon-picker" role="group" aria-label="Chọn biểu tượng hành động">
      <div className="library-search-row">
        <div className="ledger-input-wrap">
          <input
            type="search"
            className="ledger-input"
            value={searchQuery}
            placeholder="Tìm biểu tượng (vd: cà phê, ngủ, sách, tập)..."
            aria-label="Tìm kiếm biểu tượng hành động"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        {suggestedIcon && (
          <button
            type="button"
            className="shell-ghost-btn"
            aria-label={`Dùng biểu tượng gợi ý theo tên: ${suggestedIcon}`}
            onClick={() => onChange(suggestedIcon)}
          >
            <ActionIcon name={suggestedIcon} size={15} />
            <span>Gợi ý: {suggestedIcon}</span>
          </button>
        )}
      </div>

      <div className="icon-picker-grid">
        {filteredIcons.map((iconName) => {
          const isSelected = value === iconName;
          const isSuggested = suggestedIcon === iconName;

          return (
            <button
              key={iconName}
              type="button"
              className="icon-picker-cell"
              aria-pressed={isSelected}
              aria-label={`Chọn biểu tượng ${iconName}${
                isSuggested ? ' (gợi ý phù hợp tên)' : ''
              }`}
              onClick={() => onChange(iconName)}
            >
              <ActionIcon name={iconName} size={18} />
              <span className="type-mono-badge">{iconName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default IconPicker;
