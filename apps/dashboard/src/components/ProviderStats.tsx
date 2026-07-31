import { memo, useMemo, useState } from 'react';
import {
  CaretDown, CaretRight, CheckCircle, Clock, Gauge, MagnifyingGlass, Pulse, Timer,
} from '@phosphor-icons/react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  formatDuration, formatNumber, formatTps,
  type ModelInfo, type PerformanceCatalog, type PricingCatalog,
} from '@pi-tps/metrics-core';
import {
  buildProviderBenchmarkProfile, buildProviderChartData, buildProviderStatsRoutes,
  type ProviderStatsRoute,
} from '../lib/providerStats';

type SourceFilter = 'all' | 'local' | 'market';
const DEFAULT_ROUTE_CAP = 6;

function ProviderStats({
  pricing,
  performance,
  observedModels,
  loading,
  active = true,
}: {
  pricing: PricingCatalog | null;
  performance: PerformanceCatalog | null;
  observedModels: ModelInfo[];
  loading: boolean;
  active?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [providerOpenOverrides, setProviderOpenOverrides] = useState<Map<string, boolean>>(new Map());
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const routes = useMemo(
    () => buildProviderStatsRoutes(pricing, performance, observedModels),
    [observedModels, performance, pricing],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return routes.filter((route) => {
      const matchesSource = source === 'all'
        || (source === 'local' && route.observed !== null)
        || (source === 'market' && route.marketTps !== null);
      const matchesSearch = !query || [
        route.provider, route.providerDisplay, route.modelId, route.modelName,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesSource && matchesSearch;
    });
  }, [routes, search, source]);
  const providerRollups = useMemo(() => {
    const byProvider = new Map(buildProviderChartData(filtered).map((datum) => [datum.provider, datum]));
    return byProvider;
  }, [filtered]);
  const groups = useMemo(() => {
    const grouped = new Map<string, ProviderStatsRoute[]>();
    for (const route of filtered) {
      const rows = grouped.get(route.provider) ?? [];
      rows.push(route);
      grouped.set(route.provider, rows);
    }
    return [...grouped.entries()].sort(([providerA], [providerB]) => {
      const a = providerRollups.get(providerA);
      const b = providerRollups.get(providerB);
      return (b?.localCalls ?? 0) - (a?.localCalls ?? 0)
        || (b?.localTps ?? -1) - (a?.localTps ?? -1)
        || providerA.localeCompare(providerB);
    });
  }, [filtered, providerRollups]);
  if (loading && routes.length === 0) {
    return <div role="status" className="min-h-[60dvh] grid place-items-center text-sm text-[var(--text-tertiary)]">Loading provider performance…</div>;
  }

  const observedCount = routes.filter((route) => route.observed).length;
  const marketCount = routes.filter((route) => route.marketTps !== null || route.marketTtftMs !== null).length;
  const tpsRouteCount = routes.filter(
    (route) => route.marketTps !== null || typeof route.observed?.avgTps === 'number',
  ).length;
  const providerCount = new Set(routes.map((route) => route.provider)).size;
  const fastestMarket = routes
    .filter((route) => route.marketTps !== null)
    .sort((a, b) => (b.marketTps ?? 0) - (a.marketTps ?? 0))[0];

  const isProviderOpen = (provider: string, providerRoutes: ProviderStatsRoute[]) =>
    providerOpenOverrides.get(provider)
      ?? (search.trim().length > 0 || providerRoutes.some((route) => route.observed !== null));
  const setProviderOpen = (provider: string, open: boolean) => {
    setProviderOpenOverrides((current) => new Map(current).set(provider, open));
  };
  const toggleCollapse = (provider: string, providerRoutes: ProviderStatsRoute[]) => {
    setProviderOpen(provider, !isProviderOpen(provider, providerRoutes));
  };
  const expandGroup = (provider: string) => {
    setProviderOpen(provider, true);
    setExpandedProviders((current) => new Set(current).add(provider));
  };
  const collapseAll = () => {
    setProviderOpenOverrides(new Map(groups.map(([provider]) => [provider, false])));
    setExpandedProviders(new Set());
  };
  const expandAll = () => {
    setProviderOpenOverrides(new Map(groups.map(([provider]) => [provider, true])));
    setExpandedProviders(new Set(groups.map(([provider]) => provider)));
  };

  return (
    <div className="page-shell space-y-5">
      <div className="card-surface flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <div className="mr-auto min-w-[210px]">
          <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            <Pulse size={12} weight="bold" /> TPS + TTFT
          </div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Provider monitor</h2>
        </div>
        <Stat label="Providers" value={formatNumber(providerCount, 0)} />
        <Stat label="TPS routes" value={formatNumber(tpsRouteCount, 0)} accent />
        <Stat label="Local" value={formatNumber(observedCount, 0)} />
        <Stat label="Market" value={formatNumber(marketCount, 0)} />
        <Stat label="Fastest p50" value={fastestMarket?.marketTps !== null && fastestMarket ? formatTps(fastestMarket.marketTps) : '—'} />
      </div>

      <div className="card-surface flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[220px] flex-1 max-w-xl">
          <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search providers or models"
            aria-label="Search provider performance"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-accent/40"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
          {(['all', 'local', 'market'] as SourceFilter[]).map((item) => (
            <button
              key={item}
              onClick={() => setSource(item)}
              aria-pressed={source === item}
              className={`rounded-md px-2.5 py-1.5 text-2xs font-medium capitalize transition-colors ${source === item ? 'bg-accent/10 text-accent' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              {item}
            </button>
          ))}
        </div>
        {groups.length > 0 && (
          <div className="flex items-center gap-1">
            <button onClick={expandAll} className="rounded-md px-2 py-1.5 text-2xs font-medium text-[var(--text-tertiary)] transition-colors hover:text-accent">Expand all</button>
            <button onClick={collapseAll} className="rounded-md px-2 py-1.5 text-2xs font-medium text-[var(--text-tertiary)] transition-colors hover:text-accent">Collapse all</button>
          </div>
        )}
      </div>

      {groups.map(([provider, providerRoutes]) => {
        const rollup = providerRollups.get(provider);
        const hasObserved = providerRoutes.some((route) => route.observed !== null);
        const collapsed = !isProviderOpen(provider, providerRoutes);
        const fullyExpanded = expandedProviders.has(provider);
        const visibleRoutes = fullyExpanded
          ? providerRoutes
          : providerRoutes.slice(0, DEFAULT_ROUTE_CAP);
        const hiddenCount = providerRoutes.length - visibleRoutes.length;
        return (
          <section key={provider} className="card-surface overflow-hidden">
            <button
              onClick={() => toggleCollapse(provider, providerRoutes)}
              aria-expanded={!collapsed}
              className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                {collapsed ? <CaretRight size={13} className="text-[var(--text-tertiary)]" /> : <CaretDown size={13} className="text-[var(--text-tertiary)]" />}
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">{provider}</h3>
                  <p className="text-2xs text-[var(--text-tertiary)]">{providerRoutes.length} route{providerRoutes.length === 1 ? '' : 's'}{hasObserved ? ' · observed' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-2xs text-[var(--text-tertiary)]">
                <span className="metric-mono">local <span className={hasObserved ? 'text-moss' : ''}>{rollup?.localCalls ? formatNumber(rollup.localCalls, 0) : '0'}</span></span>
                <span className="metric-mono">avg local {rollup?.localTps !== null ? formatTps(rollup?.localTps ?? 0) : '—'}</span>
                <span className="metric-mono">avg market {rollup?.marketTps !== null ? formatTps(rollup?.marketTps ?? 0) : '—'}</span>
              </div>
            </button>
            {!collapsed && (
              <>
                <div className="flex flex-wrap gap-2 p-3">
                  {visibleRoutes.map((route) => <RouteCard key={`${route.provider}:${route.modelId}`} route={route} active={active} />)}
                </div>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => expandGroup(provider)}
                    className="border-t border-[var(--border)] px-4 py-2.5 text-2xs font-medium text-accent transition-colors hover:bg-accent/5"
                  >
                    Show {hiddenCount} more {provider} route{hiddenCount === 1 ? '' : 's'}
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

      {routes.length === 0 ? (
        <div role="status" className="card-surface px-6 py-16 text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Provider catalog unavailable</p>
          <p className="mx-auto mt-1 max-w-md text-2xs leading-relaxed text-[var(--text-tertiary)]">
            The market catalog did not load, so no provider routes can be shown. This is not a filter problem — check your connection and reload.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div role="status" className="card-surface px-6 py-16 text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">No provider routes match these filters</p>
          <p className="mx-auto mt-1 max-w-md text-2xs leading-relaxed text-[var(--text-tertiary)]">
            {routes.length.toLocaleString()} routes are loaded but none match the current search or source filter.
          </p>
          <button type="button" onClick={() => { setSearch(''); setSource('all'); }} className="mt-4 min-h-9 rounded-md border border-[var(--border)] px-3 text-2xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">Clear filters</button>
        </div>
      ) : null}

      <p className="text-2xs leading-relaxed text-[var(--text-tertiary)]">
        Market values are external p50/p90 benchmarks and may differ from your workload. Observed values come only from locally collected pi-tps telemetry.
      </p>
    </div>
  );
}

function RouteCard({ route, active }: { route: ProviderStatsRoute; active: boolean }) {
  const hasLocalTiming = route.observed !== null
    && (route.observed.avgTps !== null || route.observed.avgTtftMs !== null);
  const primaryTps = hasLocalTiming ? route.observed?.avgTps ?? null : route.marketTps;
  const primaryTtft = hasLocalTiming ? route.observed?.avgTtftMs ?? null : route.marketTtftMs;
  const profile = useMemo(() => buildProviderBenchmarkProfile(route), [route]);
  const hasProfile = profile.some((point) => point.tps !== null || point.ttftMs !== null);

  return (
    <article className="w-full shrink-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-3 sm:w-[320px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]" title={route.modelId}>{route.modelName}</h4>
          <p className="truncate text-2xs text-[var(--text-tertiary)]" title={route.modelId}>{route.modelId}</p>
        </div>
        {hasLocalTiming ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-moss/10 px-1.5 py-0.5 text-2xs font-semibold uppercase text-moss"><CheckCircle size={9} weight="fill" /> local</span>
        ) : (
          <span className="shrink-0 rounded-sm bg-accent/10 px-1.5 py-0.5 text-2xs font-semibold uppercase text-accent">market p50</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 text-2xs text-[var(--text-tertiary)]">
        <span className="metric-mono">{route.contextLength !== null ? `${formatNumber(route.contextLength / 1000, 0)}k ctx` : 'ctx —'}</span>
        {route.observed !== null && <span className="metric-mono">{formatNumber(route.observed.callCount, 0)} calls</span>}
      </div>

      <div className="mt-3 grid grid-cols-4">
        <PrimaryMetric icon={Clock} label="TTFT" value={primaryTtft !== null ? formatDuration(Math.round(primaryTtft)) : '—'} />
        <PrimaryMetric icon={Gauge} label="TPS" value={primaryTps !== null ? formatTps(primaryTps) : '—'} accent />
        <PrimaryMetric icon={Timer} label="TTFT p90" value={route.marketTtftP90Ms !== null ? formatDuration(Math.round(route.marketTtftP90Ms)) : '—'} />
        <PrimaryMetric icon={Pulse} label="Uptime" value={route.uptime30m !== null ? `${route.uptime30m.toFixed(1)}%` : '—'} />
      </div>

      <figure className="mt-2 rounded-md bg-[var(--surface-inset)]/80 p-2 dark:bg-[var(--surface-muted)]" aria-label={`${route.modelName} benchmark profile`}>
        {hasProfile ? (
          <>
            <div className="mb-1 flex items-center justify-between text-2xs text-[var(--text-tertiary)]">
              <span>Benchmark profile</span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--chart-primary)]" /> TPS</span>
                <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--chart-secondary)]" /> TTFT</span>
              </span>
            </div>
            <div style={{ height: 96 }}>
              {active && <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
                <LineChart data={profile} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid strokeDasharray="2 3" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="percentile" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis yAxisId="tps" hide domain={['auto', 'auto']} />
                  <YAxis yAxisId="ttft" orientation="right" hide domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    formatter={(value, name) => name === 'TTFT' ? [formatDuration(Math.round(Number(value))), name] : [formatTps(Number(value)), name]}
                  />
                  <Line yAxisId="tps" type="monotone" dataKey="tps" name="TPS" stroke="var(--chart-primary)" strokeWidth={1.75} dot={{ r: 2.5, fill: 'var(--chart-primary)' }} connectNulls={false} />
                  <Line yAxisId="ttft" type="monotone" dataKey="ttftMs" name="TTFT" stroke="var(--chart-secondary)" strokeWidth={1.75} dot={{ r: 2.5, fill: 'var(--chart-secondary)' }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>}
            </div>
            <dl className="sr-only">
              {profile.map((point) => (
                <div key={point.percentile}>
                  <dt>{point.percentile}</dt>
                  <dd>{point.tps === null ? 'TPS unavailable' : `${formatTps(point.tps)} TPS`}; {point.ttftMs === null ? 'TTFT unavailable' : `${formatDuration(Math.round(point.ttftMs))} TTFT`}.</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="grid h-[112px] place-items-center text-center text-2xs text-[var(--text-tertiary)]">
            <div>
              <p className="font-medium text-[var(--text-secondary)]">No benchmark profile</p>
              <p className="mt-0.5 text-2xs">Local-only route; market percentiles unavailable.</p>
            </div>
          </div>
        )}
      </figure>
    </article>
  );
}

function PrimaryMetric({ icon: Icon, label, value, accent = false }: { icon: typeof Gauge; label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 border-l border-[var(--border)] px-2 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"><Icon size={11} /> {label}</div>
      <p className={`metric-mono mt-1 text-sm font-semibold tracking-tight ${accent ? 'text-[var(--brand-text)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-[72px] border-l border-[var(--border)] pl-4">
      <p className="text-2xs uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`metric-mono mt-1 text-lg font-semibold ${accent ? 'text-[var(--brand-text)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
}

export default memo(ProviderStats);
