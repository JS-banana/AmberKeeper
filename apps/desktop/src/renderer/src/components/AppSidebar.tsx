import { startTransition, type CSSProperties } from 'react';
import type { ProviderId, ProviderRecord } from '@amberkeeper/shared-types';
import { getProviderBranding } from '../lib/provider-branding';
import { ProviderIcon } from './ProviderIcon';

export type AppSurfaceId = 'chat' | 'library' | 'settings' | 'diagnostics';

export function AppSidebar(props: {
  providers: ProviderRecord[];
  activeProviderId: ProviderId | null;
  activeSurface: AppSurfaceId;
  onSelectProvider: (providerId: ProviderId) => void;
  onOpenUtility: () => void;
}) {
  const enabledProviders = props.providers.filter((provider) => provider.enabled);

  return (
    <aside className="product-rail">
      <nav className="product-rail__top product-rail__providers" aria-label="应用列表">
        {enabledProviders.map((provider) => {
          const isActive = props.activeSurface === 'chat' && provider.id === props.activeProviderId;
          const branding = getProviderBranding(provider.id);

          return (
            <button
              key={provider.id}
              type="button"
              aria-label={`打开 ${provider.name}`}
              aria-pressed={isActive}
              className={isActive ? 'rail-button rail-button--provider active' : 'rail-button rail-button--provider'}
              style={
                {
                  '--rail-provider-accent': branding.brandColor,
                  '--rail-provider-tint': branding.railTint,
                  '--rail-provider-active-tint': branding.railActiveTint,
                } as CSSProperties
              }
              onClick={() => {
                startTransition(() => {
                  props.onSelectProvider(provider.id);
                });
              }}
            >
              <ProviderIcon
                providerId={provider.id}
                providerName={provider.name}
                homeUrl={provider.homeUrl}
                variant="rail"
              />
            </button>
          );
        })}
      </nav>

      <nav className="product-rail__nav" aria-label="工作台入口">
        <button
          type="button"
          aria-label="打开工作台"
          aria-pressed={props.activeSurface !== 'chat'}
          className={
            props.activeSurface !== 'chat'
              ? 'rail-button rail-button--utility active'
              : 'rail-button rail-button--utility'
          }
          onClick={() => {
            startTransition(() => {
              props.onOpenUtility();
            });
          }}
        >
          <RailGlyph kind="settings" />
        </button>
      </nav>
    </aside>
  );
}

function RailGlyph(props: {
  kind: 'library' | 'settings' | 'diagnostics';
}) {
  switch (props.kind) {
    case 'settings':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="rail-glyph">
          <path d="M4 6h8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M16 6h4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M4 12h4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M12 12h8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M4 18h10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M18 18h2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="12" cy="6" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="10" cy="12" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="16" cy="18" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case 'diagnostics':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="rail-glyph">
          <path
            d="M5.5 17.5h13M7.5 14.25h2.75v3.25H7.5zM11.25 10h2.75v7.5h-2.75zM15 6.75h2.75v10.75H15z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'library':
      return null;
  }
}
