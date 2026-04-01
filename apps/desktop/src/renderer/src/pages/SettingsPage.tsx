import type { ProviderMoveDirection, ProviderRecord } from '@amberkeeper/shared-types';

export function SettingsPage(props: {
  providers: ProviderRecord[];
  activeProviderId: string | null;
  onSelectProvider: (providerId: ProviderRecord['id']) => void;
  onToggleProvider: (providerId: ProviderRecord['id'], enabled: boolean) => void;
  onMoveProvider: (providerId: ProviderRecord['id'], direction: ProviderMoveDirection) => void;
}) {
  return (
    <section className="utility-page">
      <header className="utility-page__header">
        <div>
          <p className="utility-page__eyebrow">设置</p>
          <h1>应用设置</h1>
        </div>
        <p className="utility-page__copy">
          AmberKeeper 当前只提供已完成抓取链路适配的内置应用。你可以在这里启用、停用和调整顺序，
          但暂不支持用户自行添加任意 chat。
        </p>
      </header>

      <ol className="settings-list" aria-label="内置应用列表">
        {props.providers.map((provider, index) => (
          <li key={provider.id} className="settings-item" data-provider-id={provider.id}>
            <div className="settings-item__meta">
              <div>
                <strong>{provider.name}</strong>
                <p>{provider.homeUrl}</p>
              </div>
              <div className="settings-item__badges">
                {provider.id === props.activeProviderId ? <span className="settings-badge">当前使用</span> : null}
                <span className={provider.enabled ? 'settings-badge settings-badge--enabled' : 'settings-badge settings-badge--disabled'}>
                  {provider.enabled ? '已启用' : '已停用'}
                </span>
              </div>
            </div>

            <div className="settings-item__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => props.onSelectProvider(provider.id)}
              >
                打开 {provider.name}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => props.onToggleProvider(provider.id, !provider.enabled)}
              >
                {provider.enabled ? `停用 ${provider.name}` : `启用 ${provider.name}`}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={index === 0}
                onClick={() => props.onMoveProvider(provider.id, 'up')}
              >
                {provider.name} 上移
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={index === props.providers.length - 1}
                onClick={() => props.onMoveProvider(provider.id, 'down')}
              >
                {provider.name} 下移
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
