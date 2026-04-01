import { useEffect, useState } from 'react';
import type { ProviderId } from '@amberkeeper/shared-types';
import { cacheIcon, getCachedIcon } from '../lib/icon-cache';
import { getProviderIconCandidates } from '../lib/provider-branding';

interface CachedIconState {
  url: string | null;
  loading: boolean;
  candidateIndex: number;
  candidateUrl: string | null;
  resolved: boolean;
  candidates: string[];
}

const iconStateCache = new Map<string, CachedIconState>();
const loadingPromises = new Map<string, Promise<CachedIconState>>();

function createInitialIconState(providerId: ProviderId, serviceUrl: string): CachedIconState {
  const candidates = getProviderIconCandidates(providerId, serviceUrl);
  const initialUrl = candidates[0] ?? null;
  const initialIndex = initialUrl ? 0 : -1;

  return {
    url: initialUrl,
    loading: candidates.length > 0,
    candidateIndex: initialIndex,
    candidateUrl: initialUrl,
    resolved: false,
    candidates,
  };
}

async function tryFetchAndCache(url: string): Promise<string | null> {
  const cached = await getCachedIcon(url);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      return null;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    await cacheIcon(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

async function loadIconWithCache(providerId: ProviderId, serviceUrl: string): Promise<CachedIconState> {
  const candidates = getProviderIconCandidates(providerId, serviceUrl);
  if (candidates.length === 0) {
    return {
      url: null,
      loading: false,
      candidateIndex: -1,
      candidateUrl: null,
      resolved: false,
      candidates: [],
    };
  }

  for (const [index, candidate] of candidates.entries()) {
    const result = await tryFetchAndCache(candidate);
    if (result) {
      return {
        url: result,
        loading: false,
        candidateIndex: index,
        candidateUrl: candidate,
        resolved: true,
        candidates,
      };
    }
  }

  return {
    url: candidates[0] ?? null,
    loading: false,
    candidateIndex: candidates[0] ? 0 : -1,
    candidateUrl: candidates[0] ?? null,
    resolved: false,
    candidates,
  };
}

export function useCachedIcon(providerId: ProviderId, serviceUrl: string) {
  const cacheKey = `${providerId}-${serviceUrl}`;
  const [state, setState] = useState<CachedIconState>(() => {
    const cached = iconStateCache.get(cacheKey);
    return cached ?? createInitialIconState(providerId, serviceUrl);
  });

  useEffect(() => {
    const cached = iconStateCache.get(cacheKey);
    if (cached && !cached.loading) {
      setState(cached);
      return;
    }

    let cancelled = false;
    const existing = loadingPromises.get(cacheKey);
    const promise = existing ?? loadIconWithCache(providerId, serviceUrl);

    if (!existing) {
      loadingPromises.set(cacheKey, promise);
    }

    void promise
      .then((result) => {
        if (cancelled) {
          return;
        }

        iconStateCache.set(cacheKey, result);
        setState(result);
      })
      .finally(() => {
        loadingPromises.delete(cacheKey);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, providerId, serviceUrl]);

  const onError = () => {
    setState((current) => {
      const nextIndex = current.candidateIndex + 1;
      const nextState: CachedIconState = {
        url: current.candidates[nextIndex] ?? null,
        loading: false,
        candidateIndex: nextIndex,
        candidateUrl: current.candidates[nextIndex] ?? null,
        resolved: false,
        candidates: current.candidates,
      };
      iconStateCache.set(cacheKey, nextState);
      return nextState;
    });
  };

  const onLoad = () => {
    setState((current) => {
      if (current.resolved) {
        return current;
      }

      const nextState = {
        ...current,
        loading: false,
        resolved: true,
      };
      iconStateCache.set(cacheKey, nextState);
      return nextState;
    });
  };

  return {
    iconSrc: state.url,
    loading: state.loading,
    resolved: state.resolved,
    onError,
    onLoad,
  };
}
