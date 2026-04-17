import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import type { CreateCustomServiceInput, ServiceMoveDirection, ServiceRecord } from '@amberkeeper/shared-types';
import {
  GripVertical,
  Eye,
  EyeOff,
  Plus,
  Archive,
  ArchiveX,
  Trash2,
  X,
  Globe,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { IconButton } from '@/components/ui/icon-button';
import { ServiceIcon } from '../components/ServiceIcon';
import {
  CUSTOM_SERVICE_PRESET_ICONS,
  type CustomServicePresetIconId,
  encodeCustomServicePresetIcon,
} from '../lib/custom-service-preset-icon';
import { normalizeServiceUrl } from '../../../shared/service-url';

export function ServicesPage(props: {
  services: ServiceRecord[];
  activeServiceId: string | null;
  onSelectService: (serviceId: string) => void;
  onToggleService: (serviceId: string, enabled: boolean) => void;
  onToggleProviderCache: (providerId: NonNullable<ServiceRecord['providerId']>, enabled: boolean) => void;
  onMoveService: (
    serviceId: string,
    direction: ServiceMoveDirection
  ) => Promise<void> | void;
  onAddCustomService: (input: CreateCustomServiceInput) => Promise<void> | void;
  onDeleteCustomService: (serviceId: string) => Promise<void> | void;
  onResolvedCustomIcon?: (serviceId: string, iconUrl: string) => void;
}) {
  const [draggingServiceId, setDraggingServiceId] = useState<string | null>(null);
  const [dropTargetServiceId, setDropTargetServiceId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [previewIconUrl, setPreviewIconUrl] = useState<string | null>(null);
  const [selectedPresetIcon, setSelectedPresetIcon] = useState<CustomServicePresetIconId | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selectedPresetIcon) {
        setLogoLoading(false);
        return;
      }

      if (!draftUrl.trim()) {
        setPreviewIconUrl(null);
        setLogoLoading(false);
        return;
      }

      const normalizedUrl = normalizeServiceUrl(draftUrl);
      if (!normalizedUrl) {
        setPreviewIconUrl(null);
        setLogoLoading(false);
        return;
      }

      setLogoLoading(true);
      void (async () => {
        try {
          const nextPreview =
            (await window.captureApi?.discoverSiteIcon?.(normalizedUrl)) ?? null;
          setPreviewIconUrl(nextPreview);
        } finally {
          setLogoLoading(false);
        }
      })();
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftUrl, selectedPresetIcon]);

  function startDragging(serviceId: string, event: DragEvent<HTMLElement>) {
    event.dataTransfer.setData('text/service-id', serviceId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingServiceId(serviceId);
  }

  async function reorderService(sourceServiceId: string, targetServiceId: string) {
    if (sourceServiceId === targetServiceId) {
      return;
    }

    const sourceIndex = props.services.findIndex((service) => service.id === sourceServiceId);
    const targetIndex = props.services.findIndex((service) => service.id === targetServiceId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const direction: ServiceMoveDirection = sourceIndex < targetIndex ? 'down' : 'up';
    const moveCount = Math.abs(targetIndex - sourceIndex);

    setReordering(true);
    try {
      for (let index = 0; index < moveCount; index += 1) {
        await props.onMoveService(sourceServiceId, direction);
      }
    } finally {
      setReordering(false);
      setDraggingServiceId(null);
      setDropTargetServiceId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = normalizeServiceUrl(draftUrl);
    if (!draftName.trim()) {
      setDraftError('请输入服务名称。');
      return;
    }
    if (!normalizedUrl) {
      setDraftError('请输入有效的服务地址。');
      return;
    }

    await props.onAddCustomService({
      name: draftName.trim(),
      url: normalizedUrl,
      iconUrl:
        previewIconUrl ??
        (selectedPresetIcon ? encodeCustomServicePresetIcon(selectedPresetIcon) : undefined),
    });
    setDraftName('');
    setDraftUrl('');
    setDraftError(null);
    setPreviewIconUrl(null);
    setSelectedPresetIcon(null);
    setShowAddDialog(false);
  }

  return (
    <div className="flex flex-col gap-10 py-2">
      <Section
        title="服务管理"
        description="管理已接入的 AI 服务，拖拽调整顺序。"
        actions={
          <Button type="button" onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4 mr-2" />添加服务
          </Button>
        }
      >
        <ol className="space-y-2" aria-label="服务列表">
          {props.services.map((service) => {
            const isDragging = draggingServiceId === service.id;
            const isDropTarget = dropTargetServiceId === service.id;
            const isActive = service.id === props.activeServiceId;

            return (
              <li
                key={service.id}
                data-service-id={service.id}
                draggable={!reordering}
                onDragStart={(event) => startDragging(service.id, event)}
                onDragEnd={() => {
                  setDraggingServiceId(null);
                  setDropTargetServiceId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!reordering) {
                    setDropTargetServiceId(service.id);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetServiceId === service.id) {
                    setDropTargetServiceId(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData('text/service-id');
                  if (sourceId) {
                    void reorderService(sourceId, service.id);
                  }
                }}
              >
                <Card
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-all duration-150 cursor-grab active:cursor-grabbing',
                    isActive && 'ring-2 ring-primary/30 bg-primary/5',
                    isDragging && 'opacity-50 scale-[0.98]',
                    isDropTarget && 'border-t-2 border-t-primary',
                    !service.enabled && 'opacity-60'
                  )}
                >
                  <GripVertical className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />

                  <ServiceIcon
                    service={service}
                    className="size-8 shrink-0"
                    onResolvedCandidate={(candidateUrl) => {
                      if (service.kind === 'custom') {
                        props.onResolvedCustomIcon?.(service.id, candidateUrl);
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-pressed={isActive}
                    aria-label={isActive ? `当前服务 ${service.name}` : `切换到 ${service.name}`}
                    onClick={() => props.onSelectService(service.id)}
                  >
                    <div className="text-sm font-semibold text-foreground truncate">{service.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{service.displayUrl}</div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {service.providerId ? (
                      <IconButton
                        label={
                          service.cacheEnabled !== false
                            ? `关闭 ${service.name} 本地缓存`
                            : `开启 ${service.name} 本地缓存`
                        }
                        onClick={() =>
                          props.onToggleProviderCache(service.providerId!, service.cacheEnabled === false)
                        }
                        className={cn(service.cacheEnabled === false && 'text-muted-foreground opacity-40')}
                      >
                        {service.cacheEnabled !== false ? (
                          <Archive className="size-4" />
                        ) : (
                          <ArchiveX className="size-4" />
                        )}
                      </IconButton>
                    ) : null}

                    <IconButton
                      label={service.enabled ? `停用 ${service.name}` : `启用 ${service.name}`}
                      onClick={() => props.onToggleService(service.id, !service.enabled)}
                    >
                      {service.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </IconButton>

                    {service.kind === 'custom' ? (
                      <IconButton
                        label={`删除 ${service.name}`}
                        onClick={() => props.onDeleteCustomService(service.id)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </Section>

      {showAddDialog ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 px-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="添加自定义服务"
            className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">添加自定义服务</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  自定义服务会出现在左侧服务栏，但不会进入本地采集、历史或导出链路。
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                aria-label="关闭添加服务"
                onClick={() => {
                  setShowAddDialog(false);
                  setDraftError(null);
                }}
              >
                <X className="size-4" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">服务名称</span>
                <input
                  aria-label="服务名称"
                  placeholder="例如：My AI Chat"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="w-full rounded-lg border border-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">服务地址</span>
                <input
                  aria-label="服务地址"
                  placeholder="例如：https://chat.example.com"
                  value={draftUrl}
                  onChange={(event) => setDraftUrl(event.target.value)}
                  className="w-full rounded-lg border border-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-foreground">图标预览</span>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {logoLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : previewIconUrl ? (
                      <img src={previewIconUrl} alt="Logo" className="h-8 w-8 object-contain" />
                    ) : selectedPresetIcon ? (
                      (() => {
                        const preset = CUSTOM_SERVICE_PRESET_ICONS.find(
                          (item) => item.id === selectedPresetIcon
                        );
                        if (!preset) {
                          return <Globe className="h-6 w-6 text-muted-foreground" />;
                        }

                        const IconComponent = preset.Icon;
                        return <IconComponent className="h-6 w-6 text-primary" />;
                      })()
                    ) : (
                      <Globe className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  <p className="flex-1 text-xs text-muted-foreground">
                    {logoLoading
                      ? '正在获取图标...'
                      : previewIconUrl
                        ? '已从网站获取图标'
                        : '输入地址后自动获取，或选择预设图标'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-foreground">预设图标</span>
                <div className="grid grid-cols-7 gap-2">
                  {CUSTOM_SERVICE_PRESET_ICONS.map((preset) => {
                    const IconComponent = preset.Icon;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-lg border transition-all hover:border-primary/50',
                          selectedPresetIcon === preset.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-muted/30'
                        )}
                        onClick={() => {
                          setSelectedPresetIcon(preset.id);
                          setPreviewIconUrl(null);
                        }}
                        title={preset.label}
                        aria-label={preset.label}
                      >
                        <IconComponent
                          className={cn(
                            'h-5 w-5',
                            selectedPresetIcon === preset.id
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {draftError ? <p className="text-sm text-destructive">{draftError}</p> : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowAddDialog(false);
                    setDraftError(null);
                    setPreviewIconUrl(null);
                    setSelectedPresetIcon(null);
                  }}
                >
                  取消
                </Button>
                <Button type="submit">保存</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
