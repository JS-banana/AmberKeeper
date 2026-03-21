import type { ProviderId, ProviderRecord } from '@amberkeeper/shared-types';

export function ProviderRail(props: {
  providers: ProviderRecord[];
  activeProviderId: ProviderId | null;
  onSelect: (providerId: ProviderId) => void;
  onToggleEnabled: (providerId: ProviderId, enabled: boolean) => void;
}) {
  return (
    <article className="workspace-card workspace-card--rail">
      <div className="section-header section-header--tight">
        <h2>Provider Rail</h2>
        <span className="panel-count">{props.providers.length}</span>
      </div>

      <ul className="provider-rail" aria-label="Built-in providers">
        {props.providers.map((provider) => {
          const isActive = provider.id === props.activeProviderId;

          return (
            <li key={provider.id} className={isActive ? 'provider-item active' : 'provider-item'}>
              <button
                aria-pressed={isActive}
                aria-label={`Open ${provider.name}`}
                className="provider-item__select"
                disabled={!provider.enabled}
                type="button"
                onClick={() => {
                  props.onSelect(provider.id);
                }}
              >
                <span className="provider-item__name">{provider.name}</span>
                <span className="provider-item__meta">
                  {provider.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </button>

              <button
                aria-label={`${provider.enabled ? 'Disable' : 'Enable'} ${provider.name}`}
                className="provider-item__toggle"
                type="button"
                onClick={() => {
                  props.onToggleEnabled(provider.id, !provider.enabled);
                }}
              >
                {provider.enabled ? 'Disable' : 'Enable'}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
