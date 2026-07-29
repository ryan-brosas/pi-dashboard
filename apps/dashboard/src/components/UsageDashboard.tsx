import { memo, useMemo, useState } from 'react';
import { Clock, Coins, Database, Gauge, Hash, Lightning, Pulse, Quotes, TrendUp } from '@phosphor-icons/react';
import { MetricPill } from './metrics/MetricPill';
import { useDuckQuery } from '../hooks/useDuckQuery';
import { formatCurrency, formatNumber, type PricingCatalog } from '@pi-tps/metrics-core';
import { queryUsageDashboard, type UsageRange, type UsageDashboardData } from '../lib/usageQueries';
import { priceUsageDashboard, type PricedUsageModelRow } from '../lib/usagePricing';
import { snapshotRangeCoverage, snapshotToUsageData } from '../lib/snapshotQueries';
import type { PublicMetricsSnapshot } from '@pi-tps/metrics-core';
import { MiniBarLineChart, MiniStackedAreaChart } from './MiniCharts';

const RANGES: { key: UsageRange; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'Lifetime' },
];

const RUNS_PAGE_SIZE = 30;

function dateLabel(value: string, range: UsageRange): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return range === '24h'
    ? date.toLocaleTimeString([], { hour: 'numeric' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function pricingLabel(model: PricedUsageModelRow): string {
  if (!model.pricingModel) return model.costSource === 'unpriced'
    ? `${model.provider} · no matching price`
    : model.provider;
  const provider = model.canonicalProvider && model.canonicalProvider !== model.provider
    ? `${model.provider} → ${model.canonicalProvider}`
    : model.provider;
  const provenance = model.pricingMatchStrategy === 'provider-alias'
    ? 'estimated alias'
    : model.pricingMatchStrategy === 'model-family' ? 'estimated inferred' : 'estimated';
  return `${provider} · ${model.pricingModel.id} · ${provenance}`;
}

function UsageDashboard({
  dbVersion,
  sessionNames,
  pricingCatalog,
  snapshot,
  activeSessionId,
  onSessionSelect,
}: {
  dbVersion: number;
  sessionNames: Map<string, string>;
  pricingCatalog: PricingCatalog | null;
  snapshot?: PublicMetricsSnapshot | null;
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string | null) => void;
}) {
  const [range, setRange] = useState<UsageRange>('all');
  const [visibleRunCount, setVisibleRunCount] = useState(RUNS_PAGE_SIZE);
  const scope = useMemo(() => ({ sessionId: activeSessionId }), [activeSessionId]);
  // Snapshot fast path: compute from compact pre-aggregated data, no DuckDB.
  const snapshotData = useMemo<UsageDashboardData | null>(
    () => snapshot ? snapshotToUsageData(snapshot, range, scope) : null,
    [snapshot, range, scope],
  );
  const { data: duckData, loading, error } = useDuckQuery(
    () => queryUsageDashboard(range, scope),
    [dbVersion, range, activeSessionId],
    { skip: dbVersion === 0 || snapshot != null },
  );
  const data = snapshotData ?? duckData;
  const pricedData = useMemo(
    () => data ? priceUsageDashboard(data, pricingCatalog) : null,
    [data, pricingCatalog],
  );

  const chartData = useMemo(
    () => pricedData?.points.map((point) => ({ ...point, label: dateLabel(point.timestamp, range) })) ?? [],
    [pricedData, range],
  );
  const snapshotCoverage = useMemo(
    () => snapshot ? snapshotRangeCoverage(snapshot, range, scope) : null,
    [snapshot, range, scope],
  );

  const selectRange = (nextRange: UsageRange) => {
    setRange(nextRange);
    setVisibleRunCount(RUNS_PAGE_SIZE);
  };

  if (loading && !data) {
    return <div role="status" className="min-h-[60dvh] grid place-items-center text-sm text-zinc-400">Loading usage history…</div>;
  }
  if (error) {
    return <div role="alert" className="m-8 p-5 rounded-2xl border border-ember/20 bg-ember/5 text-sm text-ember">Usage query failed: {String(error)}</div>;
  }
  if (!data || data.summary.totalCalls === 0) {
    return (
      <div role="status" className="min-h-[60dvh] grid place-items-center px-6 text-center text-sm text-zinc-400">
        <div>
          <p>No native Pi usage records in this range.</p>
          {activeSessionId && (
            <button
              type="button"
              onClick={() => onSessionSelect(null)}
              className="mt-3 min-h-11 rounded-md border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            >
              Show all runs
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!pricedData) return null;
  const { summary } = pricedData;
  const sessionLabel = (sessionId: string) => sessionNames.get(sessionId) ?? sessionId.slice(0, 16);
  const visibleSessions = pricedData.sessions.slice(0, visibleRunCount);
  const hiddenRunCount = pricedData.sessions.length - visibleSessions.length;
  const nextRunCount = Math.min(RUNS_PAGE_SIZE, hiddenRunCount);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Pi history</p>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">Usage &amp; cost</h2>
          {snapshotCoverage && (
            <p aria-live="polite" className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-zinc-400">
              <span className="font-medium text-zinc-500 dark:text-zinc-300">
                {snapshotCoverage.recordCount.toLocaleString()} {snapshotCoverage.recordCount === 1 ? 'record' : 'records'} in this range
              </span>
              {snapshotCoverage.latestHour && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Latest activity <time dateTime={snapshotCoverage.latestHour}>{new Date(snapshotCoverage.latestHour).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span>
                </>
              )}
            </p>
          )}
        </div>
        <div role="group" aria-label="Usage date range" className="grid min-h-11 w-full grid-cols-5 items-stretch gap-1 rounded-lg border border-zinc-200/60 bg-white/60 p-1 dark:border-white/[0.06] dark:bg-zinc-800/40 sm:min-h-0 sm:w-auto">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => selectRange(item.key)}
              aria-pressed={range === item.key}
              className={`min-h-11 rounded-md px-2 text-[11px] font-medium transition-colors sm:min-h-8 sm:px-2.5 ${
                range === item.key
                  ? 'bg-accent/10 text-accent ring-1 ring-inset ring-accent/15 dark:bg-accent/15'
                  : 'text-zinc-400 hover:bg-zinc-100/70 hover:text-zinc-700 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200'
              }`}
            >{item.label}</button>
          ))}
        </div>
      </div>

      {activeSessionId && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          <span>Showing run <strong className="font-semibold text-[var(--text-primary)]">{sessionLabel(activeSessionId)}</strong></span>
          <button
            type="button"
            onClick={() => onSessionSelect(null)}
            className="min-h-9 rounded-md border border-[var(--border)] px-3 font-semibold transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          >
            Show all runs
          </button>
        </div>
      )}

      <div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2"
      >
        <MetricPill icon={Coins} label="Total cost" value={formatCurrency(summary.totalCostUsd)} unit={summary.estimatedModelCount > 0 ? 'est.' : undefined} color="accent" />
        <MetricPill icon={Hash} label="Total tokens" value={formatNumber(summary.totalTokens)} />
        <MetricPill icon={Pulse} label="Model calls" value={formatNumber(summary.totalCalls, 0)} />
        <MetricPill icon={Gauge} label="Cache hit" value={pct(summary.cacheHitPct)} color="moss" />
        <MetricPill icon={Database} label="Runs" value={formatNumber(summary.sessions, 0)} />
        <MetricPill icon={Clock} label="Human active" value={`${formatNumber(summary.humanActiveMinutes, 0)}m`} />
        <MetricPill icon={Lightning} label="Agent active" value={`${formatNumber(summary.agentActiveMinutes, 0)}m`} color="accent" />
        <MetricPill icon={Quotes} label="Prompts" value={formatNumber(summary.prompts, 0)} />
        <MetricPill icon={TrendUp} label="Swear jar" value={formatNumber(summary.swearCount, 0)} color="ember" />
      </div>

      {(summary.estimatedModelCount > 0 || summary.unpricedModelCount > 0) && (
        <div className="rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          {summary.estimatedModelCount > 0 && `${summary.estimatedModelCount} model route${summary.estimatedModelCount === 1 ? '' : 's'} priced from the market catalog because Pi reported no native cost.`}
          {summary.unpricedModelCount > 0 && ` ${summary.unpricedModelCount} route${summary.unpricedModelCount === 1 ? '' : 's'} still have no matching price.`}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-surface p-5 min-h-[340px]">
          <div className="flex items-start justify-between mb-4">
            <div><p className="text-[10px] uppercase tracking-wider text-zinc-400">Burn over time</p><h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Cost and request volume</h3></div>
            <span className="metric-mono text-[10px] text-zinc-400">{range}</span>
          </div>
          <div className="flex gap-4 text-[10px] text-zinc-400 mb-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-primary)]" /> Cost</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-axis)] opacity-30" /> Calls</span>
          </div>
          <MiniBarLineChart data={chartData} height={250} />
        </div>

        <div className="card-surface p-5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Current month</p>
          <div className="mt-3 space-y-4">
            <div><span className="text-xs text-zinc-400">Month to date</span><p className="metric-mono text-2xl font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(summary.monthCostUsd)}</p></div>
            <div><span className="text-xs text-zinc-400">Run-rate forecast</span><p className="metric-mono text-xl font-semibold text-accent">{formatCurrency(summary.monthForecastUsd)}</p></div>
            <div className="pt-3 border-t border-zinc-200/50 dark:border-white/[0.06] text-[11px] leading-relaxed text-zinc-400">
              Native costs are used when available. Missing costs are estimated from the exact provider and model route in the market catalog. Subscription charges may differ.
            </div>
          </div>
        </div>
      </div>

      <div className="card-surface p-5 min-h-[320px]">
        <div className="mb-4"><p className="text-[10px] uppercase tracking-wider text-zinc-400">Token composition</p><h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Fresh input, output, and cache reads</h3></div>
        <div className="flex gap-4 text-[10px] text-zinc-400 mb-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-positive)]" /> Cache read</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-primary)]" /> Fresh input</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-warning)]" /> Output</span>
        </div>
        <MiniStackedAreaChart data={chartData} height={230} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200/50 dark:border-white/[0.06]"><h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Models</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-[9px] uppercase tracking-wider text-zinc-400"><th className="text-left px-5 py-2">Model</th><th className="text-right px-3 py-2">Calls</th><th className="text-right px-3 py-2">Tokens</th><th className="text-right px-3 py-2">Cache</th><th className="text-right px-5 py-2">Cost</th></tr></thead><tbody>
            {pricedData.models.map((model) => <tr key={`${model.provider}:${model.modelId}`} className="border-t border-zinc-200/30 dark:border-white/[0.04]"><td className="px-5 py-2.5"><span className="font-medium text-zinc-700 dark:text-zinc-300">{model.modelId}</span><span className="block text-[9px] text-zinc-400">{pricingLabel(model)}</span></td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(model.calls, 0)}</td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(model.totalTokens)}</td><td className="px-3 py-2.5 text-right metric-mono">{pct(model.cacheHitPct)}</td><td className="px-5 py-2.5 text-right metric-mono">{formatCurrency(model.resolvedCostUsd)}{model.costSource === 'catalog' && <span className="ml-1 text-[8px] uppercase text-accent">est.</span>}</td></tr>)}
          </tbody></table></div>
        </div>

        <div className="card-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200/50 px-5 py-4 dark:border-white/[0.06]">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Recent runs</h3>
            <span className="text-[10px] text-zinc-400" aria-live="polite">
              {hiddenRunCount > 0
                ? `Showing ${visibleSessions.length} of ${pricedData.sessions.length} runs`
                : `Showing all ${pricedData.sessions.length} runs`}
            </span>
          </div>
          <div className="max-h-[430px] overflow-x-auto custom-scrollbar"><table className="w-full text-[11px]"><thead className="sticky top-0 bg-white dark:bg-zinc-800"><tr className="text-[9px] uppercase tracking-wider text-zinc-400"><th className="text-left px-5 py-2">Run</th><th className="text-right px-3 py-2">Calls</th><th className="text-right px-3 py-2">Tokens</th><th className="text-right px-5 py-2">Cost</th></tr></thead><tbody>
            {visibleSessions.map((session) => <tr key={session.sessionId} className="group border-t border-zinc-200/30 dark:border-white/[0.04]"><td className="max-w-[240px] p-0"><button type="button" onClick={() => onSessionSelect(session.sessionId)} aria-label={`View ${sessionLabel(session.sessionId)} usage`} aria-pressed={activeSessionId === session.sessionId} className="min-h-11 w-full truncate px-5 py-2.5 text-left transition-colors group-hover:bg-[var(--surface-muted)] focus-visible:relative focus-visible:z-10" title={session.sessionId}><span className="font-medium text-zinc-700 dark:text-zinc-300">{sessionLabel(session.sessionId)}</span><span className="block text-[9px] text-zinc-400">{new Date(session.lastSeen).toLocaleString()}</span></button></td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(session.calls, 0)}</td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(session.totalTokens)}</td><td className="px-5 py-2.5 text-right metric-mono">{formatCurrency(session.costUsd)}{session.costSource === 'catalog' && <span className="ml-1 text-[8px] uppercase text-accent">est.</span>}</td></tr>)}
          </tbody></table></div>
          {hiddenRunCount > 0 && (
            <div className="border-t border-zinc-200/50 p-2.5 text-center dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setVisibleRunCount((count) => count + RUNS_PAGE_SIZE)}
                className="min-h-11 rounded-md px-4 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200 sm:min-h-9"
              >
                Show {nextRunCount} more runs
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(UsageDashboard);
