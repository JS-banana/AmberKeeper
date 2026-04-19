import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { ServiceRecord } from '@amberkeeper/shared-types';
import { cn } from '@/lib/cn';
import { useCachedIcon } from '../hooks/useCachedIcon';
import { decodeCustomServicePresetIcon } from '../lib/custom-service-preset-icon';
import { ProviderIcon } from './ProviderIcon';

export function ServiceIcon(props: {
  service: ServiceRecord;
  className?: string;
  variant?: 'default' | 'rail';
  onResolvedCandidate?: (candidateUrl: string) => void;
}) {
  if (props.service.providerId) {
    return (
      <ProviderIcon
        providerId={props.service.providerId}
        providerName={props.service.name}
        homeUrl={props.service.launchUrl}
        className={props.className}
        variant={props.variant}
      />
    );
  }

  const presetIcon = decodeCustomServicePresetIcon(props.service.iconUrl);
  if (presetIcon) {
    const isRail = props.variant === 'rail';
    const IconComponent = presetIcon.Icon;

    return (
      <span
        role="img"
        aria-label={props.service.name}
        data-service-id={props.service.id}
        data-variant={props.variant ?? 'default'}
        className={cn(
          isRail
            ? 'inline-flex items-center justify-center w-[30px] h-[30px] p-0 shrink-0 rounded-none border-0 bg-transparent shadow-none'
            : 'inline-flex items-center justify-center w-8 h-8 p-1.5 shrink-0 rounded-xl border border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_18px_rgba(95,71,34,0.08)]',
          props.className
        )}
        style={
          {
            '--service-icon-base': 'rgba(33, 47, 72, 0.12)',
            '--service-icon-accent': 'rgba(33, 47, 72, 0.82)',
          } as CSSProperties
        }
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center w-full h-full text-[var(--service-icon-accent)] bg-[var(--service-icon-base)]',
            isRail ? 'rounded-[8px]' : 'rounded-[9px]'
          )}
        >
          <IconComponent className="size-4" />
        </span>
      </span>
    );
  }

  const { iconSrc, onError, onLoad } = useCachedIcon(
    props.service.id,
    props.service.launchUrl,
    props.service.iconUrl ?? undefined,
    {
      onResolvedCandidate: props.onResolvedCandidate,
    }
  );
  const [useMonogramFallback, setUseMonogramFallback] = useState(false);
  const isRail = props.variant === 'rail';
  const label = props.service.name.slice(0, 1).toUpperCase() || '?';

  const containerStyle: CSSProperties = {
    '--service-icon-base': 'rgba(33, 47, 72, 0.12)',
    '--service-icon-accent': 'rgba(33, 47, 72, 0.82)',
  } as CSSProperties;

  const containerClassName = cn(
    isRail
      ? 'inline-flex items-center justify-center w-[30px] h-[30px] p-0 shrink-0 rounded-none border-0 bg-transparent shadow-none'
      : 'inline-flex items-center justify-center w-8 h-8 p-1.5 shrink-0 rounded-xl border border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_8px_18px_rgba(95,71,34,0.08)]',
    props.className
  );

  return (
    <span
      role="img"
      aria-label={props.service.name}
      data-service-id={props.service.id}
      data-variant={props.variant ?? 'default'}
      className={containerClassName}
      style={containerStyle}
    >
      {!iconSrc || useMonogramFallback ? (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center w-full h-full font-semibold text-[var(--service-icon-accent)] bg-[var(--service-icon-base)]',
            isRail ? 'rounded-[8px] text-[11px]' : 'rounded-[9px] text-xs'
          )}
        >
          {label}
        </span>
      ) : (
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          className="block w-full h-full object-contain"
          onLoad={onLoad}
          onError={() => {
            onError();
            if (!iconSrc) {
              setUseMonogramFallback(true);
            }
          }}
        />
      )}
    </span>
  );
}
