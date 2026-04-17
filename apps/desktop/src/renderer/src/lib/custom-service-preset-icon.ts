import {
  Bot,
  Brain,
  CircleDot,
  Globe,
  MessageSquare,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const CUSTOM_SERVICE_PRESET_ICON_PREFIX = 'amberkeeper:preset-icon:';

export const CUSTOM_SERVICE_PRESET_ICONS = [
  { id: 'message', Icon: MessageSquare, label: '聊天' },
  { id: 'bot', Icon: Bot, label: '机器人' },
  { id: 'brain', Icon: Brain, label: '大脑' },
  { id: 'sparkles', Icon: Sparkles, label: '闪光' },
  { id: 'zap', Icon: Zap, label: '闪电' },
  { id: 'globe', Icon: Globe, label: '地球' },
  { id: 'circle', Icon: CircleDot, label: '圆点' },
] as const satisfies ReadonlyArray<{
  id: string;
  Icon: LucideIcon;
  label: string;
}>;

export type CustomServicePresetIconId = (typeof CUSTOM_SERVICE_PRESET_ICONS)[number]['id'];

export function encodeCustomServicePresetIcon(iconId: CustomServicePresetIconId): string {
  return `${CUSTOM_SERVICE_PRESET_ICON_PREFIX}${iconId}`;
}

export function decodeCustomServicePresetIcon(iconUrl: string | null | undefined): {
  id: CustomServicePresetIconId;
  Icon: LucideIcon;
  label: string;
} | null {
  if (!iconUrl?.startsWith(CUSTOM_SERVICE_PRESET_ICON_PREFIX)) {
    return null;
  }

  const iconId = iconUrl.slice(CUSTOM_SERVICE_PRESET_ICON_PREFIX.length);
  return (
    CUSTOM_SERVICE_PRESET_ICONS.find((preset) => preset.id === iconId) ?? null
  );
}
