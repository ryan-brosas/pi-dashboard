import {
  estimateModelCost, resolvePricingModel,
  type PricingCatalog, type PricingMatchStrategy, type PricingModel,
} from '@pi-tps/metrics-core';
import type {
  UsageCostBreakdown, UsageDashboardData, UsageModelRow, UsagePoint, UsageSessionRow,
} from './usageQueries';

export type UsageCostSource = 'native' | 'catalog' | 'unpriced';

export interface ResolvedUsageCost {
  costUsd: number;
  source: UsageCostSource;
  pricingModel: PricingModel | null;
  pricingMatchStrategy: PricingMatchStrategy | null;
  canonicalProvider: string | null;
}

export interface PricedUsageModelRow extends UsageModelRow {
  resolvedCostUsd: number;
  costSource: UsageCostSource;
  pricingModel: PricingModel | null;
  pricingMatchStrategy: PricingMatchStrategy | null;
  canonicalProvider: string | null;
}

export interface PricedUsagePoint {
  timestamp: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface PricedUsageSession {
  sessionId: string;
  calls: number;
  totalTokens: number;
  cacheHitPct: number;
  costUsd: number;
  costSource: UsageCostSource;
  firstSeen: string;
  lastSeen: string;
}

export interface PricedUsageDashboard {
  summary: UsageDashboardData['summary'] & {
    estimatedModelCount: number;
    unpricedModelCount: number;
  };
  points: PricedUsagePoint[];
  models: PricedUsageModelRow[];
  sessions: PricedUsageSession[];
}

function usageMix(row: UsageCostBreakdown) {
  return {
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
  };
}

export function resolveUsageCost(
  row: UsageCostBreakdown,
  catalog: PricingCatalog | null,
): ResolvedUsageCost {
  if (row.pricedCalls > 0 || row.costUsd > 0) {
    return {
      costUsd: row.costUsd,
      source: 'native',
      pricingModel: null,
      pricingMatchStrategy: null,
      canonicalProvider: null,
    };
  }

  const pricingMatch = catalog
    ? resolvePricingModel(catalog.models, row.provider, row.modelId)
    : null;
  if (!pricingMatch) return {
    costUsd: 0,
    source: 'unpriced',
    pricingModel: null,
    pricingMatchStrategy: null,
    canonicalProvider: null,
  };

  return {
    costUsd: estimateModelCost(pricingMatch.model, usageMix(row)).totalCostUsd,
    source: 'catalog',
    pricingModel: pricingMatch.model,
    pricingMatchStrategy: pricingMatch.strategy,
    canonicalProvider: pricingMatch.canonicalProvider,
  };
}

function resolveModels(rows: UsageModelRow[], catalog: PricingCatalog | null): PricedUsageModelRow[] {
  return rows.map((row) => {
    const resolved = resolveUsageCost(row, catalog);
    return {
      ...row,
      resolvedCostUsd: resolved.costUsd,
      costSource: resolved.source,
      pricingModel: resolved.pricingModel,
      pricingMatchStrategy: resolved.pricingMatchStrategy,
      canonicalProvider: resolved.canonicalProvider,
    };
  });
}

function resolvePoints(rows: UsagePoint[], catalog: PricingCatalog | null): PricedUsagePoint[] {
  const points = new Map<string, PricedUsagePoint>();
  for (const row of rows) {
    const current = points.get(row.timestamp) ?? {
      timestamp: row.timestamp,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
    current.calls += row.calls;
    current.inputTokens += row.inputTokens;
    current.outputTokens += row.outputTokens;
    current.cacheReadTokens += row.cacheReadTokens;
    current.totalTokens += row.totalTokens;
    current.costUsd += resolveUsageCost(row, catalog).costUsd;
    points.set(row.timestamp, current);
  }
  return [...points.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function resolveSessions(rows: UsageSessionRow[], catalog: PricingCatalog | null): PricedUsageSession[] {
  const sessions = new Map<string, PricedUsageSession & { cacheReadTokens: number; inputTokens: number }>();
  for (const row of rows) {
    const current = sessions.get(row.sessionId) ?? {
      sessionId: row.sessionId,
      calls: 0,
      totalTokens: 0,
      cacheHitPct: 0,
      costUsd: 0,
      costSource: 'native',
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      cacheReadTokens: 0,
      inputTokens: 0,
    };
    const resolved = resolveUsageCost(row, catalog);
    current.calls += row.calls;
    current.totalTokens += row.totalTokens;
    current.costUsd += resolved.costUsd;
    current.cacheReadTokens += row.cacheReadTokens;
    current.inputTokens += row.inputTokens;
    if (resolved.source === 'unpriced') current.costSource = 'unpriced';
    else if (resolved.source === 'catalog' && current.costSource !== 'unpriced') current.costSource = 'catalog';
    if (row.firstSeen < current.firstSeen) current.firstSeen = row.firstSeen;
    if (row.lastSeen > current.lastSeen) current.lastSeen = row.lastSeen;
    sessions.set(row.sessionId, current);
  }

  return [...sessions.values()]
    .map(({ cacheReadTokens, inputTokens, ...session }) => ({
      ...session,
      cacheHitPct: cacheReadTokens + inputTokens > 0
        ? 100 * cacheReadTokens / (cacheReadTokens + inputTokens)
        : 0,
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function priceUsageDashboard(
  data: UsageDashboardData,
  catalog: PricingCatalog | null,
  now = new Date(),
): PricedUsageDashboard {
  const models = resolveModels(data.models, catalog);
  const monthModels = resolveModels(data.monthModels, catalog);
  const totalCostUsd = models.reduce((sum, row) => sum + row.resolvedCostUsd, 0);
  const monthCostUsd = monthModels.reduce((sum, row) => sum + row.resolvedCostUsd, 0);
  const elapsedDays = Math.max(1, now.getDate() - 1 + (now.getHours() + now.getMinutes() / 60) / 24);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return {
    summary: {
      ...data.summary,
      totalCostUsd,
      monthCostUsd,
      monthForecastUsd: monthCostUsd / elapsedDays * daysInMonth,
      estimatedModelCount: models.filter((row) => row.costSource === 'catalog').length,
      unpricedModelCount: models.filter((row) => row.costSource === 'unpriced').length,
    },
    points: resolvePoints(data.points, catalog),
    models,
    sessions: resolveSessions(data.sessions, catalog),
  };
}
