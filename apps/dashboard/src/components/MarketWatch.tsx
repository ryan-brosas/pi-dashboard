import { memo, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise, Binoculars, CheckCircle, MagnifyingGlass, ShieldCheck, TrendDown,
} from '@phosphor-icons/react';
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  compareModelPricing, formatCurrency, formatNumber,
  type ModelPricingComparison, type PricingModel, type TokenUsageMix,
} from '@pi-tps/metrics-core';
import { useDuckQuery } from '../hooks/useDuckQuery';
import { usePricingCatalog } from '../hooks/usePricingCatalog';
import { queryUsageDashboard, type UsageRange } from '../lib/usageQueries';
import { priceUsageDashboard } from '../lib/usagePricing';

const WATCH_RANGES: { key: UsageRange; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'Lifetime' },
];

type WatchMode = 'market' | 'savings';
const MARKET_PAGE_SIZE = 100;

function shortModel(id: string): string {
  return id.split('/').pop() ?? id;
}

function rate(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

function context(value: number | null): string {
  return value === null ? '—' : formatNumber(value, 0);
}

function freshness(generatedAt: string, fetchedAt: number | null): string {
  const source = new Date(generatedAt);
  if (Number.isFinite(source.getTime())) return `catalog ${source.toLocaleString()}`;
  return fetchedAt ? `fetched ${new Date(fetchedAt).toLocaleString()}` : 'catalog time unavailable';
}

function modelKey(model: PricingModel): string {
  return `${model.provider}:${model.id}`;
}

function MarketWatch({
  dbVersion,
  pricing,
  active = true,
}: {
  dbVersion: number;
  pricing: ReturnType<typeof usePricingCatalog>;
  active?: boolean;
}) {
  const [mode, setMode] = useState<WatchMode>('market');
  const [range, setRange] = useState<UsageRange>('all');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [zdrOnly, setZdrOnly] = useState(false);
  const { catalog, fetchedAt, loading: catalogLoading, error: catalogError, refresh } = pricing;
  const { data: usage, loading: usageLoading, error: usageError } = useDuckQuery(
    () => queryUsageDashboard(range),
    [dbVersion, range],
    { skip: dbVersion === 0 },
  );

  const pricedUsage = useMemo(
    () => usage ? priceUsageDashboard(usage, catalog) : null,
    [catalog, usage],
  );

  const providers = useMemo(
    () => [...new Set(catalog?.models.map((model) => model.provider) ?? [])].sort(),
    [catalog],
  );

  const filteredModels = useMemo(() => {
    if (!catalog) return [];
    const query = search.trim().toLowerCase();
    return catalog.models
      .filter((model) => {
        const matchesSearch = query.length === 0 || [model.id, model.name, model.org, model.provider]
          .some((value) => value.toLowerCase().includes(query));
        return matchesSearch
          && (provider === 'all' || model.provider === provider)
          && (!zdrOnly || model.zdr);
      })
      .sort((a, b) => {
        const aPrice = a.pricing.input + a.pricing.output;
        const bPrice = b.pricing.input + b.pricing.output;
        return aPrice - bPrice || a.id.localeCompare(b.id);
      });
  }, [catalog, provider, search, zdrOnly]);

  const usageMix = useMemo<TokenUsageMix | null>(() => pricedUsage && pricedUsage.summary.totalCalls > 0 ? {
    inputTokens: pricedUsage.summary.inputTokens,
    cacheReadTokens: pricedUsage.summary.cacheReadTokens,
    cacheWriteTokens: pricedUsage.summary.cacheWriteTokens,
    outputTokens: pricedUsage.summary.outputTokens,
  } : null, [pricedUsage]);

  const comparisons = useMemo(
    () => usageMix
      ? compareModelPricing(filteredModels, usageMix, pricedUsage?.summary.totalCostUsd ?? null)
      : [],
    [filteredModels, pricedUsage?.summary.totalCostUsd, usageMix],
  );

  const observedModels = useMemo(
    () => new Set(pricedUsage?.models
      .flatMap((model) => model.pricingModel ? [modelKey(model.pricingModel)] : []) ?? []),
    [pricedUsage],
  );

  if (catalogLoading && !catalog) {
    return <div role="status" className="min-h-[60dvh] grid place-items-center text-sm text-zinc-400">Loading the model market…</div>;
  }
  if (catalogError && !catalog) {
    return <div role="alert" className="m-8 rounded-2xl border border-ember/20 bg-ember/5 p-5 text-sm text-ember">Pricing watcher failed: {catalogError}</div>;
  }
  if (!catalog) return null;

  const savingsAvailable = usageMix !== null;
  const savingsMode = mode === 'savings';
  const savingsLoading = savingsMode && usageLoading;
  const totalTokens = pricedUsage?.summary.totalTokens ?? 0;
  const usedMatches = comparisons.filter((row) => observedModels.has(modelKey(row.model))).length;
  const chartData = comparisons.slice(0, 12).map((row) => ({
    model: `${row.model.provider} · ${shortModel(row.model.id)}`,
    cost: Number(row.totalCostUsd.toFixed(4)),
  }));
  const filteredProviders = new Set(filteredModels.map((model) => model.provider)).size;
  const zdrCount = filteredModels.filter((model) => model.zdr).length;
  const discountCount = filteredModels.filter((model) => model.discount > 0).length;
  const subscriptionCount = filteredModels.filter((model) => model.subscription).length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            <Binoculars size={13} weight="bold" /> Independent model market
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {savingsMode ? 'Find savings for your workload' : 'Search models and provider pricing'}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
            {savingsMode
              ? 'Apply your observed input, cache, and output tokens to every watched provider route.'
              : 'Explore pricing, context limits, privacy options, discounts, and subscriptions without uploading telemetry.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <button
              type="button"
              onClick={() => setMode('market')}
              aria-pressed={mode === 'market'}
              className={`rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${mode === 'market' ? 'bg-[var(--surface-muted)] text-[var(--brand-text)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              Market
            </button>
            <button
              type="button"
              onClick={() => setMode('savings')}
              aria-pressed={mode === 'savings'}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${mode === 'savings' ? 'bg-[var(--surface-muted)] text-[var(--chart-positive)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <TrendDown size={11} weight="bold" /> Savings
            </button>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)]">{freshness(catalog.generatedAt, fetchedAt)}</span>
          <button
            type="button"
            onClick={refresh}
            disabled={catalogLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <ArrowClockwise size={12} className={catalogLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {catalogError && (
        <div role="alert" className="rounded-xl border border-ember/20 bg-ember/5 px-4 py-3 text-xs text-ember">
          Watcher refresh failed. {catalogError} Showing the last valid catalog.
        </div>
      )}

      {savingsMode && usageError && (
        <div role="alert" className="rounded-xl border border-ember/20 bg-ember/5 px-4 py-3 text-xs text-ember">Usage query failed: {String(usageError)}</div>
      )}

      {savingsMode && pricedUsage && (pricedUsage.summary.estimatedModelCount > 0 || pricedUsage.summary.unpricedModelCount > 0) && (
        <div className="rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          {pricedUsage.summary.estimatedModelCount > 0 && `${pricedUsage.summary.estimatedModelCount} observed route${pricedUsage.summary.estimatedModelCount === 1 ? '' : 's'} use market catalog pricing.`}
          {pricedUsage.summary.unpricedModelCount > 0 && ` ${pricedUsage.summary.unpricedModelCount} route${pricedUsage.summary.unpricedModelCount === 1 ? '' : 's'} remain unpriced.`}
        </div>
      )}

      {savingsMode && !savingsAvailable && !usageLoading && (
        <div role="status" className="card-surface flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Savings needs usage data</p>
            <p className="mt-1 text-xs text-zinc-400">Connect the collector or upload telemetry to compare this catalog against your actual token mix.</p>
          </div>
          <button onClick={() => setMode('market')} className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent">Browse the market</button>
        </div>
      )}

      {savingsLoading ? (
        <div
          role="status"
          className="card-surface grid min-h-[350px] place-items-center p-6 text-sm text-[var(--text-tertiary)]"
        >
          Loading savings for the selected range…
        </div>
      ) : savingsMode && savingsAvailable ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <WatchMetric label={pricedUsage?.summary.estimatedModelCount ? 'Baseline cost (est.)' : 'Observed cost'} value={formatCurrency(pricedUsage?.summary.totalCostUsd ?? 0)} accent />
              <WatchMetric label="Compared tokens" value={formatNumber(totalTokens)} />
              <WatchMetric label="Market routes" value={formatNumber(catalog.models.length, 0)} />
              <WatchMetric label="Providers" value={formatNumber(providers.length, 0)} />
              <WatchMetric label="Used matches" value={formatNumber(usedMatches, 0)} />
              <WatchMetric label="Results" value={formatNumber(comparisons.length, 0)} />
            </div>
            <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
              {WATCH_RANGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  aria-pressed={range === item.key}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${range === item.key ? 'bg-accent/10 text-accent dark:bg-accent/15' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="card-surface min-h-[350px] p-5 xl:col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Projected cost</p>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Lowest-cost routes for your actual token mix</h3>
              {active && <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 1, height: 280 }}>
                <BarChart
                  title="Projected cost by provider route"
                  desc="Lowest-cost provider routes calculated from the observed token mix."
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 16, right: 18, left: 12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" tickFormatter={(value) => `$${Number(value).toFixed(Number(value) < 1 ? 2 : 0)}`} tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" width={145} tick={{ fontSize: 9, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }} formatter={(value) => formatCurrency(Number(value))} />
                  {(pricedUsage?.summary.totalCostUsd ?? 0) > 0 && <ReferenceLine x={pricedUsage?.summary.totalCostUsd} stroke="var(--chart-warning)" strokeDasharray="4 4" label={{ value: 'baseline', fill: 'var(--chart-warning)', fontSize: 9 }} />}
                  <Bar dataKey="cost" name="Projected cost" fill="var(--chart-primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </div>

            <div className="card-surface p-5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Observed mix</p>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tokens in the selected range</h3>
              <div className="mt-5 space-y-4">
                <MixRow label="Fresh input" value={pricedUsage?.summary.inputTokens ?? 0} total={totalTokens} color="bg-accent" />
                <MixRow label="Cache reads" value={pricedUsage?.summary.cacheReadTokens ?? 0} total={totalTokens} color="bg-moss" />
                <MixRow label="Cache writes" value={pricedUsage?.summary.cacheWriteTokens ?? 0} total={totalTokens} color="bg-violet-500" />
                <MixRow label="Output" value={pricedUsage?.summary.outputTokens ?? 0} total={totalTokens} color="bg-amber-500" />
              </div>
              <div className="mt-5 border-t border-zinc-200/50 pt-4 text-[11px] leading-relaxed text-zinc-400 dark:border-white/[0.06]">
                Cache-specific rates are used when available. Otherwise the input rate is the conservative fallback.
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <WatchMetric label="Market routes" value={formatNumber(filteredModels.length, 0)} accent />
          <WatchMetric label="Providers" value={formatNumber(filteredProviders, 0)} />
          <WatchMetric label="ZDR routes" value={formatNumber(zdrCount, 0)} />
          <WatchMetric label="Discounts" value={formatNumber(discountCount, 0)} />
          <WatchMetric label="Subscriptions" value={formatNumber(subscriptionCount, 0)} />
          <WatchMetric label="Full catalog" value={formatNumber(catalog.models.length, 0)} />
        </div>
      )}

      {!savingsLoading && (
        <MarketTable
          key={savingsMode ? 'savings' : 'market'}
          models={savingsMode && savingsAvailable ? comparisons.map((row) => row.model) : filteredModels}
          comparisons={savingsMode && savingsAvailable ? comparisons : []}
          observedModels={observedModels}
          savingsMode={savingsMode && savingsAvailable}
          search={search}
          setSearch={setSearch}
          provider={provider}
          setProvider={setProvider}
          providers={providers}
          zdrOnly={zdrOnly}
          setZdrOnly={setZdrOnly}
        />
      )}

      <div className="text-[10px] text-zinc-400">
        Market pricing and provider metadata refresh every Monday, Wednesday, and Friday. Verify official provider pricing before switching.
      </div>
    </div>
  );
}

interface MarketTableProps {
  models: PricingModel[];
  comparisons: ModelPricingComparison[];
  observedModels: Set<string>;
  savingsMode: boolean;
  search: string;
  setSearch: (value: string) => void;
  provider: string;
  setProvider: (value: string) => void;
  providers: string[];
  zdrOnly: boolean;
  setZdrOnly: (value: boolean) => void;
}

export function MarketTable(props: MarketTableProps) {
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const comparisonByModel = useMemo(
    () => new Map(props.comparisons.map((row) => [modelKey(row.model), row])),
    [props.comparisons],
  );
  const lastPage = Math.max(0, Math.ceil(props.models.length / MARKET_PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageStart = currentPage * MARKET_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + MARKET_PAGE_SIZE, props.models.length);
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    scrollRef.current?.scrollTo?.({ top: 0 });
  };
  const resetPage = () => changePage(0);
  return (
    <div className="card-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={props.search}
            onChange={(event) => {
              resetPage();
              props.setSearch(event.target.value);
            }}
            placeholder="Search models, providers, or organizations"
            aria-label="Search model market"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
          />
        </div>
        <select
          value={props.provider}
          onChange={(event) => {
            resetPage();
            props.setProvider(event.target.value);
          }}
          aria-label="Provider"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
        >
          <option value="all">All providers</option>
          {props.providers.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={props.zdrOnly} onChange={(event) => {
            resetPage();
            props.setZdrOnly(event.target.checked);
          }} className="accent-cyan-500" />
          <ShieldCheck size={13} /> ZDR only
        </label>
      </div>

      <div ref={scrollRef} className="max-h-[60dvh] overflow-auto">
        <table className={`w-full text-[11px] ${props.savingsMode ? 'min-w-[1120px]' : 'min-w-[850px]'}`}>
          <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]">
            <tr className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
              <th className="px-5 py-2.5 text-left">Model</th>
              <th className="px-3 py-2.5 text-left">Provider</th>
              <th className="px-3 py-2.5 text-right">Input $/M</th>
              <th className="px-3 py-2.5 text-right">Cache $/M</th>
              <th className="px-3 py-2.5 text-right">Output $/M</th>
              <th className="px-3 py-2.5 text-right">Context</th>
              <th className="px-3 py-2.5 text-right">Uptime</th>
              {props.savingsMode && <th className="px-3 py-2.5 text-right">Blended $/M</th>}
              {props.savingsMode && <th className="px-3 py-2.5 text-right">Projected</th>}
              {props.savingsMode && <th className="px-5 py-2.5 text-right">Savings</th>}
            </tr>
          </thead>
          <tbody>
            {props.models.slice(pageStart, pageEnd).map((model) => (
              <MarketRow
                key={modelKey(model)}
                model={model}
                comparison={comparisonByModel.get(modelKey(model))}
                observed={props.observedModels.has(modelKey(model))}
              />
            ))}
          </tbody>
        </table>
        {props.models.length === 0 && <div className="py-12 text-center text-xs text-[var(--text-tertiary)]">No catalog routes match these filters.</div>}
      </div>
      {props.models.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-[var(--text-tertiary)]">
          <span aria-live="polite">
            {props.models.length <= MARKET_PAGE_SIZE
              ? `Showing all ${props.models.length.toLocaleString()} routes`
              : `Showing ${(pageStart + 1).toLocaleString()}–${pageEnd.toLocaleString()} of ${props.models.length.toLocaleString()} routes`}
          </span>
          <div className="flex items-center gap-1">
            {currentPage > 0 && (
              <button
                type="button"
                onClick={() => changePage(currentPage - 1)}
                className="h-7 rounded-md px-2.5 font-medium text-accent transition-colors hover:bg-accent/5"
              >
                Previous
              </button>
            )}
            {pageEnd < props.models.length && (
              <button
                type="button"
                onClick={() => changePage(currentPage + 1)}
                className="h-7 rounded-md px-2.5 font-medium text-accent transition-colors hover:bg-accent/5"
              >
                Next {Math.min(MARKET_PAGE_SIZE, props.models.length - pageEnd).toLocaleString()}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WatchMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card-surface px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`metric-mono mt-0.5 text-base font-semibold ${accent ? 'text-[var(--brand-text)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
}

function MixRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="metric-mono text-zinc-700 dark:text-zinc-300">{formatNumber(value)} · {percentage.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.05]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </div>
  );
}

function MarketRow({
  model,
  comparison,
  observed,
}: {
  model: PricingModel;
  comparison?: ModelPricingComparison;
  observed: boolean;
}) {
  const savingsPositive = comparison?.savingsUsd !== null && (comparison?.savingsUsd ?? 0) > 0;
  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)]">
      <td className="max-w-[300px] px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-[var(--text-primary)]" title={model.id}>{shortModel(model.id)}</span>
          {observed && <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-accent"><CheckCircle size={9} weight="fill" /> used</span>}
          {model.zdr && <span className="rounded bg-moss/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-moss">ZDR</span>}
          {model.subscription && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-violet-500">Sub</span>}
          {model.discount > 0 && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-amber-600">−{Math.round(model.discount * 100)}%</span>}
        </div>
        <span className="block truncate text-[9px] text-[var(--text-tertiary)]">{model.org}</span>
      </td>
      <td className="px-3 py-2 text-[var(--text-secondary)]">{model.providerDisplay}</td>
      <td className="metric-mono px-3 py-2.5 text-right">{rate(model.pricing.input)}</td>
      <td className="metric-mono px-3 py-2.5 text-right">{rate(model.pricing.cacheRead)}</td>
      <td className="metric-mono px-3 py-2.5 text-right">{rate(model.pricing.output)}</td>
      <td className="metric-mono px-3 py-2.5 text-right">{context(model.contextLength)}</td>
      <td className="metric-mono px-3 py-2.5 text-right">{model.uptime30m === null ? '—' : `${model.uptime30m.toFixed(1)}%`}</td>
      {comparison && <td className="metric-mono px-3 py-2.5 text-right">{rate(comparison.blendedRateUsdPerM)}</td>}
      {comparison && <td className="metric-mono px-3 py-2.5 text-right font-medium text-zinc-700 dark:text-zinc-300">{formatCurrency(comparison.totalCostUsd)}</td>}
      {comparison && (
        <td className={`metric-mono px-5 py-2.5 text-right font-medium ${savingsPositive ? 'text-moss' : 'text-zinc-400'}`}>
          {comparison.savingsUsd === null ? '—' : `${savingsPositive ? '−' : '+'}${formatCurrency(Math.abs(comparison.savingsUsd))}`}
          {comparison.savingsPct !== null && <span className="ml-1 text-[9px] opacity-70">({Math.abs(comparison.savingsPct).toFixed(1)}%)</span>}
        </td>
      )}
    </tr>
  );
}

export default memo(MarketWatch);
