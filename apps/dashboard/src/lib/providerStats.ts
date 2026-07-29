import {
  findModelPerformance,
  resolvePricingModel,
  type ModelInfo,
  type PerformanceCatalog,
  type PricingCatalog,
  type PricingModel,
} from '@pi-tps/metrics-core';

export interface ObservedProviderStats {
  provider: string;
  avgTps: number | null;
  maxTps: number | null;
  avgTtftMs: number | null;
  callCount: number;
}

export interface ProviderChartDatum {
  provider: string;
  providerDisplay: string;
  localTps: number | null;
  marketTps: number | null;
  localCalls: number;
  routeCount: number;
}

export interface ProviderStatsRoute {
  provider: string;
  providerDisplay: string;
  modelId: string;
  modelName: string;
  contextLength: number | null;
  uptime30m: number | null;
  marketTps: number | null;
  marketTpsP75: number | null;
  marketTpsP90: number | null;
  marketTpsP99: number | null;
  marketTtftMs: number | null;
  marketTtftP75Ms: number | null;
  marketTtftP90Ms: number | null;
  marketTtftP99Ms: number | null;
  observed: ObservedProviderStats | null;
}

export interface ProviderBenchmarkPoint {
  percentile: 'p50' | 'p75' | 'p90' | 'p99';
  tps: number | null;
  ttftMs: number | null;
}

function routeKey(model: PricingModel): string {
  return `${model.provider}:${model.id}`;
}

function marketRoute(
  model: PricingModel,
  performance: PerformanceCatalog,
): ProviderStatsRoute | null {
  const stats = findModelPerformance(performance, model);
  if (!stats) return null;
  return {
    provider: model.provider,
    providerDisplay: model.providerDisplay,
    modelId: model.id,
    modelName: model.name,
    contextLength: model.contextLength,
    uptime30m: model.uptime30m,
    marketTps: stats.throughput?.p50 ?? null,
    marketTpsP75: stats.throughput?.p75 ?? null,
    marketTpsP90: stats.throughput?.p90 ?? null,
    marketTpsP99: stats.throughput?.p99 ?? null,
    marketTtftMs: stats.latency?.p50 ?? null,
    marketTtftP75Ms: stats.latency?.p75 ?? null,
    marketTtftP90Ms: stats.latency?.p90 ?? null,
    marketTtftP99Ms: stats.latency?.p99 ?? null,
    observed: null,
  };
}

function localStats(model: ModelInfo): ObservedProviderStats {
  return {
    provider: model.provider,
    avgTps: model.avgTps,
    maxTps: model.maxTps,
    avgTtftMs: model.avgTtftMs,
    callCount: model.callCount,
  };
}

const nullMarketFields = {
  marketTps: null,
  marketTpsP75: null,
  marketTpsP90: null,
  marketTpsP99: null,
  marketTtftMs: null,
  marketTtftP75Ms: null,
  marketTtftP90Ms: null,
  marketTtftP99Ms: null,
} satisfies Pick<ProviderStatsRoute, 'marketTps' | 'marketTpsP75' | 'marketTpsP90' | 'marketTpsP99' | 'marketTtftMs' | 'marketTtftP75Ms' | 'marketTtftP90Ms' | 'marketTtftP99Ms'>;

export function buildProviderStatsRoutes(
  pricing: PricingCatalog | null,
  performance: PerformanceCatalog | null,
  observedModels: ModelInfo[],
): ProviderStatsRoute[] {
  const rows = new Map<string, ProviderStatsRoute>();

  if (pricing && performance) {
    for (const model of pricing.models) {
      const route = marketRoute(model, performance);
      if (route) rows.set(routeKey(model), route);
    }
  }

  for (const observed of observedModels) {
    const match = pricing
      ? resolvePricingModel(pricing.models, observed.provider, observed.modelId)
      : null;
    if (match) {
      const key = routeKey(match.model);
      const existing = rows.get(key);
      rows.set(key, existing
        ? { ...existing, observed: localStats(observed) }
        : {
            provider: match.model.provider,
            providerDisplay: match.model.providerDisplay,
            modelId: match.model.id,
            modelName: match.model.name,
            contextLength: match.model.contextLength,
            uptime30m: match.model.uptime30m,
            ...nullMarketFields,
            observed: localStats(observed),
          });
      continue;
    }

    const key = `${observed.provider}:${observed.modelId}`;
    rows.set(key, {
      provider: observed.provider,
      providerDisplay: observed.provider,
      modelId: observed.modelId,
      modelName: observed.modelId.split('/').pop() ?? observed.modelId,
      contextLength: null,
      uptime30m: null,
      ...nullMarketFields,
      observed: localStats(observed),
    });
  }

  return [...rows.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId),
  );
}

export function buildProviderBenchmarkProfile(route: ProviderStatsRoute): ProviderBenchmarkPoint[] {
  return [
    { percentile: 'p50', tps: route.marketTps, ttftMs: route.marketTtftMs },
    { percentile: 'p75', tps: route.marketTpsP75, ttftMs: route.marketTtftP75Ms },
    { percentile: 'p90', tps: route.marketTpsP90, ttftMs: route.marketTtftP90Ms },
    { percentile: 'p99', tps: route.marketTpsP99, ttftMs: route.marketTtftP99Ms },
  ];
}

export function buildProviderChartData(routes: ProviderStatsRoute[]): ProviderChartDatum[] {
  const groups = new Map<string, ProviderStatsRoute[]>();
  for (const route of routes) {
    const group = groups.get(route.provider) ?? [];
    group.push(route);
    groups.set(route.provider, group);
  }

  return [...groups.entries()].map(([provider, providerRoutes]) => {
    const localRoutes = providerRoutes.filter(
      (route) => route.observed?.avgTps !== null && route.observed?.avgTps !== undefined,
    );
    const weightedCalls = localRoutes.reduce(
      (total, route) => total + (route.observed?.callCount ?? 0),
      0,
    );
    const localTps = localRoutes.length === 0
      ? null
      : weightedCalls > 0
        ? localRoutes.reduce(
            (total, route) => total + (route.observed?.avgTps ?? 0) * (route.observed?.callCount ?? 0),
            0,
          ) / weightedCalls
        : localRoutes.reduce((total, route) => total + (route.observed?.avgTps ?? 0), 0) / localRoutes.length;
    const marketRoutes = providerRoutes.filter((route) => route.marketTps !== null);
    const marketTps = marketRoutes.length === 0
      ? null
      : marketRoutes.reduce((total, route) => total + (route.marketTps ?? 0), 0) / marketRoutes.length;

    return {
      provider,
      providerDisplay: providerRoutes[0]?.providerDisplay ?? provider,
      localTps,
      marketTps,
      localCalls: providerRoutes.reduce(
        (total, route) => total + (route.observed?.callCount ?? 0),
        0,
      ),
      routeCount: providerRoutes.length,
    };
  }).sort((a, b) => (
    b.localCalls - a.localCalls
    || (b.localTps ?? -1) - (a.localTps ?? -1)
    || a.provider.localeCompare(b.provider)
  ));
}
