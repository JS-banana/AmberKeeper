import { useState, type DragEvent } from 'react';
import type {
  InterfaceLanguage,
  ProviderMoveDirection,
  ProviderRecord,
  ShellInfo,
} from '@amberkeeper/shared-types';
import { GripVertical, Eye, EyeOff, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Section } from '@/components/ui/section';
import { IconButton } from '@/components/ui/icon-button';
import { ProviderIcon } from '../components/ProviderIcon';

const LANGUAGE_OPTIONS: Array<{ value: InterfaceLanguage; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

export function SettingsPage(props: {
  shellInfo: ShellInfo | null;
  providers: ProviderRecord[];
  activeProviderId: string | null;
  onSetInterfaceLanguage: (language: InterfaceLanguage) => Promise<void> | void;
  onSelectProvider: (providerId: ProviderRecord['id']) => void;
  onToggleProvider: (providerId: ProviderRecord['id'], enabled: boolean) => void;
  onToggleProviderCache: (providerId: ProviderRecord['id'], enabled: boolean) => void;
  onMoveProvider: (
    providerId: ProviderRecord['id'],
    direction: ProviderMoveDirection
  ) => Promise<void> | void;
}) {
  const [draggingProviderId, setDraggingProviderId] = useState<ProviderRecord['id'] | null>(null);
  const [dropTargetProviderId, setDropTargetProviderId] = useState<ProviderRecord['id'] | null>(null);
  const [reordering, setReordering] = useState(false);

  function startDragging(providerId: ProviderRecord['id'], event: DragEvent<HTMLElement>) {
    event.dataTransfer.setData('text/provider-id', providerId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingProviderId(providerId);
  }

  async function reorderProvider(
    sourceProviderId: ProviderRecord['id'],
    targetProviderId: ProviderRecord['id']
  ) {
    if (sourceProviderId === targetProviderId) return;
    const sourceIndex = props.providers.findIndex((p) => p.id === sourceProviderId);
    const targetIndex = props.providers.findIndex((p) => p.id === targetProviderId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const direction: ProviderMoveDirection = sourceIndex < targetIndex ? 'down' : 'up';
    const moveCount = Math.abs(targetIndex - sourceIndex);

    setReordering(true);
    try {
      for (let i = 0; i < moveCount; i += 1) {
        await props.onMoveProvider(sourceProviderId, direction);
      }
    } finally {
      setReordering(false);
      setDraggingProviderId(null);
      setDropTargetProviderId(null);
    }
  }

  return (
    <div className="flex flex-col gap-10 max-w-3xl py-2">
      {/* --- 服务管理 --- */}
      <Section
        title="服务管理"
        description="管理已接入的 AI 服务，拖拽调整顺序。"
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button disabled className="opacity-50">
                <Plus className="size-4 mr-2" />添加服务
              </Button>
            </TooltipTrigger>
            <TooltipContent>即将支持自定义 Provider</TooltipContent>
          </Tooltip>
        }
      >
        <ol className="space-y-2" aria-label="服务列表">
          {props.providers.map((provider) => {
            const isDragging = draggingProviderId === provider.id;
            const isDropTarget = dropTargetProviderId === provider.id;
            const isActive = provider.id === props.activeProviderId;

            return (
              <li
                key={provider.id}
                draggable={!reordering}
                onDragStart={(e) => startDragging(provider.id, e)}
                onDragEnd={() => { setDraggingProviderId(null); setDropTargetProviderId(null); }}
                onDragOver={(e) => { e.preventDefault(); if (!reordering) setDropTargetProviderId(provider.id); }}
                onDragLeave={() => { if (dropTargetProviderId === provider.id) setDropTargetProviderId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData('text/provider-id') as ProviderRecord['id'];
                  if (sourceId) void reorderProvider(sourceId, provider.id);
                }}
              >
                <Card
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-all duration-150 cursor-grab active:cursor-grabbing',
                    isActive && 'ring-2 ring-primary/30 bg-primary/5',
                    isDragging && 'opacity-50 scale-[0.98]',
                    isDropTarget && 'border-t-2 border-t-primary',
                    !provider.enabled && 'opacity-60'
                  )}
                >
                  <GripVertical className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />

                  <ProviderIcon
                    providerId={provider.id}
                    providerName={provider.name}
                    homeUrl={provider.homeUrl}
                    className="size-8 shrink-0"
                  />

                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-pressed={isActive}
                    aria-label={isActive ? `当前服务 ${provider.name}` : `切换到 ${provider.name}`}
                    onClick={() => props.onSelectProvider(provider.id)}
                  >
                    <div className="text-sm font-semibold text-foreground truncate">{provider.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{provider.homeUrl}</div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={provider.cacheEnabled}
                      onCheckedChange={(checked) => props.onToggleProviderCache(provider.id, checked)}
                      aria-label={`${provider.name} 本地缓存`}
                    />

                    <IconButton
                      label={provider.enabled ? `停用 ${provider.name}` : `启用 ${provider.name}`}
                      onClick={() => props.onToggleProvider(provider.id, !provider.enabled)}
                    >
                      {provider.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </IconButton>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* --- 外观与语言 --- */}
      <Section title="外观与语言">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-foreground" id="lang-label">
            界面语言
          </label>
          <Select
            value={props.shellInfo?.interfaceLanguage ?? 'system'}
            onValueChange={(value) => {
              void props.onSetInterfaceLanguage(value as InterfaceLanguage);
            }}
          >
            <SelectTrigger className="w-48" aria-labelledby="lang-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>
    </div>
  );
}
