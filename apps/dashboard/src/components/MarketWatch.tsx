import { memo, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowClockwise, Binoculars, CheckCircle, MagnifyingGlass, ShieldCheck, TrendDown,
} from '@phosphor-icons/react';
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  calculateSubscriptionBreakEven, canonicalPerformanceModelId, comparePaygDeals, formatCurrency, formatNumber, resolvePricingModel,
  type PaygDealComparison, type PricingModel, type TokenUsageMix,
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

const CONTEXT_OPTIONS = [
  { value: 0, label: 'Any context' },
  { value: 32_000, label: '32K+' },
  { value: 128_000, label: '128K+' },
  { value: 200_000, label: '200K+' },
  { value: 1_000_000, label: '1M+' },
];
const UPTIME_OPTIONS = [
  { value: 0, label: 'Any uptime' },
  { value: 99, label: '99%+' },
  { value: 99.9, label: '99.9%+' },
];
const TPS_OPTIONS = [
  { value: 0, label: 'Any TPS' },
  { value: 20, label: '20+ TPS' },
  { value: 50, label: '50+ TPS' },
  { value: 100, label: '100+ TPS' },
];
const LATENCY_OPTIONS = [
  { value: 0, label: 'Any latency' },
  { value: 1_000, label: '≤1s' },
  { value: 3_000, label: '≤3s' },
  { value: 5_000, label: '≤5s' },
];

type WatchMode = 'market' | 'payg' | 'subscription';
type BillingOption = 'all' | 'without-subscription' | 'subscription';

interface SubscriptionPlanPreset {
  id: string;
  name: string;
  monthlyPriceUsd: number;
  limitNote: string;
  sourceUrl: string | null;
}

const SUBSCRIPTION_PLANS: SubscriptionPlanPreset[] = [
  {
    id: 'claude-pro',
    name: 'Claude Pro',
    monthlyPriceUsd: 20,
    limitNote: 'At least 5× Free usage per five-hour session; additional weekly, monthly, model, and feature caps may apply.',
    sourceUrl: 'https://www.anthropic.com/pricing',
  },
  {
    id: 'claude-max-5x',
    name: 'Claude Max 5×',
    monthlyPriceUsd: 100,
    limitNote: '5× Pro usage per five-hour session with higher output limits; additional caps may apply.',
    sourceUrl: 'https://www.anthropic.com/pricing',
  },
  {
    id: 'custom',
    name: 'Custom plan',
    monthlyPriceUsd: 20,
    limitNote: 'Enter the current fee and verify the plan’s model access, quotas, and rate limits.',
    sourceUrl: null,
  },
];
const MARKET_PAGE_SIZE = 100;

function shortModel(id: string): string {
  return id.split('/').pop() ?? id;
}

function rate(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

function monthlyCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
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
  const [workloadMode, setWorkloadMode] = useState<'actual' | 'manual'>('actual');
  const [manualUsage, setManualUsage] = useState<TokenUsageMix>({
    inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0,
  });
  const [range, setRange] = useState<UsageRange>('all');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [billing, setBilling] = useState<BillingOption>('all');
  const [zdrOnly, setZdrOnly] = useState(false);
  const [stablePricingOnly, setStablePricingOnly] = useState(false);
  const [minContextLength, setMinContextLength] = useState(0);
  const [minUptime30m, setMinUptime30m] = useState(99);
  const [minThroughputP50, setMinThroughputP50] = useState(0);
  const [maxLatencyP50, setMaxLatencyP50] = useState(0);
  const { catalog, performance, fetchedAt, loading: catalogLoading, error: catalogError, refresh } = pricing;
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
        const billingTerms = model.subscription
          ? ['subscription', 'sub', 'coding plan']
          : ['metered', 'payg'];
        const matchesSearch = query.length === 0
          || [model.id, model.name, model.org, model.provider, ...billingTerms]
            .some((value) => value.toLowerCase().includes(query));
        return matchesSearch
          && (provider === 'all' || model.provider === provider)
          && (billing === 'all'
            || (billing === 'subscription' ? model.subscription : !model.subscription))
          && (!zdrOnly || model.zdr);
      })
      .sort((a, b) => {
        const aPrice = a.pricing.input + a.pricing.output;
        const bPrice = b.pricing.input + b.pricing.output;
        return aPrice - bPrice || a.id.localeCompare(b.id);
      });
  }, [billing, catalog, provider, search, zdrOnly]);

  const actualUsageMix = useMemo<TokenUsageMix | null>(() => pricedUsage && pricedUsage.summary.totalCalls > 0 ? {
    inputTokens: pricedUsage.summary.inputTokens,
    cacheReadTokens: pricedUsage.summary.cacheReadTokens,
    cacheWriteTokens: pricedUsage.summary.cacheWriteTokens,
    outputTokens: pricedUsage.summary.outputTokens,
  } : null, [pricedUsage]);
  const manualTokens = manualUsage.inputTokens + manualUsage.cacheReadTokens
    + manualUsage.cacheWriteTokens + manualUsage.outputTokens;
  const usageMix = workloadMode === 'actual'
    ? actualUsageMix
    : manualTokens > 0 ? manualUsage : null;
  const observedCostUsd = workloadMode === 'actual' ? pricedUsage?.summary.totalCostUsd ?? null : null;

  const comparisons = useMemo(
    () => usageMix
      ? comparePaygDeals(
        filteredModels, usageMix, observedCostUsd, performance, { stablePricingOnly, zdrOnly },
      )
      : [],
    [filteredModels, observedCostUsd, performance, stablePricingOnly, usageMix, zdrOnly],
  );

  const constrainedComparisons = useMemo(
    () => usageMix
      ? comparePaygDeals(
        filteredModels, usageMix, observedCostUsd, performance,
        {
          stablePricingOnly,
          zdrOnly,
          minContextLength: minContextLength || undefined,
          minUptime30m: minUptime30m || undefined,
          minThroughputP50: minThroughputP50 || undefined,
          maxLatencyP50: maxLatencyP50 || undefined,
        },
      )
      : [],
    [
      filteredModels, maxLatencyP50, minContextLength, minThroughputP50, minUptime30m,
      observedCostUsd, performance, stablePricingOnly, usageMix, zdrOnly,
    ],
  );

  const observedRoutes = useMemo(() => pricedUsage?.models.flatMap((model) => {
    const route = model.pricingModel ?? (catalog
      ? resolvePricingModel(catalog.models, model.provider, model.modelId)?.model ?? null
      : null);
    return route ? [{ route, totalTokens: model.totalTokens }] : [];
  }) ?? [], [catalog, pricedUsage]);

  const dominantObservedRoute = useMemo(() => observedRoutes.reduce((largest, candidate) =>
    !largest || candidate.totalTokens > largest.totalTokens ? candidate : largest, observedRoutes[0])?.route ?? null,
  [observedRoutes]);

  const sameModelDeal = useMemo(() => {
    if (!dominantObservedRoute) return undefined;
    const canonicalId = canonicalPerformanceModelId(dominantObservedRoute.id);
    return comparisons.find((deal) =>
      deal.model.provider !== dominantObservedRoute.provider
      && canonicalPerformanceModelId(deal.model.id) === canonicalId);
  }, [comparisons, dominantObservedRoute]);

  const observedModels = useMemo(
    () => new Set(observedRoutes.map(({ route }) => modelKey(route))),
    [observedRoutes],
  );

  if (catalogLoading && !catalog) {
    return <div role="status" className="min-h-[60dvh] grid place-items-center text-sm text-zinc-400">Loading the model market…</div>;
  }
  if (catalogError && !catalog) {
    return <div role="alert" className="m-8 rounded-2xl border border-ember/20 bg-ember/5 p-5 text-sm text-ember">Pricing watcher failed: {catalogError}</div>;
  }
  if (!catalog) return null;

  const paygAvailable = usageMix !== null;
  const paygMode = mode === 'payg';
  const subscriptionMode = mode === 'subscription';
  const paygLoading = paygMode && workloadMode === 'actual' && usageLoading;
  const lowestPaygDeal = comparisons[0];
  const constrainedDeal = constrainedComparisons[0];
  const performanceCovered = constrainedComparisons.filter((deal) =>
    deal.performance?.throughput?.p50 !== null && deal.performance?.throughput?.p50 !== undefined
    || deal.performance?.latency?.p50 !== null && deal.performance?.latency?.p50 !== undefined).length;
  const fastestDeal = constrainedComparisons.reduce<PaygDealComparison | undefined>((fastest, deal) => {
    const throughput = deal.performance?.throughput?.p50 ?? null;
    if (throughput === null) return fastest;
    const fastestThroughput = fastest?.performance?.throughput?.p50 ?? null;
    return fastestThroughput === null || throughput > fastestThroughput
      || (throughput === fastestThroughput && deal.totalCostUsd < (fastest?.totalCostUsd ?? Infinity))
      ? deal : fastest;
  }, undefined);
  const constraintDescription = [
    minContextLength ? `${formatNumber(minContextLength, 0)}+ context` : null,
    minUptime30m ? `${minUptime30m}%+ uptime` : null,
    minThroughputP50 ? `${minThroughputP50}+ TPS` : null,
    maxLatencyP50 ? `≤${formatNumber(maxLatencyP50, 0)}ms latency` : null,
    stablePricingOnly ? 'stable prices' : null,
    zdrOnly ? 'ZDR' : null,
  ].filter(Boolean).join(', ');
  const totalTokens = usageMix
    ? usageMix.inputTokens + usageMix.cacheReadTokens + usageMix.cacheWriteTokens + usageMix.outputTokens
    : 0;
  const usedMatches = comparisons.filter((row) => observedModels.has(modelKey(row.model))).length;
  const chartData = constrainedComparisons.slice(0, 12).map((row) => ({
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
            {subscriptionMode
              ? 'Measure subscription value against PAYG'
              : paygMode ? 'Choose the best PAYG route for your workload' : 'Search models and provider pricing'}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
            {subscriptionMode
              ? 'See the monthly fee, PAYG-equivalent value, savings, and exact workload needed to break even.'
              : paygMode
                ? 'Compare pay-as-you-go routes using actual history or a manual monthly token estimate.'
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
              onClick={() => setMode('payg')}
              aria-pressed={mode === 'payg'}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${mode === 'payg' ? 'bg-[var(--surface-muted)] text-[var(--chart-positive)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <TrendDown size={11} weight="bold" /> PAYG Deals
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('subscription');
              }}
              aria-pressed={mode === 'subscription'}
              className={`rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${mode === 'subscription' ? 'bg-violet-500/10 text-violet-500' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              Subscription Value
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

      {paygMode && (
        <WorkloadControls
          mode={workloadMode}
          setMode={setWorkloadMode}
          actualAvailable={actualUsageMix !== null}
          actualLoading={usageLoading}
          usage={manualUsage}
          setUsage={setManualUsage}
        />
      )}

      {paygMode && workloadMode === 'actual' && usageError && (
        <div role="alert" className="rounded-xl border border-ember/20 bg-ember/5 px-4 py-3 text-xs text-ember">Usage query failed: {String(usageError)}</div>
      )}

      {paygMode && workloadMode === 'actual' && pricedUsage && (pricedUsage.summary.estimatedModelCount > 0 || pricedUsage.summary.unpricedModelCount > 0) && (
        <div className="rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          {pricedUsage.summary.estimatedModelCount > 0 && `${pricedUsage.summary.estimatedModelCount} observed route${pricedUsage.summary.estimatedModelCount === 1 ? '' : 's'} use market catalog pricing.`}
          {pricedUsage.summary.unpricedModelCount > 0 && ` ${pricedUsage.summary.unpricedModelCount} route${pricedUsage.summary.unpricedModelCount === 1 ? '' : 's'} remain unpriced.`}
        </div>
      )}

      {paygMode && !paygAvailable && !paygLoading && (
        <div role="status" className="card-surface flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {workloadMode === 'manual' ? 'Enter a monthly token estimate' : 'No usage history found'}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {workloadMode === 'manual'
                ? 'Add at least one token category above to calculate route and subscription value.'
                : 'Use a manual estimate, connect the collector, or upload telemetry.'}
            </p>
          </div>
          {workloadMode === 'actual' && (
            <button onClick={() => setWorkloadMode('manual')} className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent">Manual estimate</button>
          )}
        </div>
      )}

      {paygLoading ? (
        <div
          role="status"
          className="card-surface grid min-h-[350px] place-items-center p-6 text-sm text-[var(--text-tertiary)]"
        >
          {subscriptionMode ? 'Loading subscription value for the current month…' : 'Loading PAYG deals for the selected range…'}
        </div>
      ) : subscriptionMode ? (
        <SubscriptionValuePanel models={catalog.models} />
      ) : paygMode && paygAvailable ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {workloadMode === 'manual'
                ? <WatchMetric label="Workload" value="Manual monthly" accent />
                : <WatchMetric label={pricedUsage?.summary.estimatedModelCount ? 'Baseline cost (est.)' : 'Observed cost'} value={formatCurrency(pricedUsage?.summary.totalCostUsd ?? 0)} accent />}
              <WatchMetric label="Compared tokens" value={formatNumber(totalTokens)} />
              <WatchMetric label="Market routes" value={formatNumber(catalog.models.length, 0)} />
              <WatchMetric label="Providers" value={formatNumber(providers.length, 0)} />
              {workloadMode === 'manual'
                ? <WatchMetric label="Cost baseline" value="None" />
                : <WatchMetric label="Used matches" value={formatNumber(usedMatches, 0)} />}
              <WatchMetric label="Qualifying" value={formatNumber(constrainedComparisons.length, 0)} />
            </div>
            {workloadMode === 'actual' && (
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
            )}
          </div>

          <div className="card-surface flex flex-wrap items-end gap-2 p-3">
            <div className="mr-2 min-w-[150px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Deal constraints</p>
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Missing data cannot satisfy an enabled constraint.</p>
              <p className="mt-1 text-[9px] text-[var(--text-tertiary)]">Performance data: {performanceCovered} of {constrainedComparisons.length} qualifying routes.</p>
            </div>
            <DealConstraintSelect ariaLabel="Minimum context" value={minContextLength} setValue={setMinContextLength} options={CONTEXT_OPTIONS} />
            <DealConstraintSelect ariaLabel="Minimum uptime" value={minUptime30m} setValue={setMinUptime30m} options={UPTIME_OPTIONS} />
            <DealConstraintSelect ariaLabel="Minimum TPS" value={minThroughputP50} setValue={setMinThroughputP50} options={TPS_OPTIONS} />
            <DealConstraintSelect ariaLabel="Maximum latency" value={maxLatencyP50} setValue={setMaxLatencyP50} options={LATENCY_OPTIONS} />
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-[10px] text-[var(--text-secondary)]">
              <input
                aria-label="Stable prices only"
                type="checkbox"
                checked={stablePricingOnly}
                onChange={(event) => setStablePricingOnly(event.target.checked)}
                className="accent-cyan-500"
              />
              Stable prices only
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DealCard
              label="Lowest PAYG"
              deal={lowestPaygDeal}
              reason="Cheapest pay-as-you-go route for the selected token mix."
            />
            <DealCard
              label="Best same-model switch"
              deal={sameModelDeal}
              reason={dominantObservedRoute
                ? `Same model family as ${shortModel(dominantObservedRoute.id)}, through another provider.`
                : 'No observed model could be matched to a market route.'}
            />
            <DealCard
              label="Best under constraints"
              deal={constrainedDeal}
              reason={constraintDescription
                ? `Cheapest PAYG route matching ${constraintDescription}.`
                : 'Cheapest PAYG route with no additional constraints.'}
            />
            <DealCard
              label="Fastest qualifying"
              deal={fastestDeal}
              reason="Highest reported median TPS among routes meeting the active constraints."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="card-surface min-h-[350px] p-5 xl:col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Projected cost</p>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Lowest-cost routes for the selected token mix</h3>
              {active && <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 1, height: 280 }}>
                <BarChart
                  title="Projected cost by provider route"
                  desc="Lowest-cost provider routes calculated from the selected token mix."
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 16, right: 18, left: 12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" tickFormatter={(value) => `$${Number(value).toFixed(Number(value) < 1 ? 2 : 0)}`} tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" width={145} tick={{ fontSize: 9, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }} formatter={(value) => formatCurrency(Number(value))} />
                  {observedCostUsd !== null && observedCostUsd > 0 && <ReferenceLine x={observedCostUsd} stroke="var(--chart-warning)" strokeDasharray="4 4" label={{ value: 'baseline', fill: 'var(--chart-warning)', fontSize: 9 }} />}
                  <Bar dataKey="cost" name="Projected cost" fill="var(--chart-primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </div>

            <div className="card-surface p-5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">{workloadMode === 'manual' ? 'Estimated mix' : 'Observed mix'}</p>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{workloadMode === 'manual' ? 'Monthly token estimate' : 'Tokens in the selected range'}</h3>
              <div className="mt-5 space-y-4">
                <MixRow label="Fresh input" value={usageMix?.inputTokens ?? 0} total={totalTokens} color="bg-accent" />
                <MixRow label="Cache reads" value={usageMix?.cacheReadTokens ?? 0} total={totalTokens} color="bg-moss" />
                <MixRow label="Cache writes" value={usageMix?.cacheWriteTokens ?? 0} total={totalTokens} color="bg-violet-500" />
                <MixRow label="Output" value={usageMix?.outputTokens ?? 0} total={totalTokens} color="bg-amber-500" />
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

      {!paygLoading && !subscriptionMode && (
        <MarketTable
          key={mode}
          models={paygMode && paygAvailable ? constrainedComparisons.map((row) => row.model) : filteredModels}
          comparisons={paygMode && paygAvailable ? constrainedComparisons : []}
          observedModels={observedModels}
          paygMode={paygMode && paygAvailable}
          showSavings={paygMode && paygAvailable && observedCostUsd !== null}
          search={search}
          setSearch={setSearch}
          provider={provider}
          setProvider={setProvider}
          providers={providers}
          billing={billing}
          setBilling={setBilling}
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

type PaygRouteSort = 'cost' | 'throughput' | 'latency' | 'uptime';

interface MarketTableProps {
  models: PricingModel[];
  comparisons: PaygDealComparison[];
  observedModels: Set<string>;
  paygMode: boolean;
  showSavings: boolean;
  search: string;
  setSearch: (value: string) => void;
  provider: string;
  setProvider: (value: string) => void;
  providers: string[];
  billing: BillingOption;
  setBilling: (value: BillingOption) => void;
  zdrOnly: boolean;
  setZdrOnly: (value: boolean) => void;
}

export function MarketTable(props: MarketTableProps) {
  const [page, setPage] = useState(0);
  const [paygSort, setPaygSort] = useState<PaygRouteSort>('cost');
  const scrollRef = useRef<HTMLDivElement>(null);
  const comparisonByModel = useMemo(
    () => new Map(props.comparisons.map((row) => [modelKey(row.model), row])),
    [props.comparisons],
  );
  const sortedModels = useMemo(() => {
    if (!props.paygMode || paygSort === 'cost') return props.models;
    const optional = (a: number | null, b: number | null, ascending: boolean) => {
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return ascending ? a - b : b - a;
    };
    return [...props.models].sort((a, b) => {
      const aDeal = comparisonByModel.get(modelKey(a));
      const bDeal = comparisonByModel.get(modelKey(b));
      let result = 0;
      if (paygSort === 'throughput') {
        result = optional(
          aDeal?.performance?.throughput?.p50 ?? null,
          bDeal?.performance?.throughput?.p50 ?? null,
          false,
        );
      } else if (paygSort === 'latency') {
        result = optional(
          aDeal?.performance?.latency?.p50 ?? null,
          bDeal?.performance?.latency?.p50 ?? null,
          true,
        );
      } else if (paygSort === 'uptime') {
        result = optional(a.uptime30m, b.uptime30m, false);
      }
      return result || (aDeal?.totalCostUsd ?? Infinity) - (bDeal?.totalCostUsd ?? Infinity)
        || modelKey(a).localeCompare(modelKey(b));
    });
  }, [comparisonByModel, paygSort, props.models, props.paygMode]);
  const lastPage = Math.max(0, Math.ceil(sortedModels.length / MARKET_PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageStart = currentPage * MARKET_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + MARKET_PAGE_SIZE, sortedModels.length);
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
            placeholder="Search models, providers, organizations, or subscriptions"
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
        <select
          value={props.billing}
          onChange={(event) => {
            resetPage();
            props.setBilling(event.target.value as BillingOption);
          }}
          aria-label="Billing option"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
        >
          <option value="all">All billing options</option>
          <option value="subscription">Subscription offered</option>
          <option value="without-subscription">No subscription listed</option>
        </select>
        {props.paygMode && (
          <select
            value={paygSort}
            onChange={(event) => {
              resetPage();
              setPaygSort(event.target.value as PaygRouteSort);
            }}
            aria-label="Sort PAYG routes"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
          >
            <option value="cost">Lowest projected cost</option>
            <option value="throughput">Highest market TPS</option>
            <option value="latency">Lowest market latency</option>
            <option value="uptime">Highest uptime</option>
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={props.zdrOnly} onChange={(event) => {
            resetPage();
            props.setZdrOnly(event.target.checked);
          }} className="accent-cyan-500" />
          <ShieldCheck size={13} /> ZDR only
        </label>
      </div>

      <div ref={scrollRef} className="max-h-[60dvh] overflow-auto">
        <table className={`w-full text-[11px] ${props.paygMode ? 'min-w-[1280px]' : 'min-w-[850px]'}`}>
          <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]">
            <tr className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
              <th className="px-5 py-2.5 text-left">Model</th>
              <th className="px-3 py-2.5 text-left">Provider</th>
              <th className="px-3 py-2.5 text-right">Input $/M</th>
              <th className="px-3 py-2.5 text-right">Cache $/M</th>
              <th className="px-3 py-2.5 text-right">Output $/M</th>
              <th className="px-3 py-2.5 text-right">Context</th>
              <th className="px-3 py-2.5 text-right">Uptime</th>
              {props.paygMode && <th className="px-3 py-2.5 text-right">Market TPS</th>}
              {props.paygMode && <th className="px-3 py-2.5 text-right">Latency</th>}
              {props.paygMode && <th className="px-3 py-2.5 text-right">Blended $/M</th>}
              {props.paygMode && <th className="px-3 py-2.5 text-right">Projected</th>}
              {props.showSavings && <th className="px-5 py-2.5 text-right">Savings</th>}
            </tr>
          </thead>
          <tbody>
            {sortedModels.slice(pageStart, pageEnd).map((model) => (
              <MarketRow
                key={modelKey(model)}
                model={model}
                comparison={comparisonByModel.get(modelKey(model))}
                observed={props.observedModels.has(modelKey(model))}
                showSavings={props.showSavings}
              />
            ))}
          </tbody>
        </table>
        {sortedModels.length === 0 && <div className="py-12 text-center text-xs text-[var(--text-tertiary)]">No catalog routes match these filters.</div>}
      </div>
      {sortedModels.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-[var(--text-tertiary)]">
          <span aria-live="polite">
            {sortedModels.length <= MARKET_PAGE_SIZE
              ? `Showing all ${sortedModels.length.toLocaleString()} routes`
              : `Showing ${(pageStart + 1).toLocaleString()}–${pageEnd.toLocaleString()} of ${sortedModels.length.toLocaleString()} routes`}
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
            {pageEnd < sortedModels.length && (
              <button
                type="button"
                onClick={() => changePage(currentPage + 1)}
                className="h-7 rounded-md px-2.5 font-medium text-accent transition-colors hover:bg-accent/5"
              >
                Next {Math.min(MARKET_PAGE_SIZE, sortedModels.length - pageEnd).toLocaleString()}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionValuePanel({ models }: { models: PricingModel[] }) {
  const referenceModels = useMemo(() => {
    const directClaudeRoutes = models.filter((model) =>
      model.provider === 'anthropic'
      && model.id.startsWith('anthropic/claude-')
      && !model.id.includes(':batch')
      && !model.id.includes('-fast'));
    return ['haiku', 'sonnet', 'opus'].flatMap((tier) => {
      const candidates = directClaudeRoutes
        .filter((model) => model.id.includes(tier))
        .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
      return candidates.slice(0, 1);
    });
  }, [models]);
  const defaultReference = referenceModels.find((model) => model.id.includes('sonnet')) ?? referenceModels[0];
  const [referenceId, setReferenceId] = useState('');
  const [planId, setPlanId] = useState(SUBSCRIPTION_PLANS[0]!.id);
  const [monthlyPriceUsd, setMonthlyPriceUsd] = useState(SUBSCRIPTION_PLANS[0]!.monthlyPriceUsd);
  const [inputSharePercent, setInputSharePercent] = useState(80);
  const plan = SUBSCRIPTION_PLANS.find((candidate) => candidate.id === planId) ?? SUBSCRIPTION_PLANS[0]!;
  const reference = referenceModels.find((model) => model.id === referenceId) ?? defaultReference;
  const result = reference
    ? calculateSubscriptionBreakEven({
      monthlyPriceUsd,
      inputRateUsdPerM: reference.pricing.input,
      outputRateUsdPerM: reference.pricing.output,
      inputShare: inputSharePercent / 100,
    })
    : null;
  const value = result?.ok ? result.value : null;
  const outputSharePercent = 100 - inputSharePercent;

  return (
    <div className="space-y-4">
      <div className="card-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-500">Subscription value</p>
            <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">How many tokens make the monthly fee worthwhile?</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">
              Compare the plan fee with direct API pricing for a Claude model. Input and output are priced separately, using an editable 80/20 token mix by default.
            </p>
          </div>
          <div className="grid min-w-[280px] flex-1 gap-2 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-4">
            <label className="text-[9px] text-[var(--text-tertiary)]">
              <span className="mb-1 block">Plan preset</span>
              <select
                aria-label="Subscription plan"
                value={planId}
                onChange={(event) => {
                  const selected = SUBSCRIPTION_PLANS.find((candidate) => candidate.id === event.target.value);
                  if (!selected) return;
                  setPlanId(selected.id);
                  setMonthlyPriceUsd(selected.monthlyPriceUsd);
                }}
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
              >
                {SUBSCRIPTION_PLANS.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
            </label>
            <label className="text-[9px] text-[var(--text-tertiary)]">
              <span className="mb-1 block">Monthly fee in USD</span>
              <input
                aria-label="Monthly subscription price"
                type="number"
                min="0.01"
                step="1"
                value={monthlyPriceUsd}
                onChange={(event) => setMonthlyPriceUsd(Number(event.target.value))}
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
              />
            </label>
            <label className="text-[9px] text-[var(--text-tertiary)]">
              <span className="mb-1 block">Reference API model</span>
              <select
                aria-label="Subscription reference model"
                value={reference?.id ?? ''}
                onChange={(event) => setReferenceId(event.target.value)}
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
              >
                {referenceModels.map((model) => <option key={model.id} value={model.id}>{shortModel(model.id)}</option>)}
              </select>
            </label>
            <label className="text-[9px] text-[var(--text-tertiary)]">
              <span className="mb-1 block">Input share · output {outputSharePercent}%</span>
              <input
                aria-label="Input token share"
                type="number"
                min="0"
                max="100"
                step="1"
                value={inputSharePercent}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setInputSharePercent(Number.isFinite(next) ? Math.min(100, Math.max(0, next)) : 0);
                }}
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
              />
            </label>
          </div>
        </div>
      </div>

      {reference && value ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <WatchMetric label="Plan fee" value={monthlyCurrency(monthlyPriceUsd)} />
            <WatchMetric label="API input / M" value={rate(reference.pricing.input)} />
            <WatchMetric label="API output / M" value={rate(reference.pricing.output)} />
            <WatchMetric label="Blended / M" value={monthlyCurrency(value.blendedRateUsdPerM)} accent />
            <WatchMetric label="Break-even total" value={formatNumber(value.breakEvenTokens)} />
            <WatchMetric label="Token mix" value={`${inputSharePercent}% / ${outputSharePercent}%`} />
          </div>
          <div className="card-surface border-l-2 border-l-violet-500 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Break even at {formatNumber(value.breakEvenTokens)} monthly tokens.
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
              {formatNumber(value.breakEvenInputTokens)} input + {formatNumber(value.breakEvenOutputTokens)} output at {rate(reference.pricing.input)} input and {rate(reference.pricing.output)} output per million.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[var(--text-tertiary)]">
              <span>{formatNumber(value.breakEvenInputTokens)} input</span>
              <span>·</span>
              <span>{formatNumber(value.breakEvenOutputTokens)} output</span>
              <span>·</span>
              <span>{monthlyCurrency(value.blendedRateUsdPerM)} blended / M</span>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-tertiary)]">{plan.limitNote}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-amber-600">
              Usage caps are not expressed as token allowances in the market catalog. Break-even shows API-equivalent value, not a guarantee that the subscription permits this volume.
            </p>
            {plan.sourceUrl && <a className="mt-2 inline-block text-[10px] font-medium text-accent hover:underline" href={plan.sourceUrl} target="_blank" rel="noreferrer">Verify current plan terms</a>}
          </div>
        </>
      ) : (
        <div role="alert" className="card-surface p-4 text-xs text-ember">
          {result && !result.ok ? result.error : 'No direct Claude API reference model is available in the catalog.'}
        </div>
      )}
    </div>
  );
}

function WorkloadControls({
  mode, setMode, actualAvailable, actualLoading, usage, setUsage,
}: {
  mode: 'actual' | 'manual';
  setMode: (mode: 'actual' | 'manual') => void;
  actualAvailable: boolean;
  actualLoading: boolean;
  usage: TokenUsageMix;
  setUsage: Dispatch<SetStateAction<TokenUsageMix>>;
}) {
  const fields: { key: keyof TokenUsageMix; label: string }[] = [
    { key: 'inputTokens', label: 'Monthly fresh input tokens' },
    { key: 'cacheReadTokens', label: 'Monthly cache-read tokens' },
    { key: 'cacheWriteTokens', label: 'Monthly cache-write tokens' },
    { key: 'outputTokens', label: 'Monthly output tokens' },
  ];
  return (
    <div className="card-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Workload</p>
          <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Use local history or estimate a monthly token mix. Manual values stay in this browser tab.</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
          <button
            type="button"
            onClick={() => setMode('actual')}
            aria-pressed={mode === 'actual'}
            className={`rounded px-2.5 py-1.5 text-[10px] font-medium ${mode === 'actual' ? 'bg-[var(--surface-muted)] text-[var(--brand-text)]' : 'text-[var(--text-tertiary)]'}`}
          >
            Actual usage{actualLoading ? ' · loading' : actualAvailable ? '' : ' · unavailable'}
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            aria-pressed={mode === 'manual'}
            className={`rounded px-2.5 py-1.5 text-[10px] font-medium ${mode === 'manual' ? 'bg-[var(--surface-muted)] text-[var(--chart-positive)]' : 'text-[var(--text-tertiary)]'}`}
          >
            Manual estimate
          </button>
        </div>
      </div>
      {mode === 'manual' && (
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-medium text-[var(--text-primary)]">Manual monthly estimate</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {fields.map((field) => (
              <label key={field.key} className="text-[9px] text-[var(--text-tertiary)]">
                <span className="mb-1 block">{field.label.replace('Monthly ', '')}</span>
                <input
                  aria-label={field.label}
                  type="number"
                  min="0"
                  step="1000"
                  value={usage[field.key]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setUsage((current) => ({
                      ...current, [field.key]: Number.isFinite(value) && value > 0 ? value : 0,
                    }));
                  }}
                  className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DealConstraintSelect({
  ariaLabel, value, setValue, options,
}: {
  ariaLabel: string;
  value: number;
  setValue: (value: number) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => setValue(Number(event.target.value))}
      className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function DealCard({
  label, deal, reason,
}: {
  label: string;
  deal: PaygDealComparison | undefined;
  reason: string;
}) {
  return (
    <div className="card-surface p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</p>
      {deal ? (
        <>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{deal.model.providerDisplay}</p>
              <p className="truncate text-[10px] text-[var(--text-tertiary)]">{shortModel(deal.model.id)}</p>
            </div>
            <p className="metric-mono text-base font-semibold text-[var(--chart-positive)]">
              {formatCurrency(deal.totalCostUsd)}
            </p>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">{reason}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] text-[var(--text-tertiary)]">
            <span>{deal.model.uptime30m === null ? 'uptime unknown' : `${deal.model.uptime30m.toFixed(1)}% uptime`}</span>
            <span>·</span>
            <span>{deal.performance?.throughput?.p50 === null || deal.performance?.throughput?.p50 === undefined
              ? 'TPS unknown'
              : `${formatNumber(deal.performance.throughput.p50, 1)} TPS`}</span>
            <span>·</span>
            <span>{deal.performance?.latency?.p50 === null || deal.performance?.latency?.p50 === undefined
              ? 'latency unknown'
              : `${formatNumber(deal.performance.latency.p50, 0)}ms`}</span>
            {deal.estimatedCachePricing && <span className="text-amber-600">· cache rate estimated</span>}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-tertiary)]">No qualifying route in the current catalog and filters.</p>
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
  showSavings,
}: {
  model: PricingModel;
  comparison?: PaygDealComparison;
  observed: boolean;
  showSavings: boolean;
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
      {comparison && <td className="metric-mono px-3 py-2.5 text-right">
        {comparison.performance?.throughput?.p50 === null || comparison.performance?.throughput?.p50 === undefined
          ? '—' : formatNumber(comparison.performance.throughput.p50, 1)}
      </td>}
      {comparison && <td className="metric-mono px-3 py-2.5 text-right">
        {comparison.performance?.latency?.p50 === null || comparison.performance?.latency?.p50 === undefined
          ? '—' : `${formatNumber(comparison.performance.latency.p50, 0)}ms`}
      </td>}
      {comparison && <td className="metric-mono px-3 py-2.5 text-right">{rate(comparison.blendedRateUsdPerM)}</td>}
      {comparison && <td className="metric-mono px-3 py-2.5 text-right font-medium text-zinc-700 dark:text-zinc-300">{formatCurrency(comparison.totalCostUsd)}</td>}
      {comparison && showSavings && (
        <td className={`metric-mono px-5 py-2.5 text-right font-medium ${savingsPositive ? 'text-moss' : 'text-zinc-400'}`}>
          {comparison.savingsUsd === null ? '—' : `${savingsPositive ? '−' : '+'}${formatCurrency(Math.abs(comparison.savingsUsd))}`}
          {comparison.savingsPct !== null && <span className="ml-1 text-[9px] opacity-70">({Math.abs(comparison.savingsPct).toFixed(1)}%)</span>}
        </td>
      )}
    </tr>
  );
}

export default memo(MarketWatch);
