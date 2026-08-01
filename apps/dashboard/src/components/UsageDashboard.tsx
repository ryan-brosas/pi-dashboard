import { memo, useMemo, useState } from 'react';
import { MetricPill } from './metrics/MetricPill';
import { PanelHeader, SegmentedControl } from './ui/Panel';
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
  // A single interval cannot show a trend, so the charts collapse instead of
  // reserving full height for one bar.
  const sparseRange = chartData.length <= 1;

  const selectRange = (nextRange: UsageRange) => {
    setRange(nextRange);
    setVisibleRunCount(RUNS_PAGE_SIZE);
  };

  // Rendered in the empty state too: without it, picking a range with no data
  // strands the user with no way to pick a different one.
  const rangeHeader = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Usage &amp; cost</h2>
        {snapshotCoverage && (
          <p aria-live="polite" className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-[var(--text-tertiary)]">
            <span className="font-medium text-[var(--text-secondary)]">
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
      <SegmentedControl
        label="Usage date range"
        value={range}
        onChange={selectRange}
        options={RANGES.map((item) => ({ value: item.key, label: item.label }))}
      />
    </div>
  );

  if (loading && !data) {
    return <div role="status" className="min-h-[60dvh] grid place-items-center text-sm text-[var(--text-tertiary)]">Loading usage history…</div>;
  }
  if (error) {
    return <div role="alert" className="m-8 p-5 rounded-md border border-ember/20 bg-ember/5 text-sm text-ember">Usage query failed: {String(error)}</div>;
  }
  if (!data || data.summary.totalCalls === 0) {
    return (
      <div className="page-shell space-y-5">
        {rangeHeader}
        <div role="status" className="card-surface grid min-h-[40dvh] place-items-center px-6 text-center text-sm text-[var(--text-tertiary)]">
          <div>
            <p>No usage records in this range.</p>
            <p className="mt-1 text-2xs">Pick a wider range above{activeSessionId ? ' or show all runs' : ''}.</p>
            {activeSessionId && (
              <button
                type="button"
                onClick={() => onSessionSelect(null)}
                className="mt-4 min-h-11 rounded-md border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              >
                Show all runs
              </button>
            )}
          </div>
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
    <div className="page-shell space-y-5">
      {rangeHeader}

      {activeSessionId && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-secondary)]">
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

      <section aria-label="Usage summary" className="card-surface px-4 py-3 sm:px-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-5">
          <MetricPill inline label="Total cost" value={formatCurrency(summary.totalCostUsd)} unit={summary.estimatedModelCount > 0 ? 'est.' : undefined} />
          <MetricPill inline label="Total tokens" value={formatNumber(summary.totalTokens)} />
          <MetricPill inline label="Model calls" value={formatNumber(summary.totalCalls, 0)} />
          <MetricPill inline label="Cache hit" value={pct(summary.cacheHitPct)} />
          <MetricPill inline label="Runs" value={formatNumber(summary.sessions, 0)} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3 text-2xs sm:grid-cols-4">
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[var(--text-tertiary)]">Human active</dt>
            <dd className="metric-mono font-medium text-[var(--text-secondary)]">{formatNumber(summary.humanActiveMinutes, 0)}m</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[var(--text-tertiary)]">Agent active</dt>
            <dd className="metric-mono font-medium text-[var(--text-secondary)]">{formatNumber(summary.agentActiveMinutes, 0)}m</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[var(--text-tertiary)]">Prompts</dt>
            <dd className="metric-mono font-medium text-[var(--text-secondary)]">{formatNumber(summary.prompts, 0)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[var(--text-tertiary)]">Swear jar</dt>
            <dd className="metric-mono font-medium text-[var(--text-secondary)]">{formatNumber(summary.swearCount, 0)}</dd>
          </div>
        </dl>
      </section>

      {(summary.estimatedModelCount > 0 || summary.unpricedModelCount > 0) && (
        <div className="rounded-md border border-[var(--border)] px-4 py-3 text-2xs text-[var(--text-secondary)]">
          {summary.estimatedModelCount > 0 && `${summary.estimatedModelCount} model route${summary.estimatedModelCount === 1 ? '' : 's'} priced from the market catalog because Pi reported no native cost.`}
          {summary.unpricedModelCount > 0 && ` ${summary.unpricedModelCount} route${summary.unpricedModelCount === 1 ? '' : 's'} still have no matching price.`}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 card-surface p-5 ${sparseRange ? '' : 'min-h-[340px]'}`}>
          <PanelHeader
            title="Cost and requests"
            action={<span className="metric-mono text-2xs text-[var(--text-tertiary)]">{range}</span>}
          />
          <div className="mb-1 flex gap-4 text-2xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--chart-primary)]" /> Cost</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--chart-axis)] opacity-30" /> Calls</span>
          </div>
          <MiniBarLineChart data={chartData} height={sparseRange ? 90 : 250} />
        </div>

        <div className="card-surface p-5">
          <PanelHeader title="Current month" />
          {summary.monthCostUsd > 0 ? (
            <div className="space-y-4">
              <div>
                <span className="text-xs text-[var(--text-tertiary)]">Month to date</span>
                <p className="metric-mono text-2xl font-semibold text-[var(--text-primary)]">{formatCurrency(summary.monthCostUsd)}</p>
              </div>
              <div>
                <span className="text-xs text-[var(--text-tertiary)]">Run-rate forecast</span>
                <p className="metric-mono text-xl font-semibold text-[var(--text-secondary)]">{formatCurrency(summary.monthForecastUsd)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">
              No activity this month. The {formatCurrency(summary.totalCostUsd)} total above covers earlier activity in this range.
            </p>
          )}
        </div>
      </div>

      <div className={`card-surface p-5 ${sparseRange ? '' : 'min-h-[320px]'}`}>
        <PanelHeader title="Token composition" />
        <div className="mb-1 flex gap-4 text-2xs text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--chart-positive)]" /> Cache read</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--chart-primary)]" /> Fresh input</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--chart-warning)]" /> Output</span>
        </div>
        <MiniStackedAreaChart data={chartData} height={sparseRange ? 90 : 230} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]"><h3 className="ui-title">Models</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-2xs"><thead><tr className="text-2xs uppercase tracking-wider text-[var(--text-tertiary)]"><th className="text-left px-5 py-2">Model</th><th className="text-right px-3 py-2">Calls</th><th className="text-right px-3 py-2">Tokens</th><th className="text-right px-3 py-2">Cache</th><th className="text-right px-5 py-2">Cost</th></tr></thead><tbody>
            {pricedData.models.map((model) => <tr key={`${model.provider}:${model.modelId}`} className="border-t border-[var(--border-subtle)]"><td className="px-5 py-2.5"><span className="font-medium text-[var(--text-primary)]">{model.modelId}</span><span className="block text-2xs text-[var(--text-tertiary)]">{pricingLabel(model)}</span></td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(model.calls, 0)}</td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(model.totalTokens)}</td><td className="px-3 py-2.5 text-right metric-mono">{pct(model.cacheHitPct)}</td><td className="px-5 py-2.5 text-right metric-mono">{formatCurrency(model.resolvedCostUsd)}{model.costSource === 'catalog' && <span className="ml-1 text-2xs uppercase text-accent">est.</span>}</td></tr>)}
          </tbody></table></div>
        </div>

        <div className="card-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <h3 className="ui-title">Recent runs</h3>
            <span className="text-2xs text-[var(--text-tertiary)]" aria-live="polite">
              {hiddenRunCount > 0
                ? `Showing ${visibleSessions.length} of ${pricedData.sessions.length} runs`
                : `Showing all ${pricedData.sessions.length} runs`}
            </span>
          </div>
          <div className="max-h-[430px] overflow-x-auto custom-scrollbar"><table className="w-full text-2xs"><thead className="sticky top-0 bg-[var(--surface)]"><tr className="text-2xs uppercase tracking-wider text-[var(--text-tertiary)]"><th className="text-left px-5 py-2">Run</th><th className="text-right px-3 py-2">Calls</th><th className="text-right px-3 py-2">Tokens</th><th className="text-right px-5 py-2">Cost</th></tr></thead><tbody>
            {visibleSessions.map((session) => <tr key={session.sessionId} className="group border-t border-[var(--border-subtle)]"><td className="max-w-[240px] p-0"><button type="button" onClick={() => onSessionSelect(session.sessionId)} aria-label={`View ${sessionLabel(session.sessionId)} usage`} aria-pressed={activeSessionId === session.sessionId} className="min-h-11 w-full truncate px-5 py-2.5 text-left transition-colors group-hover:bg-[var(--surface-muted)] focus-visible:relative focus-visible:z-10" title={session.sessionId}><span className="font-medium text-[var(--text-primary)]">{sessionLabel(session.sessionId)}</span><span className="block text-2xs text-[var(--text-tertiary)]">{new Date(session.lastSeen).toLocaleString()}</span></button></td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(session.calls, 0)}</td><td className="px-3 py-2.5 text-right metric-mono">{formatNumber(session.totalTokens)}</td><td className="px-5 py-2.5 text-right metric-mono">{formatCurrency(session.costUsd)}{session.costSource === 'catalog' && <span className="ml-1 text-2xs uppercase text-accent">est.</span>}</td></tr>)}
          </tbody></table></div>
          {hiddenRunCount > 0 && (
            <div className="border-t border-[var(--border)] p-2.5 text-center">
              <button
                type="button"
                onClick={() => setVisibleRunCount((count) => count + RUNS_PAGE_SIZE)}
                className="min-h-11 rounded-md px-4 text-2xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] dark:hover:bg-white/[0.05] sm:min-h-9"
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
