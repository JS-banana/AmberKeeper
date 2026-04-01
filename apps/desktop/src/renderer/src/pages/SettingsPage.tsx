import { useState, type DragEvent, type ReactNode } from 'react';
import type { ProviderMoveDirection, ProviderRecord } from '@amberkeeper/shared-types';

export function SettingsPage(props: {
  providers: ProviderRecord[];
  activeProviderId: string | null;
  onSelectProvider: (providerId: ProviderRecord['id']) => void;
  onToggleProvider: (providerId: ProviderRecord['id'], enabled: boolean) => void;
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
    if (sourceProviderId === targetProviderId) {
      return;
    }

    const sourceIndex = props.providers.findIndex((provider) => provider.id === sourceProviderId);
    const targetIndex = props.providers.findIndex((provider) => provider.id === targetProviderId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const direction: ProviderMoveDirection = sourceIndex < targetIndex ? 'down' : 'up';
    const moveCount = Math.abs(targetIndex - sourceIndex);

    setReordering(true);
    try {
      for (let index = 0; index < moveCount; index += 1) {
        await props.onMoveProvider(sourceProviderId, direction);
      }
    } finally {
      setReordering(false);
      setDraggingProviderId(null);
      setDropTargetProviderId(null);
    }
  }

  return (
    <section className="utility-page utility-page--scroll">
      <header className="utility-page__header utility-page__header--compact">
        <h1>服务管理</h1>
      </header>

      <ol className="settings-list" aria-label="内置应用列表">
        {props.providers.map((provider) => {
          const isDragging = draggingProviderId === provider.id;
          const isDropTarget = dropTargetProviderId === provider.id;

          return (
            <li
              key={provider.id}
              className={[
                'settings-item',
                isDropTarget ? 'settings-item--drop-target' : '',
                isDragging ? 'settings-item--dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-provider-id={provider.id}
              draggable={!reordering}
              onDragStart={(event) => {
                startDragging(provider.id, event);
              }}
              onDragEnd={() => {
                setDraggingProviderId(null);
                setDropTargetProviderId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!reordering) {
                  setDropTargetProviderId(provider.id);
                }
              }}
              onDragLeave={() => {
                if (dropTargetProviderId === provider.id) {
                  setDropTargetProviderId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceProviderId = event.dataTransfer.getData(
                  'text/provider-id'
                ) as ProviderRecord['id'];

                if (!sourceProviderId) {
                  return;
                }

                void reorderProvider(sourceProviderId, provider.id);
              }}
            >
              <span className="settings-drag-handle" aria-hidden="true">
                <GripIcon />
              </span>

              <div className="settings-item__meta">
                <div className="settings-item__title">
                  <div className="settings-item__summary">
                    <div className="settings-item__headline">
                      <strong>{provider.name}</strong>

                      <div className="settings-item__badges">
                        {provider.id === props.activeProviderId ? (
                          <span className="settings-badge">当前使用</span>
                        ) : null}
                        <span
                          className={
                            provider.enabled
                              ? 'settings-badge settings-badge--enabled'
                              : 'settings-badge settings-badge--disabled'
                          }
                        >
                          {provider.enabled ? '已启用' : '已停用'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-item__actions">
                  <IconButton
                    label={`打开 ${provider.name}`}
                    onClick={() => props.onSelectProvider(provider.id)}
                  >
                    <ArrowRightIcon />
                  </IconButton>
                  <IconButton
                    label={provider.enabled ? `停用 ${provider.name}` : `启用 ${provider.name}`}
                    active={provider.enabled}
                    onClick={() => props.onToggleProvider(provider.id, !provider.enabled)}
                  >
                    {provider.enabled ? <VisibleIcon /> : <HiddenIcon />}
                  </IconButton>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function IconButton(props: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={props.active ? 'icon-button icon-button--active' : 'icon-button'}
      type="button"
      aria-label={props.label}
      title={props.label}
      draggable={false}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function GripIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mini-icon">
      <circle cx="9" cy="7" r="1.4" fill="currentColor" />
      <circle cx="15" cy="7" r="1.4" fill="currentColor" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" />
      <circle cx="9" cy="17" r="1.4" fill="currentColor" />
      <circle cx="15" cy="17" r="1.4" fill="currentColor" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mini-icon">
      <path
        d="M8 6.5 14 12l-6 5.5M13.5 12H4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VisibleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mini-icon">
      <path
        d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function HiddenIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mini-icon">
      <path
        d="M3.5 4.5 20.5 19.5M9.2 6.9A10.6 10.6 0 0 1 12 6.5c6.1 0 9.5 5.5 9.5 5.5a17.8 17.8 0 0 1-3.8 4.1M6.6 9.4A17.6 17.6 0 0 0 2.5 12s3.4 5.5 9.5 5.5a10.7 10.7 0 0 0 4-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
