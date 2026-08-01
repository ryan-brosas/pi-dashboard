import { useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, ShieldCheck } from '@phosphor-icons/react';
import {
  formatCurrency, formatNumber,
  type PaygDealComparison, type PricingModel,
} from '@pi-tps/metrics-core';
import { MARKET_PAGE_SIZE, type BillingOption } from './constants';
import { context, modelKey, rate, shortModel } from './format';
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
  const hasActiveFilters = props.search.trim() !== '' || props.provider !== 'all'
    || props.billing !== 'all' || props.zdrOnly;
  const clearFilters = () => {
    resetPage();
    props.setSearch('');
    props.setProvider('all');
    props.setBilling('all');
    props.setZdrOnly(false);
  };
  return (
    <div className="card-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
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
          }} className="accent-[var(--brand)]" />
          <ShieldCheck size={13} /> ZDR only
        </label>
      </div>

      <div ref={scrollRef} className="max-h-[60dvh] overflow-auto">
        <table className={`w-full text-2xs ${props.paygMode ? 'min-w-[1280px]' : 'min-w-[850px]'}`}>
          <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]">
            <tr className="text-2xs uppercase tracking-wider text-[var(--text-tertiary)]">
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
        {sortedModels.length === 0 && (
          <div role="status" className="grid place-items-center gap-3 py-12 text-center">
            <p className="text-xs text-[var(--text-tertiary)]">No catalog routes match these filters.</p>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="min-h-9 rounded-md border border-[var(--border)] px-3 text-2xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">Clear filters</button>
            )}
          </div>
        )}
      </div>
      {sortedModels.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 text-2xs text-[var(--text-tertiary)]">
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
          {observed && <span className="text-2xs text-[var(--text-secondary)]">used</span>}
          {model.zdr && <span className="text-2xs text-[var(--text-tertiary)]">ZDR</span>}
          {model.subscription && <span className="text-2xs text-[var(--text-tertiary)]">sub</span>}
          {model.discount > 0 && <span className="text-2xs text-[var(--text-secondary)]">−{Math.round(model.discount * 100)}%</span>}
        </div>
        <span className="block truncate text-2xs text-[var(--text-tertiary)]">{model.org}</span>
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
      {comparison && <td className="metric-mono px-3 py-2.5 text-right font-medium text-[var(--text-primary)]">{formatCurrency(comparison.totalCostUsd)}</td>}
      {comparison && showSavings && (
        <td className={`metric-mono px-5 py-2.5 text-right font-medium ${savingsPositive ? 'text-moss' : 'text-[var(--text-tertiary)]'}`}>
          {comparison.savingsUsd === null ? '—' : `${savingsPositive ? '−' : '+'}${formatCurrency(Math.abs(comparison.savingsUsd))}`}
          {comparison.savingsPct !== null && <span className="ml-1 text-2xs opacity-70">({Math.abs(comparison.savingsPct).toFixed(1)}%)</span>}
        </td>
      )}
    </tr>
  );
}
