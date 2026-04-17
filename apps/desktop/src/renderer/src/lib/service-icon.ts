const OFFICIAL_ICON_MAP: Record<string, string> = {
  'deepseek.com': 'https://deepseek.com/favicon.ico',
  'qianwen.com':
    'https://img.alicdn.com/imgextra/i4/O1CN01uar8u91DHWktnF2fl_!!6000000000191-2-tps-110-110.png',
};

export function getServiceIconCandidates(
  url: string,
  explicitIconUrl?: string,
  preferredCandidates: string[] = []
): string[] {
  const candidates: string[] = [];

  const addCandidate = (candidate: string | undefined) => {
    if (!candidate || candidates.includes(candidate)) {
      return;
    }

    candidates.push(candidate);
  };

  const parsedUrl = parseUrl(url);
  const explicitIsFallback = isThirdPartyFallbackIcon(explicitIconUrl);

  if (!explicitIsFallback) {
    addCandidate(explicitIconUrl);
  }

  if (!parsedUrl) {
    if (explicitIsFallback) {
      addCandidate(explicitIconUrl);
    }
    return candidates;
  }

  const hostVariants = getHostVariants(parsedUrl.hostname);
  const originVariants = getOriginVariants(parsedUrl, hostVariants);

  preferredCandidates.forEach(addCandidate);

  for (const host of hostVariants) {
    addCandidate(OFFICIAL_ICON_MAP[host]);
  }

  for (const origin of originVariants) {
    addCandidate(`${origin}/favicon.svg`);
    addCandidate(`${origin}/favicon.ico`);
    addCandidate(`${origin}/apple-touch-icon.png`);
    addCandidate(`${origin}/icon.svg`);
    addCandidate(`${origin}/icon.png`);
  }

  if (explicitIsFallback) {
    addCandidate(explicitIconUrl);
  }

  for (const host of hostVariants) {
    addCandidate(`https://icons.duckduckgo.com/ip3/${host}.ico`);
    addCandidate(`https://www.google.com/s2/favicons?domain=${host}&sz=64`);
  }

  return candidates;
}

export async function resolveServiceIconCandidates(
  serviceUrl: string,
  explicitIconUrl?: string,
  preferredCandidates: string[] = [],
  options?: { discoverSiteIcon?: (url: string) => Promise<string | null> }
): Promise<string[]> {
  const baseCandidates = getServiceIconCandidates(serviceUrl, explicitIconUrl, preferredCandidates);
  const hasStableExplicitIcon = !!explicitIconUrl && !isThirdPartyFallbackIcon(explicitIconUrl);

  if (hasStableExplicitIcon) {
    return baseCandidates;
  }

  const discoverSiteIcon =
    options?.discoverSiteIcon ??
    (async (url: string) =>
      typeof window !== 'undefined' && window.captureApi?.discoverSiteIcon
        ? window.captureApi.discoverSiteIcon(url)
        : null);
  const discoveredIconUrl = await discoverSiteIcon(serviceUrl);

  if (!discoveredIconUrl || baseCandidates.includes(discoveredIconUrl)) {
    return baseCandidates;
  }

  return [discoveredIconUrl, ...baseCandidates];
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function getHostVariants(hostname: string): string[] {
  const variants: string[] = [];
  const addVariant = (value: string | undefined) => {
    if (!value || variants.includes(value)) {
      return;
    }

    variants.push(value);
  };

  const normalizedHost = hostname.replace(/^www\./, '');
  addVariant(normalizedHost);

  const parts = normalizedHost.split('.');
  if (parts.length >= 3) {
    addVariant(parts.slice(1).join('.'));
  }
  if (parts.length >= 2) {
    addVariant(parts.slice(-2).join('.'));
  }

  return variants;
}

function getOriginVariants(url: URL, hostVariants: string[]): string[] {
  const variants: string[] = [];
  const addVariant = (value: string | undefined) => {
    if (!value || variants.includes(value)) {
      return;
    }

    variants.push(value);
  };

  addVariant(url.origin);
  for (const host of hostVariants) {
    addVariant(`${url.protocol}//${host}`);
  }

  return variants;
}

function isThirdPartyFallbackIcon(iconUrl: string | undefined): boolean {
  if (!iconUrl) {
    return false;
  }

  const parsed = parseUrl(iconUrl);
  if (!parsed) {
    return false;
  }

  const host = parsed.hostname.replace(/^www\./, '');
  return (
    (host === 'google.com' && parsed.pathname === '/s2/favicons') ||
    (host === 'icons.duckduckgo.com' && parsed.pathname.startsWith('/ip3/')) ||
    (host === 't1.gstatic.com' && parsed.pathname === '/faviconV2') ||
    (host === 't2.gstatic.com' && parsed.pathname === '/faviconV2')
  );
}
