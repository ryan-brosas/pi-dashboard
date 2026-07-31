import { useState, useCallback, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import {
  FileArrowUp, Pulse, Timer, Flame, Coins, Gauge, Clock, Hash, UploadSimple,
} from '@phosphor-icons/react';
import {
  DEFAULT_THRESHOLDS, formatCurrency, formatDuration, formatNumber, formatTps, getTpsEvents,
} from '@pi-tps/metrics-core';
import type { DataThresholds, ModelInfo } from '@pi-tps/metrics-core';
import { useTheme } from './hooks/useTheme';
import { useSessions, type SessionImport } from './hooks/useSessions';
import { useFileHandler } from './hooks/useFileHandler';
import { useExtensionApi } from './hooks/useExtensionApi';
import { useRemoteMetrics } from './hooks/useRemoteMetrics';
import { useDuckQuery } from './hooks/useDuckQuery';
import { usePricingCatalog } from './hooks/usePricingCatalog';
import Logo from './components/Logo';
import ViewNavigation, { AUTHOR_SITE_URL } from './components/ViewNavigation';
import NavTabButton from './components/NavTabButton';
import SessionScope from './components/SessionScope';
import { VIEW_TABS, type ViewTab } from './components/viewTabs';
import { MetricPill, TpsPill } from './components/metrics/MetricPill';
import {
  RequestsTooltip, TotalTimeTooltip, TtftTooltip, StallsTooltip,
  CostTooltip, TokensTooltip, TpsTooltip,
} from './components/tooltips';
import { SmartTooltip } from './components/SmartTooltip';
import ThemeToggle from './components/ThemeToggle';
const TimelineChart = lazy(() => import('./components/TimelineChart'));
const TimingScatter = lazy(() => import('./components/TimingScatter'));
const TokenBreakdown = lazy(() => import('./components/TokenBreakdown'));
const ThresholdAnalysis = lazy(() => import('./components/ThresholdAnalysis'));
const AnomalyDetector = lazy(() => import('./components/AnomalyDetector'));
const RequestInspector = lazy(() => import('./components/RequestInspector'));
const CacheEfficiency = lazy(() => import('./components/CacheEfficiency'));
const TimingDistribution = lazy(() => import('./components/TimingDistribution'));
const SessionScatter = lazy(() => import('./components/SessionScatter'));
const ModelPerformance = lazy(() => import('./components/ModelPerformance'));
const ProviderStats = lazy(() => import('./components/ProviderStats'));
const SqlPlayground = lazy(() => import('./components/SqlPlayground'));
const UsageDashboard = lazy(() => import('./components/UsageDashboard'));
const MarketWatch = lazy(() => import('./components/MarketWatch'));
import { queryUsageDashboard } from './lib/usageQueries';
import { priceUsageDashboard } from './lib/usagePricing';
import {
  querySummary, queryModels, queryDataThresholds, queryTimingBuckets, queryMultiSessionSummary,
  queryCacheEfficiency, queryTtftDistribution, queryThresholdCrossings, queryAnomalies,
  queryScatter, queryTokenComposition, queryTimeline,
} from './lib/queries';
import type {
  ConversationSummaryRow, DataThresholdsRow, TimingBucketRow, ModelInfoRow, SessionSummaryRow,
  CacheOverallSlice, CacheOverTimeInterval, TtftBinRow, ThresholdStat, AnomalyRow,
  ScatterPoint, TokenCompositionRow, TimelineEventRow,
} from './lib/queries';

const APP_VERSION = "2.1.0";

export default function App() {
  const { theme, setTheme } = useTheme();
  const pricingCatalog = usePricingCatalog();
  const [loading, setLoading] = useState(false);
  const [selectedTpsId, setSelectedTpsId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>(() => {
    const auto = new URLSearchParams(window.location.search).get('auto');
    return auto === 'history' || auto === 'metrics' ? 'usage' : 'dashboard';
  });
  const [visitedTabs, setVisitedTabs] = useState<Set<ViewTab>>(() => new Set([viewTab]));
  const overviewScrollRef = useRef<HTMLDivElement>(null);
  const handleViewTabChange = useCallback((tab: ViewTab) => {
    setViewTab(tab);
    setVisitedTabs((prev) => prev.has(tab) ? prev : new Set(prev).add(tab));
  }, []);

  const sessionsData = useSessions(setLoading);
  const {
    sessions, activeSessionId, setActiveSessionId,
    dbLoading, hasLoaded, dbVersion,
    addSession: rawAddSession, replaceSessions: rawReplaceSessions,
    removeSession, clearSessions: rawClearSessions,
  } = sessionsData;

  const wrappedAddSession = useCallback(
    (raw: string, fileName?: string) => {
      rawAddSession(raw, fileName);
      setSelectedModel(null);
      setSelectedTpsId(null);
    },
    [rawAddSession],
  );

  const wrappedReplaceSessions = useCallback(async (items: SessionImport[]) => {
    await rawReplaceSessions(items);
    setSelectedModel(null);
    setSelectedTpsId(null);
  }, [rawReplaceSessions]);

  const wrappedClearSessions = useCallback(() => {
    rawClearSessions();
    setSelectedModel(null);
    setSelectedTpsId(null);
  }, [rawClearSessions]);

  const fileData = useFileHandler(wrappedAddSession, setLoading);
  useExtensionApi(wrappedAddSession, wrappedReplaceSessions, setLoading);
  const remoteMetrics = useRemoteMetrics(wrappedReplaceSessions, () => handleViewTabChange('usage'));
  const {
    snapshot: remoteSnapshot,
    detailedLoading,
    detailedLoaded,
    detailedError,
    loadDetailed,
  } = remoteMetrics;
  const canUseDataTabs = sessions.size > 0 || remoteSnapshot !== null;
  const overviewPreparing = viewTab === 'dashboard' && remoteSnapshot !== null && dbVersion === 0;
  const {
    dragOver, fileInputRef,
    handleDrop, handleDragOver, handleDragLeave, handleFileSelect, loadSample,
  } = fileData;

  const { data: summary, loading: summaryLoading, error: summaryError } = useDuckQuery<ConversationSummaryRow | null>(
    () => querySummary(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const { data: queryModelsResult } = useDuckQuery<ModelInfoRow[]>(
    () => queryModels(activeSessionId),
    [dbVersion, activeSessionId],
    { skip: (viewTab !== "dashboard" && viewTab !== "tps") || dbVersion === 0 },
  );

  const modelList = queryModelsResult ?? [];

  const { data: dashboardUsage } = useDuckQuery(
    () => queryUsageDashboard('all', { sessionId: activeSessionId, modelId: selectedModel }),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );
  useEffect(() => {
    document.documentElement.dataset.version = APP_VERSION;
  }, []);

  // On-demand detailed loading: when a remote snapshot is active and the
  // user opens Overview or SQL, fetch the detailed JSONL and initialize
  // DuckDB for request-level analysis. Usage/Market render from the
  // snapshot without this.
  useEffect(() => {
    if (remoteSnapshot && !detailedLoaded && !detailedLoading && !detailedError
        && (viewTab === 'dashboard' || viewTab === 'sql')) {
      void loadDetailed();
    }
  }, [remoteSnapshot, detailedLoaded, detailedLoading, detailedError, loadDetailed, viewTab]);

  const pricingReady = pricingCatalog.catalog !== null || !pricingCatalog.loading;
  const pricedDashboardUsage = useMemo(
    () => dashboardUsage && pricingReady ? priceUsageDashboard(dashboardUsage, pricingCatalog.catalog) : null,
    [dashboardUsage, pricingCatalog.catalog, pricingReady],
  );

  // TPS/TTFT per model from the tps_paired table (not available from usage queries).
  const modelTpsStats = useMemo(() => {
    const map = new Map<string, { avgTps: number | null; maxTps: number | null; avgTtftMs: number | null }>();
    for (const m of queryModelsResult ?? []) {
      map.set(`${m.provider}:${m.modelId}`, {
        avgTps: m.avgTps, maxTps: m.maxTps, avgTtftMs: m.avgTtftMs,
      });
    }
    return map;
  }, [queryModelsResult]);

  const summaryModels: ModelInfo[] = useMemo(
    () => pricedDashboardUsage?.models.map((model) => {
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
    [pricedDashboardUsage, modelTpsStats],
  );

  const dashboardModelRouteCount = summaryModels.length || modelList.length;
  const dashboardCostUsd = pricedDashboardUsage?.summary.totalCostUsd ?? summary?.totalCostUsd ?? null;
  const dashboardCostEstimated = (pricedDashboardUsage?.summary.estimatedModelCount ?? 0) > 0;
  const estimatedModelIds = useMemo(
    () => new Set(pricedDashboardUsage?.models
      .filter((model) => model.costSource === 'catalog')
      .map((model) => `${model.provider}:${model.modelId}`) ?? []),
    [pricedDashboardUsage],
  );

  const { data: dataThresholds } = useDuckQuery<DataThresholdsRow>(
    () => queryDataThresholds(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const dataThresholdsJs = useMemo(
    () =>
      dataThresholds
        ? ({
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
          } as DataThresholds)
        : undefined,
    [dataThresholds],
  );

  const { data: buckets } = useDuckQuery<TimingBucketRow[]>(
    () => queryTimingBuckets(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const { data: multiSummary } = useDuckQuery<{
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
  } | null>(
    () => {
      if (sessions.size <= 1 || activeSessionId || selectedModel) return Promise.resolve(null);
      const fileNames = new Map<string, string | null>();
      for (const [sid, s] of sessions.entries()) {
        fileNames.set(sid, s.fileName ?? null);
      }
      return queryMultiSessionSummary(fileNames);
    },
    [dbVersion, sessions.size, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const resolvedMultiSummary = useMemo(() => {
    if (!multiSummary || !pricedDashboardUsage) return null;
    const costs = new Map(pricedDashboardUsage?.sessions.map((session) => [session.sessionId, session.costUsd]) ?? []);
    const resolvedSessions = multiSummary.sessions.map((session) => ({
      ...session,
      totalCostUsd: costs.get(session.sessionId) ?? session.totalCostUsd,
    }));
    return {
      ...multiSummary,
      totalCostUsd: pricedDashboardUsage?.summary.totalCostUsd ?? multiSummary.totalCostUsd,
      sessions: resolvedSessions,
      models: summaryModels,
    };
  }, [multiSummary, pricedDashboardUsage, summaryModels]);

  const { data: cacheEfficiency } = useDuckQuery<{
    overall: CacheOverallSlice[];
    overTime: CacheOverTimeInterval[];
    hitRate: number;
  }>(
    () => queryCacheEfficiency(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const { data: tokenComposition } = useDuckQuery<TokenCompositionRow[]>(
    () => queryTokenComposition(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const { data: ttftDistribution } = useDuckQuery<{
    bins: TtftBinRow[];
    fastCount: number;
    slowCount: number;
    percentiles: { label: string; value: number }[];
  }>(
    () => queryTtftDistribution(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const { data: thresholdStats } = useDuckQuery<ThresholdStat[]>(
    () => dataThresholds ? queryThresholdCrossings(dataThresholds, activeSessionId, selectedModel) : Promise.resolve([]),
    [dbVersion, activeSessionId, selectedModel, dataThresholds],
    { skip: viewTab !== "dashboard" || dbVersion === 0 || !dataThresholds },
  );

  const { data: anomalies } = useDuckQuery<AnomalyRow[]>(
    () => dataThresholds ? queryAnomalies(dataThresholds, activeSessionId, selectedModel) : Promise.resolve([]),
    [dbVersion, activeSessionId, selectedModel, dataThresholds],
    { skip: viewTab !== "dashboard" || dbVersion === 0 || !dataThresholds },
  );

  const { data: scatterData } = useDuckQuery<ScatterPoint[]>(
    () => dataThresholds ? queryScatter(dataThresholds, activeSessionId, selectedModel) : Promise.resolve([]),
    [dbVersion, activeSessionId, selectedModel, dataThresholds],
    { skip: viewTab !== "dashboard" || dbVersion === 0 || !dataThresholds },
  );

  const { data: timelineRows } = useDuckQuery<TimelineEventRow[]>(
    () => queryTimeline(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: viewTab !== "dashboard" || dbVersion === 0 },
  );

  const handlePointClick = useCallback((id: string | null) => setSelectedTpsId(id), []);
  const handleSessionSelect = useCallback((sessionId: string | null) => {
    overviewScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setActiveSessionId(sessionId);
    setSelectedModel(null);
    setSelectedTpsId(null);
  }, [setActiveSessionId]);
  const handleSessionClick = useCallback((sid: string) => handleSessionSelect(sid), [handleSessionSelect]);

  const getSessionCounts = useCallback((sid: string) => {
    const events = sessions.get(sid)?.events ?? [];
    const detailedCount = getTpsEvents(events).length;
    const usageCount = events.filter((event) => event.type === 'usage').length;
    return { detailedCount, requestCount: Math.max(detailedCount, usageCount) };
  }, [sessions]);

  const sessionNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const [sessionId, session] of sessions) {
      const fileName = session.fileName?.split('/').pop()?.replace(/\.(jsonl|json)$/, '');
      names.set(sessionId, fileName || sessionId.slice(0, 16));
    }
    return names;
  }, [sessions]);

  const sessionOptions = useMemo(() => Array.from(sessions.keys()).map((sid) => ({
    sessionId: sid,
    label: sessionNames.get(sid) ?? sid.slice(0, 16),
    ...getSessionCounts(sid),
  })), [sessions, sessionNames, getSessionCounts]);
  const activeSessionOption = activeSessionId
    ? sessionOptions.find((session) => session.sessionId === activeSessionId) ?? null
    : null;

  return (
    <div
      className="h-dvh flex overflow-hidden bg-[var(--bg)]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <a
        href="#main-content"
        className="fixed -top-20 left-4 z-[100] rounded-md bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] focus:top-4"
      >
        Skip to main content
      </a>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jsonl,.json,text/plain"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Sidebar navigation rail */}
      <aside className="hidden md:flex flex-col shrink-0 w-[var(--shell-sidebar)] bg-[var(--chrome)] border-r border-[var(--border)]">
        <ViewNavigation
          viewTab={viewTab}
          onChange={handleViewTabChange}
          onUpload={() => fileInputRef.current?.click()}
          canUseSessionTabs={canUseDataTabs}
        />
      </aside>

      {/* Main column */}
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* Top utility bar */}
      <header className="shrink-0 bg-[var(--chrome)] border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href={AUTHOR_SITE_URL}
              aria-label="Visit Ryan Jose Brosas home"
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] md:hidden"
            >
              <Logo size={20} />
            </a>
            <h1 className="sr-only sm:not-sr-only text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate">
              {VIEW_TABS.find((t) => t.value === viewTab)?.label ?? 'Overview'}
            </h1>
            {modelList.length > 0 && viewTab === 'dashboard' && (
              <div className="relative min-w-0">
                <select
                  value={selectedModel ?? ''}
                  onChange={(e) => setSelectedModel(e.target.value || null)}
                  aria-label="Model filter"
                  className={`appearance-none bg-[var(--surface-muted)] border border-[var(--border)] rounded-md pl-2.5 pr-7 py-1 text-2xs font-medium text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand)] max-w-[10rem] truncate`}
                >
                  <option value="">All models</option>
                  {modelList.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      ({m.provider}) {m.modelId.split('/')?.pop()}
                    </option>
                  ))}
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[var(--text-tertiary)] pointer-events-none" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload telemetry files"
              className="flex min-h-11 items-center gap-1 rounded-md px-3 text-2xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:hidden"
              title="Upload telemetry files"
            >
              <UploadSimple size={12} weight="bold" />
            </button>
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
        {/* Mobile nav row */}
        <nav aria-label="Primary" className="md:hidden flex items-center gap-0.5 px-4 sm:px-6 pb-2.5 overflow-x-auto scrollbar-hide border-t border-[var(--border)] pt-2">
          {VIEW_TABS.map(({ value, label, icon, requiresSession }) => {
            const active = viewTab === value;
            const disabled = requiresSession && !canUseDataTabs;
            return (
              <NavTabButton
                key={value}
                icon={icon}
                label={label}
                active={active}
                disabled={disabled}
                disabledReason={disabled ? 'Load telemetry to enable' : undefined}
                onClick={() => handleViewTabChange(value)}
                layout="bar"
              />
            );
          })}
        </nav>
        {sessions.size > 0 && (viewTab === 'dashboard' || viewTab === 'usage' || viewTab === 'sql') && (
          <SessionScope
            sessions={sessionOptions}
            activeSessionId={activeSessionId}
            onSelect={handleSessionSelect}
            onRemove={removeSession}
            onClearAll={wrappedClearSessions}
            loading={viewTab === 'dashboard' && summaryLoading}
          />
        )}
      </header>

      {/* SQL Playground */}
      <div className={`flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-6 ${viewTab === 'sql' && canUseDataTabs ? '' : 'hidden'}`}>
        {visitedTabs.has('sql') && (dbVersion === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-sm">Preparing detailed data…</div>
        ) : (
          <Suspense fallback={<div role="status" className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-sm">Loading SQL playground…</div>}>
            <SqlPlayground dbVersion={dbVersion} activeSessionId={activeSessionId} />
          </Suspense>
        ))}
      </div>

      {/* Usage and cost history */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${viewTab === 'usage' && canUseDataTabs ? '' : 'hidden'}`}>
        {visitedTabs.has('usage') && (
          <Suspense fallback={<div role="status" className="flex items-center justify-center min-h-[40dvh] text-[var(--text-tertiary)] text-sm">Loading usage…</div>}>
            <UsageDashboard
              dbVersion={dbVersion}
              sessionNames={sessionNames}
              pricingCatalog={pricingCatalog.catalog}
              snapshot={remoteMetrics.snapshot}
              activeSessionId={activeSessionId}
              onSessionSelect={handleSessionSelect}
            />
          </Suspense>
        )}
      </div>

      {/* Model market watcher */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${viewTab === 'watch' ? '' : 'hidden'}`}>
        {visitedTabs.has('watch') && (
          <Suspense fallback={<div role="status" className="flex items-center justify-center min-h-[40dvh] text-[var(--text-tertiary)] text-sm">Loading market…</div>}>
            <MarketWatch dbVersion={dbVersion} pricing={pricingCatalog} active={viewTab === 'watch'} />
          </Suspense>
        )}
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto ${viewTab === 'tps' ? '' : 'hidden'}`}>
        {visitedTabs.has('tps') && (
          <Suspense fallback={<div role="status" className="flex items-center justify-center min-h-[40dvh] text-[var(--text-tertiary)] text-sm">Loading provider stats…</div>}>
            <ProviderStats
              pricing={pricingCatalog.catalog}
              performance={pricingCatalog.performance}
              observedModels={queryModelsResult ?? []}
              loading={pricingCatalog.loading}
              active={viewTab === 'tps'}
            />
          </Suspense>
        )}
      </div>

      {/* Performance dashboard */}
      <div ref={overviewScrollRef} className={`flex-1 min-h-0 overflow-y-auto ${viewTab === 'dashboard' ? '' : 'hidden'}`}>
        {viewTab !== 'dashboard' ? null : summaryError ? (
          <div className="grid min-h-[70dvh] place-items-center px-4 sm:px-6">
            <div role="alert" className="panel max-w-lg p-6 text-center">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Overview query failed</h2>
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">{summaryError.message}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => handleViewTabChange('usage')} className="min-h-11 rounded-md bg-[var(--brand)] px-4 text-xs font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--brand-light)]">View usage</button>
                {activeSessionId && <button type="button" onClick={() => handleSessionSelect(null)} className="min-h-11 rounded-md border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]">All runs</button>}
              </div>
            </div>
          </div>
        ) : (hasLoaded || dbLoading || loading || overviewPreparing) && !summary ? (
          <div className="page-shell space-y-5">
            {detailedError ? (
              <div role="alert" className="panel flex items-center justify-between gap-4 px-5 py-3 text-sm text-[var(--text-secondary)]">
                <span>Detailed analysis could not load. Usage and market data are still available.</span>
                <button
                  type="button"
                  onClick={() => void loadDetailed()}
                  className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
                >
                  Retry
                </button>
              </div>
            ) : overviewPreparing && (
              <div role="status" className="panel px-5 py-3 text-sm text-[var(--text-secondary)]">
                Preparing detailed analysis. The dashboard stays usable while request-level data loads.
              </div>
            )}
            {/* Hero skeleton */}
            <div className="panel p-6 sm:p-8">
              <div className="skeleton-text h-3 w-28 mb-4" />
              <div className="skeleton h-12 w-56 mb-3" />
              <div className="skeleton-text h-3 w-40" />
            </div>
            {/* Strip skeleton */}
            <div className="panel px-5 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-y-4 gap-x-6">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="skeleton w-5 h-5 rounded-full" />
                    <div className="space-y-1.5">
                      <div className="skeleton-text h-2 w-12" />
                      <div className="skeleton h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Bento skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="panel h-80 p-5">
                  <div className="skeleton-text h-3 w-32 mb-6" />
                  <div className="skeleton h-56 w-full" />
                </div>
                <div className="panel h-72 p-5">
                  <div className="skeleton-text h-3 w-32 mb-6" />
                  <div className="skeleton h-48 w-full" />
                </div>
              </div>
              <div className="lg:col-span-4 space-y-6">
                <div className="panel h-96 p-5">
                  <div className="skeleton-text h-3 w-28 mb-6" />
                  <div className="skeleton h-72 w-full" />
                </div>
              </div>
            </div>
          </div>
        ) : activeSessionId && summary?.totalCalls === 0 ? (
          <div className="grid min-h-[70dvh] place-items-center px-4 sm:px-6">
            <div role="status" className="panel max-w-lg p-6 text-center">
              <p className="ui-kicker">Run selected</p>
              <h2 className="mt-2 text-base font-semibold text-[var(--text-primary)]">No detailed performance data for this run</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-tertiary)]">
                {activeSessionOption
                  ? `This run has ${activeSessionOption.requestCount.toLocaleString()} usage records`
                  : 'This run has usage records'}, but no request-level TPS telemetry for the Overview charts.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => handleViewTabChange('usage')} className="min-h-11 rounded-md bg-[var(--brand)] px-4 text-xs font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--brand-light)]">View usage</button>
                <button type="button" onClick={() => handleSessionSelect(null)} className="min-h-11 rounded-md border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]">All runs</button>
              </div>
            </div>
          </div>
        ) : !hasLoaded && !summary ? (
          <div
            key="empty"
            className="flex items-center justify-center min-h-[70dvh] px-4 sm:px-6"
          >
            <div className={`max-w-md w-full text-center p-10 rounded-[var(--panel-radius)] border border-dashed transition-colors ${
              dragOver
                ? 'border-[var(--brand)] bg-[var(--surface-muted)]'
                : 'border-[var(--border)] bg-[var(--surface)]'
            }`}>
              <div className="w-14 h-14 mx-auto mb-5 bg-[var(--surface-muted)] rounded-full flex items-center justify-center">
                <FileArrowUp size={24} className="text-[var(--text-tertiary)]" weight="duotone" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)] mb-2">Import telemetry</h2>
              <p className="text-sm text-[var(--text-tertiary)] mb-6 leading-relaxed">
                Drop <code className="metric-mono text-xs bg-[var(--surface-muted)] px-1.5 py-0.5 rounded-sm">.jsonl</code> files, paste JSONL, or load the sample to inspect tokens-per-second, timing, and cost.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto px-5 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm font-medium rounded-md hover:bg-[var(--surface-muted)] transition-colors flex items-center justify-center gap-2"
                >
                  <UploadSimple size={16} weight="bold" />
                  Upload
                </button>
                <button
                  onClick={loadSample}
                  className="w-full sm:w-auto px-5 py-2 bg-[var(--brand)] text-[var(--text-inverse)] text-sm font-medium rounded-md hover:bg-[var(--brand-light)] transition-colors"
                >
                  Load sample data
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`page-shell space-y-5 ${dragOver ? 'rounded-[var(--panel-radius)] border-2 border-dashed border-[var(--brand)]' : ''}`}>
            {summary && (
              <>
                <section
                  data-overview-metrics
                  aria-label="Overview metrics"
                  className="panel sticky top-0 z-20 px-4 py-2.5 sm:px-5"
                >
                  <SmartTooltip
                    preferredPlacement="bottom"
                    gap={10}
                    content={<TpsTooltip activeTps={summary.weightedTps} wallTps={summary.weightedWallTps} lossPct={summary.weightedTpsLoss} mode="weighted" />}
                  >
                  <div className="flex items-center gap-x-4 border-b border-[var(--border)] pb-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="status-dot shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="ui-kicker">Weighted throughput</p>
                        <div className="flex items-baseline gap-2">
                          <span className="metric-value text-2xl font-semibold text-[var(--text-primary)]">
                            {formatTps(summary.weightedTps)}
                          </span>
                          <span className="text-xs font-medium text-[var(--text-tertiary)]">tok/s</span>
                        </div>
                      </div>
                    </div>
                    <p className="hidden min-w-0 text-2xs text-[var(--text-secondary)] md:mr-auto md:block">
                      Across {summary.totalCalls.toLocaleString()} calls
                      {dashboardModelRouteCount > 0 && <> · {dashboardModelRouteCount} route{dashboardModelRouteCount === 1 ? '' : 's'}</>}
                    </p>
                    <div className="ml-auto flex shrink-0 items-center gap-4">
                      <div>
                        <p className="ui-kicker">Wall pace</p>
                        <p className="metric-value text-base text-[var(--text-primary)]">{formatTps(summary.weightedWallTps)} <span className="text-2xs text-[var(--text-tertiary)]">tok/s</span></p>
                      </div>
                      <div>
                        <p className="ui-kicker">Loss</p>
                        <p className={`metric-value text-base ${summary.weightedTpsLoss > 50 ? 'text-[var(--brand-text)]' : 'text-[var(--text-primary)]'}`}>
                          {summary.weightedTpsLoss.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  </SmartTooltip>
                  <div
                    role="group"
                    aria-label="Overview metric details"
                    tabIndex={0}
                    className="scrollbar-hide mt-2 flex gap-3 overflow-x-auto pb-0.5 [&>*]:w-[108px] [&>*]:shrink-0 md:grid md:grid-cols-7 md:overflow-visible md:pb-0 md:[&>*]:w-auto md:[&>*]:min-w-0"
                  >
                    <MetricPill inline icon={Pulse} label="Requests" value={formatNumber(summary.totalCalls)} tooltip={
                      <RequestsTooltip
                        total={summary.totalCalls}
                        models={summaryModels}
                        avgTokensPerCall={summary.avgTokensPerCall}
                        stalledCalls={summary.stalledCalls}
                        cachedCalls={summary.cachedCalls}
                        fastCalls={summary.fastCalls}
                      />
                    } />
                    <MetricPill inline icon={Timer} label="Total time" value={formatDuration(summary.wallClockMs)} tooltip={<TotalTimeTooltip wallClockMs={summary.wallClockMs} totalTimeMs={summary.totalTimeMs} generationMs={summary.totalGenerationMs} />} />
                    <TpsPill inline icon={Gauge} label="Avg TPS" activeTps={summary.avgTps} wallTps={summary.avgWallTps} lossPct={summary.tpsLoss} mode="avg" />
                    <MetricPill inline icon={Clock} label="Avg TTFT" value={formatDuration(Math.round(summary.avgTtft))} tooltip={<TtftTooltip avgTtft={summary.avgTtft} p50={summary.ttftP50} p75={summary.ttftP75} p90={summary.ttftP90} p99={summary.ttftP99} min={summary.minTtft} max={summary.maxTtft} />} />
                    <MetricPill inline icon={Flame} label="Stalls" value={formatNumber(summary.totalStallCount)} color="ember" tooltip={<StallsTooltip count={summary.totalStallCount} ms={summary.totalStallMs} totalTimeMs={summary.totalTimeMs} />} />
                    <MetricPill inline icon={Coins} label="Cost" value={formatCurrency(dashboardCostUsd)} unit={dashboardCostEstimated ? 'est.' : undefined} tooltip={<CostTooltip totalCost={dashboardCostUsd} energyCost={null} costSource="tps" models={summaryModels} totalTokens={summary.totalTokens} estimated={dashboardCostEstimated} />} />
                    <MetricPill inline icon={Hash} label="Tokens" value={formatNumber(summary.totalTokens)} tooltip={<TokensTooltip input={summary.totalInput} output={summary.totalOutput} cacheRead={summary.totalCacheRead} cacheWrite={summary.totalCacheWrite} total={summary.totalTokens} totalCost={dashboardCostUsd} />} />
                  </div>
                </section>

                {pricedDashboardUsage && (pricedDashboardUsage.summary.estimatedModelCount > 0 || pricedDashboardUsage.summary.unpricedModelCount > 0) && (
                  <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-2xs text-[var(--text-secondary)]">
                    {pricedDashboardUsage.summary.estimatedModelCount > 0 && `${pricedDashboardUsage.summary.estimatedModelCount} model route${pricedDashboardUsage.summary.estimatedModelCount === 1 ? '' : 's'} use market catalog pricing.`}
                    {pricedDashboardUsage.summary.unpricedModelCount > 0 && ` ${pricedDashboardUsage.summary.unpricedModelCount} route${pricedDashboardUsage.summary.unpricedModelCount === 1 ? '' : 's'} remain unpriced and are excluded from cost.`}
                  </div>
                )}

                {/* Bento grid */}
                <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-12 gap-5"><div className="lg:col-span-8 h-80 panel animate-pulse" /><div className="lg:col-span-4 h-80 panel animate-pulse" /></div>}>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    <div className="lg:col-span-8 space-y-5">
                      <TimelineChart buckets={buckets ?? []} />
                      <TimingScatter data={scatterData ?? []} onPointClick={handlePointClick} thresholds={dataThresholdsJs ?? DEFAULT_THRESHOLDS} />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <TimingDistribution bins={ttftDistribution?.bins ?? []} fastCount={ttftDistribution?.fastCount ?? 0} slowCount={ttftDistribution?.slowCount ?? 0} percentiles={ttftDistribution?.percentiles ?? []} />
                        <CacheEfficiency overall={cacheEfficiency?.overall ?? []} overTime={cacheEfficiency?.overTime ?? []} hitRate={cacheEfficiency?.hitRate ?? 0} />
                      </div>
                      <TokenBreakdown data={tokenComposition ?? []} />
                    </div>
                    <div className="lg:col-span-4 flex flex-col gap-5">
                      {summaryModels.length > 1 && (
                        <Suspense fallback={<div aria-hidden="true" className="h-56 panel animate-pulse" />}>
                          <ModelPerformance
                            models={summaryModels}
                            avgTps={summary?.avgTps ?? 0}
                            weightedTps={summary?.weightedTps ?? 0}
                            totalCalls={summary?.totalCalls ?? 0}
                            estimatedModelIds={estimatedModelIds}
                          />
                        </Suspense>
                      )}
                      <ThresholdAnalysis stats={thresholdStats ?? []} />
                      <AnomalyDetector anomalies={anomalies ?? []} />
                      <RequestInspector
                        timeline={timelineRows ?? []}
                        selectedId={selectedTpsId}
                        onSelect={handlePointClick}
                        thresholds={dataThresholdsJs ?? DEFAULT_THRESHOLDS}
                        pricingCatalog={pricingCatalog.catalog}
                      />
                    </div>
                  </div>
                </Suspense>
                {resolvedMultiSummary && resolvedMultiSummary.sessionCount > 1 && (
                  <Suspense fallback={<div aria-hidden="true" className="h-80 panel animate-pulse" />}>
                    <SessionScatter multiSummary={resolvedMultiSummary} onSessionClick={handleSessionClick} />
                  </Suspense>
                )}
              </>
            )}
          </div>
        )}
      </div>
      </main>
    </div>
  );
}
