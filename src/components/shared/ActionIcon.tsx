import React from 'react';
import {
  Activity,
  Bed,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  CheckCircle2,
  Clock,
  Code,
  Coffee,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Headphones,
  Heart,
  Leaf,
  LucideIcon,
  Moon,
  Music,
  PenTool,
  Pill,
  ShoppingBag,
  Smile,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Tv,
  Users,
  Utensils,
  Zap,
} from 'lucide-react';
import { ACTION_PRESET_HEX_MAP, ActionPresetColor } from '../../types';

export const ACTION_ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Coffee,
  Utensils,
  Droplets,
  Briefcase,
  BookOpen,
  Dumbbell,
  Heart,
  Pill,
  Brain,
  Code,
  Music,
  Footprints,
  Bike,
  Bed,
  Smile,
  CheckCircle2,
  Clock,
  Flame,
  Sparkles,
  Leaf,
  Headphones,
  PenTool,
  ShoppingBag,
  Tv,
  Users,
  Zap,
};

export const ACTION_ICON_NAMES = Object.keys(ACTION_ICON_MAP);

export interface ActionIconProps {
  name: string;
  size?: number;
  className?: string;
}

export const ActionIcon: React.FC<ActionIconProps> = ({
  name,
  size = 18,
  className,
}) => {
  const IconComponent = ACTION_ICON_MAP[name.trim()] ?? Activity;
  return <IconComponent size={size} className={className} aria-hidden="true" />;
};

/**
 * Resolves an Action color key or Event color snapshot into a semantic token CSS modifier class.
 */
export function getAccentClassName(color: string): string {
  const normalized = color.trim().toLowerCase();

  if (
    normalized === 'terracotta' ||
    normalized === ACTION_PRESET_HEX_MAP.terracotta.toLowerCase()
  ) {
    return 'accent-terracotta';
  }
  if (
    normalized === 'lavender' ||
    normalized === ACTION_PRESET_HEX_MAP.lavender.toLowerCase()
  ) {
    return 'accent-lavender';
  }
  if (
    normalized === 'mint' ||
    normalized === ACTION_PRESET_HEX_MAP.mint.toLowerCase()
  ) {
    return 'accent-mint';
  }

  return 'accent-chartreuse';
}

export function resolvePresetLabel(color: string): ActionPresetColor {
  const cls = getAccentClassName(color);
  if (cls === 'accent-terracotta') return 'terracotta';
  if (cls === 'accent-lavender') return 'lavender';
  if (cls === 'accent-mint') return 'mint';
  return 'chartreuse';
}
