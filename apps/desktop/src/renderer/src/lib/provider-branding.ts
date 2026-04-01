import type { ProviderId } from '@amberkeeper/shared-types';
import chatgptAssetMarkup from '../assets/chatgpt.svg?raw';
import claudeAssetUrl from '../assets/claude.png';
import deepseekAssetUrl from '../assets/deepseek.png';
import geminiAssetMarkup from '../assets/gemini.svg?raw';

type ProviderBranding = {
  iconUrl: string;
  assetMarkup?: string;
  assetUrl?: string;
  brandColor: string;
  badgeTint: string;
  iconScale: number;
  railTint: string;
  railActiveTint: string;
  monogram: string;
  remoteIconUrls: string[];
};

const PROVIDER_BRANDING: Record<ProviderId, ProviderBranding> = {
  chatgpt: {
    iconUrl: 'https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg',
    assetMarkup: chatgptAssetMarkup,
    brandColor: '#00a67e',
    badgeTint: 'rgba(16, 166, 126, 0.14)',
    iconScale: 1.02,
    railTint: 'rgba(16, 166, 126, 0.1)',
    railActiveTint: 'rgba(16, 166, 126, 0.18)',
    monogram: 'G',
    remoteIconUrls: ['https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg'],
  },
  claude: {
    iconUrl: 'https://claude.ai/favicon.ico',
    assetUrl: claudeAssetUrl,
    brandColor: '#d97757',
    badgeTint: 'rgba(217, 119, 87, 0.14)',
    iconScale: 1,
    railTint: 'rgba(217, 119, 87, 0.1)',
    railActiveTint: 'rgba(217, 119, 87, 0.17)',
    monogram: 'C',
    remoteIconUrls: ['https://claude.ai/favicon.ico'],
  },
  deepseek: {
    iconUrl: 'https://chat.deepseek.com/favicon.ico',
    assetUrl: deepseekAssetUrl,
    brandColor: '#4d6bfe',
    badgeTint: 'rgba(77, 107, 254, 0.14)',
    iconScale: 1.04,
    railTint: 'rgba(77, 107, 254, 0.1)',
    railActiveTint: 'rgba(77, 107, 254, 0.18)',
    monogram: 'D',
    remoteIconUrls: [
      'https://deepseek.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain=chat.deepseek.com&sz=64',
    ],
  },
  gemini: {
    iconUrl: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
    assetMarkup: geminiAssetMarkup,
    brandColor: '#4d8dff',
    badgeTint: 'rgba(84, 140, 255, 0.14)',
    iconScale: 0.96,
    railTint: 'rgba(84, 140, 255, 0.1)',
    railActiveTint: 'rgba(84, 140, 255, 0.17)',
    monogram: 'G',
    remoteIconUrls: ['https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg'],
  },
};

export function getProviderBranding(providerId: ProviderId): ProviderBranding {
  return PROVIDER_BRANDING[providerId];
}

export function getProviderIconCandidates(providerId: ProviderId, homeUrl: string): string[] {
  const branding = getProviderBranding(providerId);
  const parsedUrl = parseUrl(homeUrl);
  const candidates: string[] = [];

  const addCandidate = (candidate: string | undefined) => {
    if (!candidate) {
      return;
    }

    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  addCandidate(branding.iconUrl);
  for (const candidate of branding.remoteIconUrls) {
    addCandidate(candidate);
  }

  if (!parsedUrl) {
    return candidates;
  }

  const hostVariants = getHostVariants(parsedUrl.hostname);
  const originVariants = getOriginVariants(parsedUrl, hostVariants);

  for (const origin of originVariants) {
    addCandidate(`${origin}/favicon.svg`);
    addCandidate(`${origin}/favicon.ico`);
    addCandidate(`${origin}/apple-touch-icon.png`);
    addCandidate(`${origin}/icon.png`);
  }

  addCandidate(branding.assetUrl);

  for (const host of hostVariants) {
    addCandidate(`https://icons.duckduckgo.com/ip3/${host}.ico`);
    addCandidate(`https://www.google.com/s2/favicons?domain=${host}&sz=64`);
  }

  return candidates;
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

  const normalized = hostname.replace(/^www\./, '');
  addVariant(normalized);

  const parts = normalized.split('.');
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
