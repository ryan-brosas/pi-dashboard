import { useMemo } from 'react';
import type { DataThresholds, ModelInfo, PricingCatalog } from '@pi-tps/metrics-core';
import { useDuckQuery } from './useDuckQuery';
import { queryUsageDashboard } from '../lib/usageQueries';
import { priceUsageDashboard } from '../lib/usagePricing';
import {
  querySummary, queryDataThresholds, queryTimingBuckets, queryMultiSessionSummary,
  queryCacheEfficiency, queryTtftDistribution, queryThresholdCrossings, queryAnomalies,
  queryScatter, queryTokenComposition, queryTimeline,
} from '../lib/queries';
import type {
  ConversationSummaryRow, DataThresholdsRow, TimingBucketRow, ModelInfoRow, SessionSummaryRow,
  CacheOverallSlice, CacheOverTimeInterval, TtftBinRow, ThresholdStat, AnomalyRow,
  ScatterPoint, TokenCompositionRow, TimelineEventRow,
} from '../lib/queries';

interface MultiSessionSummary {
  sessionCount: number;
  totalCalls: number;
  totalTokens: number;
  totalOutput: number;
  totalCostUsd: number | null;
  totalEnergyJoules: number | null;
  sessions: SessionSummaryRow[];
  models: ModelInfoRow[];
  avgTps: number;
  weightedTps: number;
  avgTtft: number;
  timeRangeStart: string;
  timeRangeEnd: string;
}

interface Params {
  /** Overview is the visible tab. Every query is skipped when false. */
  enabled: boolean;
  dbVersion: number;
  activeSessionId: string | null;
  selectedModel: string | null;
  sessions: ReadonlyMap<string, { fileName?: string | null }>;
  pricingCatalog: { catalog: PricingCatalog | null; loading: boolean };
  /** Shared with the header model filter and the Providers tab, so it is owned by App. */
  modelRows: ModelInfoRow[] | null;
}

export function useOverviewData({
  enabled, dbVersion, activeSessionId, selectedModel, sessions, pricingCatalog, modelRows,
}: Params) {
  const skip = { skip: !enabled || dbVersion === 0 };
  const scope = [dbVersion, activeSessionId, selectedModel];

  const { data: summary, loading: summaryLoading, error: summaryError } = useDuckQuery<ConversationSummaryRow | null>(
    () => querySummary(activeSessionId, selectedModel), scope, skip,
  );

  const { data: dashboardUsage } = useDuckQuery(
    () => queryUsageDashboard('all', { sessionId: activeSessionId, modelId: selectedModel }), scope, skip,
  );

  const pricingReady = pricingCatalog.catalog !== null || !pricingCatalog.loading;
  const pricedUsage = useMemo(
    () => dashboardUsage && pricingReady ? priceUsageDashboard(dashboardUsage, pricingCatalog.catalog) : null,
    [dashboardUsage, pricingCatalog.catalog, pricingReady],
  );

  // TPS/TTFT per model comes from tps_paired, which the usage queries do not cover.
  const modelTpsStats = useMemo(() => {
    const map = new Map<string, { avgTps: number | null; maxTps: number | null; avgTtftMs: number | null }>();
    for (const m of modelRows ?? []) {
      map.set(`${m.provider}:${m.modelId}`, { avgTps: m.avgTps, maxTps: m.maxTps, avgTtftMs: m.avgTtftMs });
    }
    return map;
  }, [modelRows]);

  const models: ModelInfo[] = useMemo(
    () => pricedUsage?.models.map((model) => {
      const tps = modelTpsStats.get(`${model.provider}:${model.modelId}`);
      return {
        modelId: model.modelId,
        provider: model.provider,
        callCount: model.calls,
        totalTokens: model.totalTokens,
        avgTps: tps?.avgTps ?? null,
        maxTps: tps?.maxTps ?? null,
        avgTtftMs: tps?.avgTtftMs ?? null,
        energyCostUsd: null,
        energyJoules: null,
        blendedCostUsd: model.costSource === 'unpriced' ? null : model.resolvedCostUsd,
        costSource: model.costSource === 'unpriced' ? null : 'tps',
      };
    }) ?? [],
    [pricedUsage, modelTpsStats],
  );

  const estimatedModelIds = useMemo(
    () => new Set(pricedUsage?.models
      .filter((model) => model.costSource === 'catalog')
      .map((model) => `${model.provider}:${model.modelId}`) ?? []),
    [pricedUsage],
  );

  const { data: dataThresholds } = useDuckQuery<DataThresholdsRow>(
    () => queryDataThresholds(activeSessionId, selectedModel), scope, skip,
  );

  const thresholds = useMemo(
    () => dataThresholds ? ({
      cacheThreshold: dataThresholds.cacheThreshold,
      lowContext: dataThresholds.lowContext,
      slowTtft: dataThresholds.slowTtft,
      fastTtft: dataThresholds.fastTtft,
      highNewInputRatio: dataThresholds.highNewInputRatio,
      anomalyInputThreshold: dataThresholds.anomalyInputThreshold,
      cacheDropMinTotal: dataThresholds.cacheDropMinTotal,
      cacheDropMinInput: dataThresholds.cacheDropMinInput,
      highInputRatio: dataThresholds.highInputRatio,
      highInputSeverityToken: dataThresholds.highInputSeverityToken,
      stallCountThreshold: dataThresholds.stallCountThreshold,
      stallMsSeverity: dataThresholds.stallMsSeverity,
    } as DataThresholds) : undefined,
    [dataThresholds],
  );

  const { data: buckets } = useDuckQuery<TimingBucketRow[]>(
    () => queryTimingBuckets(activeSessionId, selectedModel), scope, skip,
  );

  const { data: multiSummary } = useDuckQuery<MultiSessionSummary | null>(
    () => {
      if (sessions.size <= 1 || activeSessionId || selectedModel) return Promise.resolve(null);
      const fileNames = new Map<string, string | null>();
      for (const [sid, s] of sessions.entries()) fileNames.set(sid, s.fileName ?? null);
      return queryMultiSessionSummary(fileNames);
    },
    [dbVersion, sessions.size, activeSessionId, selectedModel],
    skip,
  );

  const resolvedMultiSummary = useMemo(() => {
    if (!multiSummary || !pricedUsage) return null;
    const costs = new Map(pricedUsage.sessions.map((session) => [session.sessionId, session.costUsd]));
    return {
      ...multiSummary,
      totalCostUsd: pricedUsage.summary.totalCostUsd ?? multiSummary.totalCostUsd,
      sessions: multiSummary.sessions.map((session) => ({
        ...session,
        totalCostUsd: costs.get(session.sessionId) ?? session.totalCostUsd,
      })),
      models,
    };
  }, [multiSummary, pricedUsage, models]);

  const { data: cacheEfficiency } = useDuckQuery<{
    overall: CacheOverallSlice[]; overTime: CacheOverTimeInterval[]; hitRate: number;
  }>(() => queryCacheEfficiency(activeSessionId, selectedModel), scope, skip);

  const { data: tokenComposition } = useDuckQuery<TokenCompositionRow[]>(
    () => queryTokenComposition(activeSessionId, selectedModel), scope, skip,
  );

  const { data: ttftDistribution } = useDuckQuery<{
    bins: TtftBinRow[]; fastCount: number; slowCount: number;
    percentiles: { label: string; value: number }[];
  }>(() => queryTtftDistribution(activeSessionId, selectedModel), scope, skip);

  const thresholdScope = [dbVersion, activeSessionId, selectedModel, dataThresholds];
  const thresholdSkip = { skip: !enabled || dbVersion === 0 || !dataThresholds };

  const { data: thresholdStats } = useDuckQuery<ThresholdStat[]>(
    () => dataThresholds ? queryThresholdCrossings(dataThresholds, activeSessionId, selectedModel) : Promise.resolve([]),
    thresholdScope, thresholdSkip,
  );

  const { data: anomalies } = useDuckQuery<AnomalyRow[]>(
    () => dataThresholds ? queryAnomalies(dataThresholds, activeSessionId, selectedModel) : Promise.resolve([]),
    thresholdScope, thresholdSkip,
  );

  const { data: scatterData } = useDuckQuery<ScatterPoint[]>(
    () => dataThresholds ? queryScatter(dataThresholds, activeSessionId, selectedModel) : Promise.resolve([]),
    thresholdScope, thresholdSkip,
  );

  const { data: timelineRows } = useDuckQuery<TimelineEventRow[]>(
    () => queryTimeline(activeSessionId, selectedModel), scope, skip,
  );

  return {
    summary, summaryLoading, summaryError,
    pricedUsage, models, estimatedModelIds,
    routeCount: models.length || (modelRows?.length ?? 0),
    costUsd: pricedUsage?.summary.totalCostUsd ?? summary?.totalCostUsd ?? null,
    costEstimated: (pricedUsage?.summary.estimatedModelCount ?? 0) > 0,
    thresholds, buckets, resolvedMultiSummary, cacheEfficiency, tokenComposition,
    ttftDistribution, thresholdStats, anomalies, scatterData, timelineRows,
  };
}
