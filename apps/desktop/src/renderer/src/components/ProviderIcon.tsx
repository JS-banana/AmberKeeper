import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { ProviderId } from '@amberkeeper/shared-types';
import { useCachedIcon } from '../hooks/useCachedIcon';
import { getProviderBranding } from '../lib/provider-branding';
import { cn } from '@/lib/cn';

export function ProviderIcon(props: {
  providerId: ProviderId;
  providerName: string;
  homeUrl: string;
  className?: string;
  variant?: 'default' | 'rail';
}) {
  const branding = getProviderBranding(props.providerId);
  const { iconSrc, resolved, onError, onLoad } = useCachedIcon(
    props.providerId,
    props.homeUrl,
    branding.iconUrl,
    {
      preferredCandidates: branding.remoteIconUrls,
    }
  );
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const shouldPreferBundledAsset = props.variant === 'rail' || !resolved || useLocalFallback || !iconSrc;
  const isRail = props.variant === 'rail';

  const containerStyle: CSSProperties = {
    '--provider-brand': branding.brandColor,
    '--provider-badge-tint': branding.badgeTint,
    '--provider-icon-scale': String(branding.iconScale),
    ...(isRail
      ? {}
      : {
          background: `radial-gradient(circle at 28% 24%, rgba(255,255,255,0.94), transparent 62%), linear-gradient(180deg, rgba(255,255,255,0.8), var(--provider-badge-tint))`,
        }),
  } as CSSProperties;

  const containerClassName = cn(
    isRail
      ? 'inline-flex items-center justify-center w-[30px] h-[30px] p-0 shrink-0 rounded-none border-0 bg-transparent shadow-none'
      : 'inline-flex items-center justify-center w-8 h-8 p-1.5 shrink-0 rounded-xl border border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_18px_rgba(95,71,34,0.08)]',
    props.className,
  );

  const content = renderProviderIconVisual({
    providerId: props.providerId,
    providerName: props.providerName,
    branding,
    iconSrc,
    shouldPreferBundledAsset,
    useLocalFallback,
    isRail,
    onLoad,
    onError: () => {
      onError();
      if (!iconSrc) {
        setUseLocalFallback(true);
      }
    },
  });

  return (
    <span
      role="img"
      aria-label={props.providerName}
      data-provider-id={props.providerId}
      data-variant={props.variant ?? 'default'}
      className={containerClassName}
      style={containerStyle}
    >
      <span
        className="inline-flex items-center justify-center w-full h-full"
        style={{ transform: `scale(var(--provider-icon-scale))`, transformOrigin: 'center' }}
      >
        {content}
      </span>
    </span>
  );
}

function renderProviderIconVisual(input: {
  providerId: ProviderId;
  providerName: string;
  branding: ReturnType<typeof getProviderBranding>;
  iconSrc: string | null;
  shouldPreferBundledAsset: boolean;
  useLocalFallback: boolean;
  isRail: boolean;
  onLoad: () => void;
  onError: () => void;
}) {
  if (input.shouldPreferBundledAsset && input.branding.assetMarkup) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center w-full h-full [&>svg]:block [&>svg]:w-full [&>svg]:h-full',
          `provider-icon__visual--${input.providerId}`,
        )}
        dangerouslySetInnerHTML={{ __html: input.branding.assetMarkup }}
      />
    );
  }

  if (input.shouldPreferBundledAsset && input.branding.assetUrl) {
    return (
      <img
        src={input.branding.assetUrl}
        alt=""
        aria-hidden="true"
        className={cn('block w-full h-full object-contain', `provider-icon__visual--${input.providerId}`)}
      />
    );
  }

  if (!input.iconSrc || input.useLocalFallback) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center w-full h-full text-white text-xs font-extrabold bg-[var(--provider-brand)]',
          input.isRail ? 'rounded-[8px]' : 'rounded-[9px]',
          `provider-icon__visual--${input.providerId}`,
        )}
      >
        <span>{input.branding.monogram}</span>
      </span>
    );
  }

  return (
    <img
      src={input.iconSrc}
      alt=""
      aria-hidden="true"
      className={cn('block w-full h-full object-contain', `provider-icon__visual--${input.providerId}`)}
      onLoad={input.onLoad}
      onError={input.onError}
    />
  );
}
