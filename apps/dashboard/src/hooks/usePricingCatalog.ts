import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  parsePerformanceCatalog, parsePricingCatalog,
  type PerformanceCatalog, type PricingCatalog,
} from '@pi-tps/metrics-core';

const MARKET_MODELS_URL = '/data/model-market.json';
const MARKET_PERFORMANCE_URL = '/data/model-performance.json';
const CACHE_KEY = 'pi-tps:pricing-catalog:v1';
const PERF_CACHE_KEY = 'pi-tps:performance-catalog:v1';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface CachedCatalog {
  fetchedAt: number;
  payload: unknown;
}

interface CachedPerformance {
  fetchedAt: number;
  payload: unknown;
}

interface PricingCatalogState {
  catalog: PricingCatalog | null;
  performance: PerformanceCatalog | null;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function readCache(): { catalog: PricingCatalog; fetchedAt: number } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as CachedCatalog | null;
    if (!cached || !Number.isFinite(cached.fetchedAt)) return null;
    const parsed = parsePricingCatalog(cached.payload);
    return parsed.ok ? { catalog: parsed.catalog, fetchedAt: cached.fetchedAt } : null;
  } catch {
    return null;
  }
}

function readPerformanceCache(): { performance: PerformanceCatalog; fetchedAt: number } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(PERF_CACHE_KEY) ?? 'null') as CachedPerformance | null;
    if (!cached || !Number.isFinite(cached.fetchedAt)) return null;
    const parsed = parsePerformanceCatalog(cached.payload);
    return parsed.ok ? { performance: parsed.catalog, fetchedAt: cached.fetchedAt } : null;
  } catch {
    return null;
  }
}

async function fetchCatalog(signal: AbortSignal): Promise<{ catalog: PricingCatalog; payload: unknown }> {
  const response = await fetch(MARKET_MODELS_URL, {
    signal,
    cache: 'no-cache',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Market catalog request failed with ${response.status}`);
  const payload: unknown = await response.json();
  const parsed = parsePricingCatalog(payload);
  if (!parsed.ok) throw new Error(parsed.error);
  return { catalog: parsed.catalog, payload };
}

export function usePricingCatalog(): PricingCatalogState {
  const [initialCache] = useState(readCache);
  const [initialCacheIsFresh] = useState(
    () => initialCache !== null && Date.now() - initialCache.fetchedAt < CACHE_TTL_MS,
  );
  const [initialPerfCache] = useState(readPerformanceCache);
  const [initialPerformanceIsFresh] = useState(
    () => initialPerfCache !== null && Date.now() - initialPerfCache.fetchedAt < CACHE_TTL_MS,
  );
  const [catalog, setCatalog] = useState<PricingCatalog | null>(initialCache?.catalog ?? null);
  const [performance, setPerformance] = useState<PerformanceCatalog | null>(initialPerfCache?.performance ?? null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(initialCache?.fetchedAt ?? null);
  const [loading, setLoading] = useState(!initialCacheIsFresh);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (revision === 0 && initialCacheIsFresh && initialPerformanceIsFresh) {
      return () => controller.abort();
    }

    fetchCatalog(controller.signal)
      .then(({ catalog: nextCatalog, payload }) => {
        const now = Date.now();
        setCatalog(nextCatalog);
        setFetchedAt(now);
        setLoading(false);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: now, payload } satisfies CachedCatalog));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      });

    // Fetch the performance sidecar in parallel (fail-soft — market TPS is optional).
    fetch(MARKET_PERFORMANCE_URL, {
      signal: controller.signal,
      cache: 'no-cache',
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Market performance request failed with ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload: unknown) => {
        const parsed = parsePerformanceCatalog(payload);
        if (parsed.ok) {
          const now = Date.now();
          setPerformance(parsed.catalog);
          localStorage.setItem(PERF_CACHE_KEY, JSON.stringify({ fetchedAt: now, payload } satisfies CachedPerformance));
        }
      })
      .catch(() => { /* market speed is optional */ });

    return () => controller.abort();
  }, [initialCacheIsFresh, initialPerformanceIsFresh, revision]);

  return useMemo(
    () => ({ catalog, performance, fetchedAt, loading, error, refresh }),
    [catalog, error, fetchedAt, loading, performance, refresh],
  );
}
