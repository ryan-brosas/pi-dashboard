import { memo, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowClockwise } from '@phosphor-icons/react';
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
import {
  priceUsageDashboard, summarizeSubscriptionUsage, type PricedUsageModelRow,
} from '../lib/usagePricing';

import {
  WATCH_RANGES, CONTEXT_OPTIONS, UPTIME_OPTIONS, TPS_OPTIONS, LATENCY_OPTIONS,
  SUBSCRIPTION_PLANS,
  type WatchMode, type BillingOption,
} from './market/constants';
import {
  shortModel, monthlyCurrency, subscriptionRate, freshness, modelKey,
} from './market/format';
import { MarketTable } from './market/MarketTable';

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
    return <div role="status" className="min-h-[60dvh] grid place-items-center text-sm text-[var(--text-tertiary)]">Loading the model market…</div>;
  }
  if (catalogError && !catalog) {
    return <div role="alert" className="m-8 rounded-md border border-ember/20 bg-ember/5 p-5 text-sm text-ember">Pricing watcher failed: {catalogError}</div>;
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
    <div className="page-shell space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Market mode" className="flex items-center gap-4">
          {([
            { value: 'market', label: 'Market' },
            { value: 'payg', label: 'PAYG Deals' },
            { value: 'subscription', label: 'Subscription Value' },
          ] as const).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              aria-pressed={mode === item.value}
              className={`text-2xs font-medium transition-colors ${
                mode === item.value
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xs text-[var(--text-tertiary)]">{freshness(catalog.generatedAt, fetchedAt)}</span>
          <button
            type="button"
            onClick={refresh}
            disabled={catalogLoading}
            className="inline-flex items-center gap-1.5 text-2xs font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <ArrowClockwise size={12} className={catalogLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {catalogError && (
        <div role="alert" className="rounded-md border border-ember/20 bg-ember/5 px-4 py-3 text-xs text-ember">
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
        <div role="alert" className="rounded-md border border-ember/20 bg-ember/5 px-4 py-3 text-xs text-ember">Usage query failed: {String(usageError)}</div>
      )}

      {paygMode && workloadMode === 'actual' && pricedUsage && (pricedUsage.summary.estimatedModelCount > 0 || pricedUsage.summary.unpricedModelCount > 0) && (
        <div className="rounded-md border border-[var(--border)] px-4 py-3 text-2xs text-[var(--text-secondary)]">
          {pricedUsage.summary.estimatedModelCount > 0 && `${pricedUsage.summary.estimatedModelCount} observed route${pricedUsage.summary.estimatedModelCount === 1 ? '' : 's'} use market catalog pricing.`}
          {pricedUsage.summary.unpricedModelCount > 0 && ` ${pricedUsage.summary.unpricedModelCount} route${pricedUsage.summary.unpricedModelCount === 1 ? '' : 's'} remain unpriced.`}
        </div>
      )}

      {paygMode && !paygAvailable && !paygLoading && (
        <div role="status" className="card-surface flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {workloadMode === 'manual' ? 'Enter a monthly token estimate' : 'No usage history found'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {workloadMode === 'manual'
                ? 'Add at least one token category above to calculate route and subscription value.'
                : 'Use a manual estimate, connect the collector, or upload telemetry.'}
            </p>
          </div>
          {workloadMode === 'actual' && (
            <button onClick={() => setWorkloadMode('manual')} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]">Manual estimate</button>
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
        <SubscriptionValuePanel models={catalog.models} monthUsage={pricedUsage?.monthModels ?? []} />
      ) : paygMode && paygAvailable ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {workloadMode === 'manual'
                ? <WatchMetric label="Workload" value="Manual monthly" />
                : <WatchMetric label={pricedUsage?.summary.estimatedModelCount ? 'Baseline cost (est.)' : 'Observed cost'} value={formatCurrency(pricedUsage?.summary.totalCostUsd ?? 0)} />}
              <WatchMetric label="Compared tokens" value={formatNumber(totalTokens)} />
              <WatchMetric label="Market routes" value={formatNumber(catalog.models.length, 0)} />
              <WatchMetric label="Providers" value={formatNumber(providers.length, 0)} />
              {workloadMode === 'manual'
                ? <WatchMetric label="Cost baseline" value="None" />
                : <WatchMetric label="Used matches" value={formatNumber(usedMatches, 0)} />}
              <WatchMetric label="Qualifying" value={formatNumber(constrainedComparisons.length, 0)} />
            </div>
            {workloadMode === 'actual' && (
              <div className="flex items-center gap-2">
                {WATCH_RANGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  aria-pressed={range === item.key}
                  className={`px-1.5 py-1 text-2xs font-medium transition-colors ${range === item.key ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                >
                  {item.label}
                </button>
                ))}
              </div>
            )}
          </div>

          <div className="card-surface flex flex-wrap items-end gap-2 p-3">
            <div className="mr-2 min-w-[150px]">
              <p className="ui-title">Deal constraints</p>
              <p className="mt-1 text-2xs text-[var(--text-tertiary)]">Performance data: {performanceCovered} of {constrainedComparisons.length} qualifying routes.</p>
            </div>
            <DealConstraintSelect ariaLabel="Minimum context" value={minContextLength} setValue={setMinContextLength} options={CONTEXT_OPTIONS} />
            <DealConstraintSelect ariaLabel="Minimum uptime" value={minUptime30m} setValue={setMinUptime30m} options={UPTIME_OPTIONS} />
            <DealConstraintSelect ariaLabel="Minimum TPS" value={minThroughputP50} setValue={setMinThroughputP50} options={TPS_OPTIONS} />
            <DealConstraintSelect ariaLabel="Maximum latency" value={maxLatencyP50} setValue={setMaxLatencyP50} options={LATENCY_OPTIONS} />
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-2xs text-[var(--text-secondary)]">
              <input
                aria-label="Stable prices only"
                type="checkbox"
                checked={stablePricingOnly}
                onChange={(event) => setStablePricingOnly(event.target.checked)}
                className="accent-[var(--brand)]"
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
              <h3 className="ui-title mb-4">Projected cost</h3>
              {active && <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 1, height: 280 }}>
                <BarChart
                  title="Projected cost by provider route"
                  desc="Lowest-cost provider routes calculated from the selected token mix."
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 16, right: 18, left: 12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" tickFormatter={(value) => `$${Number(value).toFixed(Number(value) < 1 ? 2 : 0)}`} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" width={145} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--overlay)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} formatter={(value) => formatCurrency(Number(value))} />
                  {observedCostUsd !== null && observedCostUsd > 0 && <ReferenceLine x={observedCostUsd} stroke="var(--chart-warning)" strokeDasharray="4 4" label={{ value: 'baseline', fill: 'var(--chart-warning)', fontSize: 11 }} />}
                  <Bar dataKey="cost" name="Projected cost" fill="var(--chart-primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </div>

            <div className="card-surface p-5">
              <h3 className="ui-title">{workloadMode === 'manual' ? 'Estimated mix' : 'Observed mix'}</h3>
              <div className="mt-5 space-y-4">
                <MixRow label="Fresh input" value={usageMix?.inputTokens ?? 0} total={totalTokens} color="bg-[var(--chart-primary)]" />
                <MixRow label="Cache reads" value={usageMix?.cacheReadTokens ?? 0} total={totalTokens} color="bg-[var(--chart-positive)]" />
                <MixRow label="Cache writes" value={usageMix?.cacheWriteTokens ?? 0} total={totalTokens} color="bg-[var(--chart-secondary)]" />
                <MixRow label="Output" value={usageMix?.outputTokens ?? 0} total={totalTokens} color="bg-[var(--chart-warning)]" />
              </div>
              <div className="mt-5 border-t border-[var(--border)] pt-4 text-2xs leading-relaxed text-[var(--text-tertiary)]">
                Cache-specific rates are used when available. Otherwise the input rate is the conservative fallback.
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <WatchMetric
            label={filteredModels.length === catalog.models.length ? 'Routes' : 'Matching routes'}
            value={filteredModels.length === catalog.models.length
              ? formatNumber(catalog.models.length, 0)
              : `${formatNumber(filteredModels.length, 0)} / ${formatNumber(catalog.models.length, 0)}`}
          />
          <WatchMetric label="Providers" value={formatNumber(filteredProviders, 0)} />
          <WatchMetric label="ZDR routes" value={formatNumber(zdrCount, 0)} />
          <WatchMetric label="Discounts" value={formatNumber(discountCount, 0)} />
          <WatchMetric label="Subscriptions" value={formatNumber(subscriptionCount, 0)} />
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

      <div className="text-2xs text-[var(--text-tertiary)]">
        Market pricing and provider metadata refresh every Monday, Wednesday, and Friday. Verify official provider pricing before switching.
      </div>
    </div>
  );
}

function SubscriptionValuePanel({
  models, monthUsage,
}: {
  models: PricingModel[];
  monthUsage: PricedUsageModelRow[];
}) {
  const [referenceId, setReferenceId] = useState('');
  const [planId, setPlanId] = useState(SUBSCRIPTION_PLANS[0]!.id);
  const [monthlyPriceUsd, setMonthlyPriceUsd] = useState(SUBSCRIPTION_PLANS[0]!.monthlyPriceUsd);
  const [ambiguousUsageConfirmed, setAmbiguousUsageConfirmed] = useState(false);
  const plan = SUBSCRIPTION_PLANS.find((candidate) => candidate.id === planId) ?? SUBSCRIPTION_PLANS[0]!;
  const usageProviderKey = plan.referenceProvider === 'anthropic'
    ? 'claude-bridge'
    : plan.referenceProvider === 'openai'
      ? 'openai-codex'
      : plan.referenceProvider === 'makora' && ambiguousUsageConfirmed ? 'makora' : '';
  const realizedUsage = useMemo(
    () => summarizeSubscriptionUsage(
      monthUsage, usageProviderKey ? usageProviderKey.split('|') : [], models,
    ),
    [models, monthUsage, usageProviderKey],
  );
  const observedMix = useMemo(() => {
    const total = realizedUsage.inputTokens + realizedUsage.cacheReadTokens + realizedUsage.outputTokens;
    if (total <= 0) return null;
    return {
      fresh: realizedUsage.inputTokens / total * 100,
      cached: realizedUsage.cacheReadTokens / total * 100,
    };
  }, [realizedUsage]);
  const [mixOverride, setMixOverride] = useState<{ fresh: number; cached: number } | null>(null);
  const mix = mixOverride ?? observedMix ?? { fresh: 2.5, cached: 97 };
  const outputSharePercent = 100 - mix.fresh - mix.cached;
  const mixSource = mixOverride ? 'Custom mix' : observedMix ? 'Your Pi history mix' : 'TokenWatch default mix';
  const referenceModels = useMemo(() => {
    const byId = new Map(models
      .filter((model) => model.provider === plan.referenceProvider)
      .map((model) => [model.id, model]));
    const selected = plan.referenceModelIds
      .map((id) => byId.get(id))
      .filter((model): model is PricingModel => model !== undefined);
    if (selected.length > 0) return selected;
    return models.filter((model) => model.provider === plan.referenceProvider).slice(0, 12);
  }, [models, plan]);
  const reference = referenceModels.find((model) => model.id === referenceId) ?? referenceModels[0];
  const inputRateUsdPerM = reference?.pricing.input ?? 0;
  const cacheReadRateUsdPerM = reference
    ? reference.pricing.cacheRead ?? reference.pricing.input
    : 0;
  const outputRateUsdPerM = reference?.pricing.output ?? 0;
  const result = reference
    ? calculateSubscriptionBreakEven({
      monthlyPriceUsd,
      inputRateUsdPerM,
      cacheReadRateUsdPerM,
      outputRateUsdPerM,
      inputShare: mix.fresh / 100,
      cacheReadShare: mix.cached / 100,
    })
    : null;
  const value = result?.ok ? result.value : null;

  return (
    <div className="space-y-4">
      <div className="card-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="ui-title">Subscription value</p>
            <p className="mt-2 text-2xs leading-relaxed text-[var(--text-secondary)]">
              Enter the plan fee as the budget and see how many tokens it buys at direct API rates. Fresh input, cached input, and output are priced separately using your Pi history mix when available.
            </p>
          </div>
          <div className="grid min-w-[280px] flex-1 gap-2 sm:grid-cols-2 xl:max-w-5xl xl:grid-cols-6">
            <label className="text-2xs text-[var(--text-tertiary)]">
              <span className="mb-1 block">Plan preset</span>
              <select
                aria-label="Subscription plan"
                value={planId}
                onChange={(event) => {
                  const selected = SUBSCRIPTION_PLANS.find((candidate) => candidate.id === event.target.value);
                  if (!selected) return;
                  setPlanId(selected.id);
                  setMonthlyPriceUsd(selected.monthlyPriceUsd);
                  setReferenceId('');
                  setAmbiguousUsageConfirmed(false);
                }}
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-2xs text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
              >
                {SUBSCRIPTION_PLANS.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
            </label>
            <label className="text-2xs text-[var(--text-tertiary)]">
              <span className="mb-1 block">Monthly fee in USD</span>
              <input
                aria-label="Monthly subscription price"
                type="number"
                min="0.01"
                step="1"
                value={monthlyPriceUsd}
                onChange={(event) => setMonthlyPriceUsd(Number(event.target.value))}
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-2xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
              />
            </label>
            <label className="text-2xs text-[var(--text-tertiary)]">
              <span className="mb-1 block">Reference API model</span>
              <select
                aria-label="Subscription reference model"
                value={reference?.id ?? ''}
                onChange={(event) => setReferenceId(event.target.value)}
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-2xs text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
              >
                {referenceModels.map((model) => <option key={model.id} value={model.id}>{shortModel(model.id)}</option>)}
              </select>
            </label>
            {([
              ['fresh', 'Fresh input share'],
              ['cached', 'Cache-read share'],
            ] as const).map(([key, label]) => (
              <label key={key} className="text-2xs text-[var(--text-tertiary)]">
                <span className="mb-1 block">{label} %</span>
                <input
                  aria-label={label}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Number(mix[key].toFixed(2))}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setMixOverride({ ...mix, [key]: Number.isFinite(next) ? Math.min(100, Math.max(0, next)) : 0 });
                  }}
                  className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-2xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                />
              </label>
            ))}
            <label className="text-2xs text-[var(--text-tertiary)]">
              <span className="mb-1 block">Output token share %</span>
              <input
                aria-label="Output token share"
                type="number"
                value={Number(outputSharePercent.toFixed(2))}
                readOnly
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-2xs text-[var(--text-secondary)]"
              />
            </label>
          </div>
          {plan.referenceProvider === 'makora' && (
            <label className="mt-3 flex items-start gap-2 text-2xs leading-relaxed text-[var(--text-secondary)]">
              <input
                aria-label="Treat Makora API history as subscription usage"
                type="checkbox"
                checked={ambiguousUsageConfirmed}
                onChange={(event) => setAmbiguousUsageConfirmed(event.target.checked)}
                className="mt-0.5"
              />
              Treat Makora API history as subscription usage. Makora’s provider ID does not distinguish subscription traffic from direct PAYG, so automatic detection is unsafe.
            </label>
          )}
        </div>
      </div>

      {reference && value ? (
        <>
          <div className="card-surface p-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Realized this month</p>
            {realizedUsage.matchedModels > 0 ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  <WatchMetric label="API-equivalent value" value={monthlyCurrency(realizedUsage.apiEquivalentUsd)} />
                  <WatchMetric label="Subscription fee" value={monthlyCurrency(monthlyPriceUsd)} />
                  <WatchMetric label="Realized multiple" value={`${(realizedUsage.apiEquivalentUsd / monthlyPriceUsd).toFixed(2)}× realized`} />
                  <WatchMetric label="Net value" value={monthlyCurrency(realizedUsage.apiEquivalentUsd - monthlyPriceUsd)} />
                  <WatchMetric label="Observed tokens" value={formatNumber(realizedUsage.totalTokens)} />
                  <WatchMetric label="Observed calls" value={formatNumber(realizedUsage.calls, 0)} />
                </div>
                <p className="mt-2 text-2xs leading-relaxed text-[var(--text-tertiary)]">
                  Detected {realizedUsage.matchedModels} matching model route{realizedUsage.matchedModels === 1 ? '' : 's'} in local Pi history; {realizedUsage.pricedModels} had a current API price and {realizedUsage.unpricedModels} were excluded from value. Cache-write cost is included when published; a missing cache-write rate contributes $0, matching TokenWatch. Cache writes are excluded from the percentage mix and forward capacity estimate.
                </p>
              </>
            ) : (
              <p className="mt-2 text-2xs text-[var(--text-tertiary)]">No matching subscription usage detected in local Pi history this month. The capacity estimate below still works from the plan budget.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <WatchMetric label="Plan fee / budget" value={monthlyCurrency(monthlyPriceUsd)} />
            <WatchMetric label="API input / M" value={subscriptionRate(inputRateUsdPerM)} />
            <WatchMetric label="API cache / M" value={subscriptionRate(cacheReadRateUsdPerM)} />
            <WatchMetric label="API output / M" value={subscriptionRate(outputRateUsdPerM)} />
            <WatchMetric label="Blended / M" value={subscriptionRate(value.blendedRateUsdPerM)} />
            <WatchMetric label="Affordable total" value={formatNumber(value.breakEvenTokens)} />
            <WatchMetric label="Mix source" value={mixSource} />
          </div>
          <div className="card-surface p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Break even at {formatNumber(value.breakEvenTokens)} monthly tokens.
            </p>
            <p className="mt-1 text-2xs text-[var(--text-secondary)]">
              {formatNumber(value.breakEvenInputTokens)} fresh + {formatNumber(value.breakEvenCacheReadTokens)} cached + {formatNumber(value.breakEvenOutputTokens)} output at {subscriptionRate(inputRateUsdPerM)} input, {subscriptionRate(cacheReadRateUsdPerM)} cache, and {subscriptionRate(outputRateUsdPerM)} output per million.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-2xs text-[var(--text-tertiary)]">
              <span>{formatNumber(value.breakEvenInputTokens)} fresh</span>
              <span>·</span>
              <span>{formatNumber(value.breakEvenCacheReadTokens)} cached</span>
              <span>·</span>
              <span>{formatNumber(value.breakEvenOutputTokens)} output</span>
              <span>·</span>
              <span>{subscriptionRate(value.blendedRateUsdPerM)} blended / M</span>
            </div>
            <p className="mt-3 text-2xs leading-relaxed text-[var(--text-secondary)]">{plan.analysisNote}</p>
            <p className="mt-2 text-2xs leading-relaxed text-[var(--text-tertiary)]">{plan.limitNote}</p>
            {plan.overageRateMultiplier && (
              <p className="mt-1 text-2xs leading-relaxed text-[var(--text-tertiary)]">
                Discounted overage: {subscriptionRate(inputRateUsdPerM * plan.overageRateMultiplier)} input, {subscriptionRate(cacheReadRateUsdPerM * plan.overageRateMultiplier)} cache, and {subscriptionRate(outputRateUsdPerM * plan.overageRateMultiplier)} output per million. This discount is not applied to the base affordability comparator.
              </p>
            )}
            <p className="mt-1 text-2xs leading-relaxed text-amber-600">
              Usage caps are not expressed as token allowances in the market catalog. Break-even shows API-equivalent value, not a guarantee that the subscription permits this volume.
            </p>
            {plan.sourceUrl && <a className="mt-2 inline-block text-2xs font-medium text-accent hover:underline" href={plan.sourceUrl} target="_blank" rel="noreferrer">Verify current plan terms</a>}
          </div>
          <div className="card-surface p-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Other researched subscriptions</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">GitHub Copilot</p>
                <p className="mt-1 text-2xs leading-relaxed text-[var(--text-secondary)]">Paid plans keep code completions unlimited and meter chat, agents, CLI, Spaces, and Spark with GitHub AI Credits at $0.01 each. Copilot Max includes $100 in monthly credits.</p>
                <a className="mt-1 inline-block text-2xs text-accent hover:underline" href="https://github.com/features/copilot/plans" target="_blank" rel="noreferrer">Official Copilot plans</a>
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">Google AI</p>
                <p className="mt-1 text-2xs leading-relaxed text-[var(--text-secondary)]">Pro and Ultra describe Antigravity, AI Studio, and Jules with relative limits rather than token quotas. Their developer benefits include monthly cloud credits, so they are not forced into token break-even without a comparable allowance.</p>
                <a className="mt-1 inline-block text-2xs text-accent hover:underline" href="https://one.google.com/about/google-ai-plans/" target="_blank" rel="noreferrer">Official Google AI plans</a>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div role="alert" className="card-surface p-4 text-xs text-ember">
          {result && !result.ok ? result.error : `No direct ${plan.referenceProvider} API reference model is available in the catalog.`}
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
        <p className="ui-title">Workload</p>
        <div role="group" aria-label="Workload source" className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('actual')}
            aria-pressed={mode === 'actual'}
            className={`text-2xs font-medium transition-colors ${mode === 'actual' ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
          >
            Actual usage{actualLoading ? ' · loading' : actualAvailable ? '' : ' · unavailable'}
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            aria-pressed={mode === 'manual'}
            className={`text-2xs font-medium transition-colors ${mode === 'manual' ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
          >
            Manual estimate
          </button>
        </div>
      </div>
      {mode === 'manual' && (
        <div className="mt-3">
          <p className="mb-2 text-2xs font-medium text-[var(--text-primary)]">Manual monthly estimate</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {fields.map((field) => (
              <label key={field.key} className="text-2xs text-[var(--text-tertiary)]">
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
                  className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-2xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
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
      className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-2xs text-[var(--text-secondary)] outline-none focus:border-[var(--brand)]"
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
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</p>
      {deal ? (
        <>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{deal.model.providerDisplay}</p>
              <p className="truncate text-2xs text-[var(--text-tertiary)]">{shortModel(deal.model.id)}</p>
            </div>
            <p className="metric-mono text-base font-semibold text-[var(--text-primary)]">
              {formatCurrency(deal.totalCostUsd)}
            </p>
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-[var(--text-secondary)]">{reason}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-2xs text-[var(--text-tertiary)]">
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

function WatchMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-[var(--border)] px-3 py-1 first:border-l-0 first:pl-0">
      <p className="ui-kicker">{label}</p>
      <p className="metric-mono mt-1 text-base font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function MixRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-2xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="metric-mono text-[var(--text-primary)]">{formatNumber(value)} · {percentage.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)] dark:bg-white/[0.05]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </div>
  );
}

export default memo(MarketWatch);
