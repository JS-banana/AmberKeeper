import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { ProviderId } from '@amberkeeper/shared-types';
import { useCachedIcon } from '../hooks/useCachedIcon';
import { getProviderBranding } from '../lib/provider-branding';

export function ProviderIcon(props: {
  providerId: ProviderId;
  providerName: string;
  homeUrl: string;
  className?: string;
  variant?: 'default' | 'rail';
}) {
  const branding = getProviderBranding(props.providerId);
  const { iconSrc, resolved, onError, onLoad } = useCachedIcon(props.providerId, props.homeUrl);
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const shouldPreferBundledAsset = props.variant === 'rail' || !resolved || useLocalFallback || !iconSrc;
  const containerClassName = [
    'provider-icon',
    `provider-icon--${props.providerId}`,
    props.variant === 'rail' ? 'provider-icon--rail' : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const containerStyle = {
    '--provider-brand': branding.brandColor,
    '--provider-badge-tint': branding.badgeTint,
    '--provider-icon-scale': String(branding.iconScale),
  } as CSSProperties;

  const content = renderProviderIconVisual({
    providerId: props.providerId,
    providerName: props.providerName,
    branding,
    iconSrc,
    shouldPreferBundledAsset,
    useLocalFallback,
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
      className={containerClassName}
      style={containerStyle}
    >
      <span className="provider-icon__media">{content}</span>
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
  onLoad: () => void;
  onError: () => void;
}) {
  if (input.shouldPreferBundledAsset && input.branding.assetMarkup) {
    return (
      <span
        aria-hidden="true"
        className={`provider-icon__visual provider-icon__visual--inline provider-icon__visual--${input.providerId}`}
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
        className={`provider-icon__visual provider-icon__visual--image provider-icon__visual--${input.providerId}`}
      />
    );
  }

  if (!input.iconSrc || input.useLocalFallback) {
    return (
      <span
        aria-hidden="true"
        className={`provider-icon__visual provider-icon__visual--fallback provider-icon__visual--${input.providerId}`}
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
      className={`provider-icon__visual provider-icon__visual--image provider-icon__visual--${input.providerId}`}
      onLoad={input.onLoad}
      onError={input.onError}
    />
  );
}
