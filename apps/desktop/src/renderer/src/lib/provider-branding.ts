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
    iconUrl: 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64',
    assetMarkup: chatgptAssetMarkup,
    brandColor: '#00a67e',
    badgeTint: 'rgba(16, 166, 126, 0.14)',
    iconScale: 1.0,
    railTint: 'rgba(16, 166, 126, 0.1)',
    railActiveTint: 'rgba(16, 166, 126, 0.18)',
    monogram: 'G',
    remoteIconUrls: [
      'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64',
      'https://chatgpt.com/favicon.ico',
      'https://icons.duckduckgo.com/ip3/chatgpt.com.ico',
    ],
  },
  claude: {
    iconUrl: 'https://claude.ai/favicon.ico',
    assetUrl: claudeAssetUrl,
    brandColor: '#d97757',
    badgeTint: 'rgba(217, 119, 87, 0.14)',
    iconScale: 1.15,
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
    iconScale: 0.96,
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
  grok: {
    iconUrl: 'https://grok.com/favicon.ico',
    brandColor: '#0f172a',
    badgeTint: 'rgba(15, 23, 42, 0.14)',
    iconScale: 1,
    railTint: 'rgba(15, 23, 42, 0.08)',
    railActiveTint: 'rgba(15, 23, 42, 0.16)',
    monogram: 'G',
    remoteIconUrls: [
      'https://grok.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain=grok.com&sz=64',
    ],
  },
  kimi: {
    iconUrl: 'https://www.kimi.com/favicon.ico',
    brandColor: '#5b6dff',
    badgeTint: 'rgba(91, 109, 255, 0.14)',
    iconScale: 1,
    railTint: 'rgba(91, 109, 255, 0.1)',
    railActiveTint: 'rgba(91, 109, 255, 0.18)',
    monogram: 'K',
    remoteIconUrls: [
      'https://www.kimi.com/favicon.ico',
      'https://kimi.moonshot.cn/favicon.ico',
      'https://www.google.com/s2/favicons?domain=www.kimi.com&sz=64',
      'https://www.google.com/s2/favicons?domain=kimi.moonshot.cn&sz=64',
    ],
  },
  qianwen: {
    iconUrl:
      'https://img.alicdn.com/imgextra/i4/O1CN01uar8u91DHWktnF2fl_!!6000000000191-2-tps-110-110.png',
    brandColor: '#635bff',
    badgeTint: 'rgba(99, 91, 255, 0.14)',
    iconScale: 1,
    railTint: 'rgba(99, 91, 255, 0.1)',
    railActiveTint: 'rgba(99, 91, 255, 0.18)',
    monogram: 'Q',
    remoteIconUrls: [
      'https://img.alicdn.com/imgextra/i4/O1CN01uar8u91DHWktnF2fl_!!6000000000191-2-tps-110-110.png',
      'https://www.qianwen.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain=qianwen.com&sz=64',
    ],
  },
  doubao: {
    iconUrl: 'https://www.doubao.com/favicon.ico',
    brandColor: '#ff6a3d',
    badgeTint: 'rgba(255, 106, 61, 0.14)',
    iconScale: 1,
    railTint: 'rgba(255, 106, 61, 0.1)',
    railActiveTint: 'rgba(255, 106, 61, 0.18)',
    monogram: 'D',
    remoteIconUrls: [
      'https://www.doubao.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain=doubao.com&sz=64',
    ],
  },
  'xiaomi-aistudio': {
    iconUrl: 'https://aistudio.xiaomimimo.com/favicon.ico',
    brandColor: '#ff6900',
    badgeTint: 'rgba(255, 105, 0, 0.14)',
    iconScale: 1,
    railTint: 'rgba(255, 105, 0, 0.1)',
    railActiveTint: 'rgba(255, 105, 0, 0.18)',
    monogram: 'X',
    remoteIconUrls: [
      'https://aistudio.xiaomimimo.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain=aistudio.xiaomimimo.com&sz=64',
    ],
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
