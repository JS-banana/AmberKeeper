import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheIcon, getCachedIcon } from '../lib/icon-cache';
import { getServiceIconCandidates, resolveServiceIconCandidates } from '../lib/service-icon';

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
const EMPTY_CANDIDATES: string[] = [];

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

function createInitialIconState(candidates: string[]): CachedIconState {
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

async function loadIconWithCache(
  serviceUrl: string,
  explicitIconUrl?: string,
  preferredCandidates: string[] = []
): Promise<CachedIconState> {
  const candidates = await resolveServiceIconCandidates(serviceUrl, explicitIconUrl, preferredCandidates);
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

export function useCachedIcon(
  serviceId: string,
  serviceUrl: string,
  explicitIconUrl?: string,
  options?: {
    preferredCandidates?: string[];
    onResolvedCandidate?: (candidateUrl: string) => void;
  }
) {
  const preferredCandidates = options?.preferredCandidates ?? EMPTY_CANDIDATES;
  const preferredCandidatesKey = preferredCandidates.join('|');
  const cacheKey = `${serviceId}-${serviceUrl}-${explicitIconUrl ?? ''}-${preferredCandidatesKey}`;
  const onResolvedCandidateRef = useRef(options?.onResolvedCandidate);
  const lastResolvedCandidateRef = useRef<string | null>(null);
  const [state, setState] = useState<CachedIconState>(() => {
    const cached = iconStateCache.get(cacheKey);
    return (
      cached ??
      createInitialIconState(getServiceIconCandidates(serviceUrl, explicitIconUrl, preferredCandidates))
    );
  });

  useEffect(() => {
    onResolvedCandidateRef.current = options?.onResolvedCandidate;
  }, [options?.onResolvedCandidate]);

  useEffect(() => {
    lastResolvedCandidateRef.current = null;
  }, [cacheKey]);

  const reportResolvedCandidate = useCallback((candidateUrl: string | null) => {
    if (!candidateUrl || lastResolvedCandidateRef.current === candidateUrl) {
      return;
    }

    lastResolvedCandidateRef.current = candidateUrl;
    onResolvedCandidateRef.current?.(candidateUrl);
  }, []);

  useEffect(() => {
    const cached = iconStateCache.get(cacheKey);
    if (cached && !cached.loading) {
      setState(cached);
      if (cached.resolved) {
        reportResolvedCandidate(cached.candidateUrl);
      }
      return;
    }

    let cancelled = false;
    const existing = loadingPromises.get(cacheKey);
    const promise = existing ?? loadIconWithCache(serviceUrl, explicitIconUrl, preferredCandidates);

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
        if (result.resolved) {
          reportResolvedCandidate(result.candidateUrl);
        }
      })
      .finally(() => {
        loadingPromises.delete(cacheKey);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, explicitIconUrl, preferredCandidatesKey, reportResolvedCandidate, serviceUrl]);

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
      reportResolvedCandidate(nextState.candidateUrl);
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
