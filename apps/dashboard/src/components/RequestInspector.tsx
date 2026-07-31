import React, { useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { X, Clock, Hash, ArrowBendUpLeft, ArrowsLeftRight, TreeStructure, Binoculars } from '@phosphor-icons/react';

import { timelineEventKey as eventKey, type TimelineEventRow } from '../lib/queries';
import type { DataThresholds, PricingCatalog } from '@pi-tps/metrics-core';
import { formatDuration, formatTps, formatUsdPerM } from '@pi-tps/metrics-core';
import { resolveUsageCost } from '../lib/usagePricing';

const formatTime = (ts: string) => ts.substring(11, 19);

const formatFullTimestamp = (ts: string) => {
  const d = new Date(ts);
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${datePart} · ${timePart}`;
};

const shortModel = (modelId: string) => modelId.split('/').pop() ?? modelId;

function getCategory(e: TimelineEventRow & { type: 'tps' }, thresholds: DataThresholds) {
  const newRatio = e.tokensInput / e.tokensTotal;
  if (e.tokensInput > thresholds.anomalyInputThreshold) return { label: 'anomaly', color: 'text-amber bg-amber/5 border-amber/20' };
  if (e.ttftMs > thresholds.slowTtft && e.tokensTotal < thresholds.cacheThreshold) return { label: 'slow', color: 'text-ember bg-ember/5 border-ember/20' };
  if (e.tokensTotal > thresholds.cacheThreshold && e.ttftMs < thresholds.fastTtft && newRatio < thresholds.highNewInputRatio) return { label: 'fast', color: 'text-moss bg-moss/5 border-moss/20' };
  return { label: 'normal', color: 'text-[var(--text-tertiary)] bg-[var(--surface-inset)] border-[var(--border-subtle)]' };
}

interface Props {
  timeline: TimelineEventRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  thresholds: DataThresholds;
  pricingCatalog: PricingCatalog | null;
}

function isTpsRow(e: TimelineEventRow): e is TimelineEventRow & { type: 'tps' } {
  return e.type === 'tps';
}

const SPARKLINE_MAX_BARS = 60;

function RequestInspectorInner({ timeline, selectedId, onSelect, thresholds, pricingCatalog }: Props) {
  const tpsEvents = useMemo(() => timeline.filter(isTpsRow), [timeline]);

  const cacheHitRates = useMemo(() => {
    return tpsEvents.map(e => {
      const total = e.tokensTotal || 1;
      return (e.tokensCacheRead / total) * 100;
    });
  }, [tpsEvents]);

  const avgCacheHitRate = useMemo(() => {
    if (cacheHitRates.length === 0) return 0;
    return cacheHitRates.reduce((a, b) => a + b, 0) / cacheHitRates.length;
  }, [cacheHitRates]);

  const selectedTpsIndex = useMemo(() => {
    if (!selectedId) return -1;
    return tpsEvents.findIndex((event) => eventKey(event) === selectedId);
  }, [selectedId, tpsEvents]);

  const sparklineBins = useMemo(() => {
    if (cacheHitRates.length <= SPARKLINE_MAX_BARS) {
      return cacheHitRates.map((rate, i) => ({ rate, startIndex: i, count: 1 }));
    }
    const binSize = Math.ceil(cacheHitRates.length / SPARKLINE_MAX_BARS);
    const bins: { rate: number; startIndex: number; count: number }[] = [];
    for (let i = 0; i < cacheHitRates.length; i += binSize) {
      const slice = cacheHitRates.slice(i, Math.min(i + binSize, cacheHitRates.length));
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      bins.push({ rate: avg, startIndex: i, count: slice.length });
    }
    return bins;
  }, [cacheHitRates]);

  const sorted = timeline;

  const selectedRef = useRef<HTMLDivElement>(null);

  const handleSparklineSelect = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (sparklineBins.length === 0) return;
    const activeBin = sparklineBins.findIndex((bin) =>
      selectedTpsIndex >= bin.startIndex && selectedTpsIndex < bin.startIndex + bin.count);
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const pointerBin = Math.min(
      sparklineBins.length - 1,
      Math.max(0, Math.floor(pointerRatio * sparklineBins.length)),
    );
    const selectedBin = event.detail === 0 && activeBin >= 0 ? activeBin : pointerBin;
    const bin = sparklineBins[selectedBin];
    onSelect(eventKey(tpsEvents[bin.startIndex]));
  }, [onSelect, selectedTpsIndex, sparklineBins, tpsEvents]);

  const selectedEvent = selectedId ? sorted.find((event) => eventKey(event) === selectedId) : null;

  const selectedTps = selectedEvent && isTpsRow(selectedEvent) ? selectedEvent : null;
  const selectedCost = useMemo(() => selectedTps ? resolveUsageCost({
    provider: selectedTps.provider,
    modelId: selectedTps.modelId,
    inputTokens: selectedTps.tokensInput,
    outputTokens: selectedTps.tokensOutput,
    cacheReadTokens: selectedTps.tokensCacheRead,
    cacheWriteTokens: selectedTps.tokensCacheWrite,
    totalTokens: selectedTps.tokensTotal,
    costUsd: selectedTps.costTotal ?? 0,
    pricedCalls: (selectedTps.costTotal ?? 0) > 0 ? 1 : 0,
  }, pricingCatalog) : null, [pricingCatalog, selectedTps]);
  const selectedRate = selectedCost && selectedTps && selectedTps.tokensTotal > 0
    ? selectedCost.costUsd / (selectedTps.tokensTotal / 1_000_000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-0 overflow-hidden flex flex-col"
      style={{ maxHeight: '750px' }}
    >
      <div className="flex items-center justify-between p-5 pb-4 border-b border-[var(--border-subtle)] dark:border-white/[0.06]">
        <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Request Inspector</h2>
        <span className="text-2xs metric-mono font-semibold text-[var(--text-tertiary)]">{tpsEvents.length} calls</span>
      </div>

      {/* Cache hit rate sparkline */}
      <div className="px-5 pt-4 pb-3 border-b border-[var(--border-subtle)] dark:border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Binoculars size={12} className="text-accent" weight="bold" />
            <span className="text-2xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Cache Hit Rate</span>
          </div>
          <span className="metric-mono text-2xs font-semibold text-[var(--text-secondary)]">{avgCacheHitRate.toFixed(0)}% avg</span>
        </div>
        <button
          type="button"
          onClick={handleSparklineSelect}
          disabled={sparklineBins.length === 0}
          aria-label="Select a request from the cache hit rate chart"
          className="relative flex h-8 w-full cursor-pointer gap-px overflow-hidden rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-default"
          title={`Cache hit rate · avg ${avgCacheHitRate.toFixed(0)}%${cacheHitRates.length > SPARKLINE_MAX_BARS ? ` · aggregated into ${sparklineBins.length} bins` : ''}`}
        >
          {sparklineBins.map((bin, i) => {
            const h = Math.max(4, (bin.rate / 100) * 100);
            const color = bin.rate >= 80 ? 'bg-moss' : bin.rate >= 50 ? 'bg-accent' : bin.rate >= 20 ? 'bg-amber' : 'bg-ember';
            const isActive = selectedTpsIndex >= bin.startIndex && selectedTpsIndex < bin.startIndex + bin.count;
            return (
              <span key={i} aria-hidden="true" className={`relative flex-1 ${isActive ? 'z-10' : ''}`}>
                <span className={`absolute inset-0 rounded-sm ${isActive ? 'bg-accent/10' : ''}`} />
                <span className="absolute inset-0 flex items-end">
                  <span
                    className={`w-full rounded-sm ${color} ${isActive ? 'opacity-100' : 'opacity-70'}`}
                    style={{ height: `${h}%` }}
                  />
                </span>
              </span>
            );
          })}
        </button>
        <div className="flex items-center justify-between mt-1.5 text-2xs metric-mono text-[var(--text-tertiary)]">
          <span>#{1}</span>
          <span>#{cacheHitRates.length}</span>
        </div>
      </div>

      <div className="overflow-hidden" style={{ height: '400px', minHeight: '400px', flex: '0 0 auto' }}>
        {selectedTps ? (
              <div
                key="detail"
                className="h-full w-full overflow-y-auto scrollbar-thin p-5 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Request Detail</p>
                    <p className="metric-mono text-lg font-bold text-[var(--text-primary)] mt-0.5">#{selectedTpsIndex + 1} of {tpsEvents.length}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect(null)}
                    aria-label="Close request detail"
                    className="p-2 rounded-lg bg-[var(--surface-inset)] dark:bg-white/[0.04] hover:bg-[var(--surface-hover)] transition-colors active:scale-[0.95]"
                  >
                    <X size={16} className="text-[var(--text-secondary)]" />
                  </button>
                </div>

                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-semibold uppercase tracking-wider border ${getCategory(selectedTps, thresholds).color}`}>
                  {getCategory(selectedTps, thresholds).label}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MetricBox icon={Clock} label="Timestamp" value={formatFullTimestamp(selectedTps.timestamp)} />
                  <MetricBox icon={Hash} label="ID" value={selectedTps.id.substring(0, 8)} />
                </div>

                {/* Model */}
                <div className="space-y-3">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Model</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <ModelPill label="Provider" value={selectedTps.provider} />
                    <ModelPill label="Model" value={shortModel(selectedTps.modelId)} fullValue={selectedTps.modelId} />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Token Breakdown</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <TokenPill label="Total" value={selectedTps.tokensTotal} color="bg-[var(--chart-axis)]" />
                    <TokenPill label="New Input" value={selectedTps.tokensInput} color="bg-[var(--chart-axis)]" />
                    <TokenPill label="Cache Read" value={selectedTps.tokensCacheRead} color="bg-accent" />
                    <TokenPill label="Output" value={selectedTps.tokensOutput} color="bg-moss" />
                  </div>

                  <div className="h-2 bg-[var(--surface-inset)] rounded-full overflow-hidden flex">
                    {selectedTps.tokensTotal > 0 && (
                      <>
                        <div className="h-full bg-accent" style={{ width: `${(selectedTps.tokensCacheRead / selectedTps.tokensTotal) * 100}%` }} />
                        <div className="h-full bg-[var(--chart-axis)]" style={{ width: `${(selectedTps.tokensInput / selectedTps.tokensTotal) * 100}%` }} />
                        <div className="h-full bg-moss" style={{ width: `${(selectedTps.tokensOutput / selectedTps.tokensTotal) * 100}%` }} />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-2xs">
                    <span className="text-[var(--text-tertiary)]">Cache: {((selectedTps.tokensCacheRead / selectedTps.tokensTotal) * 100).toFixed(0)}%</span>
                    <span className="text-[var(--text-tertiary)]">New: {((selectedTps.tokensInput / selectedTps.tokensTotal) * 100).toFixed(0)}%</span>
                    <span className="text-[var(--text-tertiary)]">Out: {((selectedTps.tokensOutput / selectedTps.tokensTotal) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Timing</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <TimingPill label="TTFT" value={formatDuration(selectedTps.ttftMs)} highlight />
                    <TimingPill label="Total" value={formatDuration(selectedTps.totalMs)} />
                    <TimingPill label="Generation" value={formatDuration(selectedTps.generationMs)} />
                    <TimingPill label="Stall" value={formatDuration(selectedTps.stallMs)} warn={selectedTps.stallMs > 0} />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Speed Breakdown</p>
                  {(() => {
                    const activeTps = selectedTps.effectiveTps;
                    const wallTps = selectedTps.wallTps;
                    const lossTps = activeTps > 0 ? ((activeTps - wallTps) / activeTps) * 100 : 0;
                    const wallShare = activeTps > 0 ? (wallTps / activeTps) * 100 : 0;
                    const stallShare = selectedTps.generationMs > 0 ? (selectedTps.stallMs / selectedTps.generationMs) * 100 : 0;
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-moss/5 dark:bg-moss/10 rounded-lg px-2 sm:px-3 py-2.5 text-center">
                            <p className="text-2xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Active</p>
                            <p className="metric-mono text-sm font-bold text-moss mt-0.5">{formatTps(activeTps)}</p>
                            <p className="text-2xs text-[var(--text-tertiary)]">tok/s</p>
                          </div>
                          <div className="bg-accent/5 dark:bg-accent/10 rounded-lg px-2 sm:px-3 py-2.5 text-center">
                            <p className="text-2xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Wall</p>
                            <p className="metric-mono text-sm font-bold text-accent mt-0.5">{formatTps(wallTps)}</p>
                            <p className="text-2xs text-[var(--text-tertiary)]">tok/s</p>
                          </div>
                          <div className="bg-ember/5 dark:bg-ember/10 rounded-lg px-2 sm:px-3 py-2.5 text-center">
                            <p className="text-2xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Loss</p>
                            <p className={`metric-mono text-sm font-bold mt-0.5 ${lossTps > 50 ? 'text-ember' : lossTps > 20 ? 'text-amber' : 'text-[var(--text-secondary)]'}`}>{lossTps.toFixed(1)}%</p>
                            <p className="text-2xs text-[var(--text-tertiary)]">of active</p>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-2xs mb-1">
                            <span className="text-[var(--text-tertiary)]">Throughput retention</span>
                            <span className="metric-mono text-[var(--text-secondary)]">{wallShare.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden flex bg-[var(--surface-inset)]">
                            <div className="h-full bg-moss" style={{ width: `${Math.max(0, Math.min(100, wallShare))}%` }} />
                            <div className="h-full bg-ember" style={{ width: `${Math.max(0, Math.min(100, 100 - wallShare))}%` }} />
                          </div>
                        </div>
                        {selectedTps.stallMs > 0 && (
                          <div className="flex items-center justify-between text-2xs bg-amber/5 dark:bg-amber/10 rounded-md px-3 py-2">
                            <span className="text-amber">Stalls</span>
                            <span className="metric-mono text-amber">{selectedTps.stallCount} · {formatDuration(selectedTps.stallMs)} · {stallShare.toFixed(0)}% gen time</span>
                          </div>
                        )}
                        {selectedTps.tps !== selectedTps.effectiveTps && selectedTps.tps > 0 && (
                          <p className="text-2xs text-[var(--text-tertiary)]" title="Stored TPS from extension (computed before stall-guard fix, may include inflation)">
                            Stored raw TPS: {formatTps(selectedTps.tps)}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="space-y-3">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Cost</p>
                  <TimingPill label={selectedCost?.source === 'catalog' ? 'Provider estimate · est.' : 'Provider cost'} value={selectedCost && selectedCost.source !== 'unpriced' ? `$${selectedCost.costUsd.toFixed(4)}` : '-'} />
                  {/* Blended $/M for this turn. A-else-B: prefer pi-tps' precomputed
                      rateUsdPerMTokens (matches the turn-end banner exactly);
                      otherwise derive from effective cost + tokens so older
                      sessions still show a value. */}
                  <div
                    className="flex items-center justify-between text-2xs bg-violet-500/5 dark:bg-violet-500/10 rounded-md px-3 py-2"
                    title={selectedCost?.source === 'catalog'
                      ? `Estimated from ${selectedCost.canonicalProvider ?? selectedTps.provider} pricing.`
                      : selectedCost?.source === 'native'
                        ? 'Native provider cost divided by this turn’s tokens.'
                        : 'No matching native or catalog price for this turn.'}
                  >
                    <span className="text-violet-600 dark:text-violet-300">$/M-tokens</span>
                    <span className="metric-mono text-violet-600 dark:text-violet-300">
                      {formatUsdPerM(selectedRate)}
                      {selectedCost?.source === 'catalog' && (
                        <span className="ml-1.5 text-2xs uppercase tracking-wider text-accent">est.</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <VirtualizedRequestList
                sorted={sorted}
                tpsEvents={tpsEvents}
                thresholds={thresholds}
                selectedId={selectedId}
                selectedRef={selectedRef}
                onSelect={onSelect}
                shortModel={shortModel}
                isTpsRow={isTpsRow}
              />
            )}
      </div>
    </motion.div>
  );
}

const TpsRow = React.memo(function TpsRow({ event, tpsIndex, thresholds, onSelect, shortModel }: {
  event: TimelineEventRow & { type: 'tps' };
  tpsIndex: number;
  thresholds: DataThresholds;
  onSelect: (id: string) => void;
  shortModel: (modelId: string) => string;
}) {
  const cat = useMemo(() => getCategory(event, thresholds), [event, thresholds]);

  return (
    <button
      type="button"
      onClick={() => onSelect(eventKey(event))}
      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[var(--surface-hover)] cursor-pointer active:bg-[var(--surface-inset)]"
    >
      <div className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface-inset)] metric-mono text-2xs font-bold text-[var(--text-secondary)] shrink-0">
        {tpsIndex + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="metric-mono text-xs font-semibold text-[var(--text-primary)]">{event.tokensTotal.toLocaleString()}</span>
          <span className="text-2xs text-[var(--text-tertiary)]">tokens</span>
          <span className="text-2xs text-[var(--text-separator)]">·</span>
          <span className="text-2xs font-medium text-accent" title={`${event.provider}/${event.modelId}`}>
            {shortModel(event.modelId)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-2xs metric-mono text-[var(--text-tertiary)]">
            {formatTime(event.timestamp)}
          </span>
          <span className="text-2xs text-[var(--text-separator)]">·</span>
          <span className={`text-2xs font-medium ${event.ttftMs > thresholds.slowTtft ? 'text-ember' : event.ttftMs < thresholds.fastTtft ? 'text-moss' : 'text-[var(--text-tertiary)]'}`}>
            ttft {formatDuration(event.ttftMs)}
          </span>
          <span className="text-2xs text-[var(--text-separator)]">·</span>
          <span className={`text-2xs font-medium ${event.effectiveTps > 40 ? 'text-moss' : event.effectiveTps > 20 ? 'text-accent' : 'text-ember'}`}>
            {formatTps(event.effectiveTps)} tps
          </span>
          <span className="text-2xs text-[var(--text-separator)]">·</span>
          <span className="text-2xs text-[var(--text-tertiary)]">
            {((event.tokensCacheRead / event.tokensTotal) * 100).toFixed(0)}% cache
          </span>
        </div>
      </div>
      <div className={`w-1.5 h-1.5 rounded-full ${cat.color.split(' ')[0].replace('text-', 'bg-')}`} />
    </button>
  );
});

function StructuralRow({ event }: { event: TimelineEventRow }) {
  if (event.type === 'model_change') {
    return (
      <div className="flex items-center gap-2.5 px-5 py-2 bg-accent/[0.03] dark:bg-accent/[0.06]">
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <ArrowsLeftRight size={14} className="text-accent" weight="bold" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xs font-semibold uppercase tracking-wider text-accent">model →</span>
          <span className="text-2xs font-medium text-[var(--text-secondary)] truncate" title={`${event.provider}/${event.modelId}`}>
            {event.modelId.split('/').pop()}
          </span>
          <span className="text-2xs text-[var(--text-tertiary)]">{event.provider}</span>
          <span className="text-2xs text-[var(--text-tertiary)] ml-auto metric-mono">{formatTime(event.timestamp)}</span>
        </div>
      </div>
    );
  }

  if (event.type === 'rewind') {
    return (
      <div className="flex items-center gap-2.5 px-5 py-2 bg-ember/[0.03] dark:bg-ember/[0.06]">
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <ArrowBendUpLeft size={14} className="text-ember" weight="bold" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ember">rewind</span>
          <span className="text-2xs text-[var(--text-tertiary)]">navigated</span>
          <span className="text-2xs text-[var(--text-tertiary)] ml-auto metric-mono">{formatTime(event.timestamp)}</span>
        </div>
      </div>
    );
  }

  if (event.type === 'branch_summary') {
    return (
      <div className="flex items-center gap-2.5 px-5 py-2 bg-moss/[0.03] dark:bg-moss/[0.06]">
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <TreeStructure size={14} className="text-moss" weight="bold" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xs font-semibold uppercase tracking-wider text-moss">branch</span>
          <span className="text-2xs text-[var(--text-tertiary)] truncate max-w-[200px]">
            {event.summary.length > 60 ? event.summary.substring(0, 60) + '…' : event.summary}
          </span>
          <span className="text-2xs text-[var(--text-tertiary)] ml-auto metric-mono">{formatTime(event.timestamp)}</span>
        </div>
      </div>
    );
  }

  return null;
}

export default React.memo(RequestInspectorInner);

const TPS_ROW_H = 60;
const STRUCT_ROW_H = 44;

function getRowHeight(e: TimelineEventRow) {
  return isTpsRow(e) ? TPS_ROW_H : STRUCT_ROW_H;
}

function VirtualizedRequestList({ sorted, tpsEvents, thresholds, selectedId, selectedRef, onSelect, shortModel, isTpsRow: isTps }: {
  sorted: TimelineEventRow[];
  tpsEvents: (TimelineEventRow & { type: 'tps' })[];
  thresholds: DataThresholds;
  selectedId: string | null;
  selectedRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string | null) => void;
  shortModel: (modelId: string) => string;
  isTpsRow: (e: TimelineEventRow) => e is TimelineEventRow & { type: 'tps' };
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => getRowHeight(sorted[i]),
    overscan: 8,
  });

  return (
    <div ref={parentRef} className="h-full w-full overflow-y-auto scrollbar-thin" style={{ contain: 'strict' }}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vItem) => {
          const e = sorted[vItem.index];
          if (isTps(e)) {
            const tpsIdx = tpsEvents.findIndex((event) => eventKey(event) === eventKey(e));
            return (
              <div
                key={eventKey(e)}
                data-index={vItem.index}
                ref={selectedId === eventKey(e) ? selectedRef : undefined}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vItem.start}px)`,
                }}
              >
                <TpsRow
                  event={e}
                  tpsIndex={tpsIdx}
                  thresholds={thresholds}
                  onSelect={onSelect}
                  shortModel={shortModel}
                />
              </div>
            );
          }
          return (
            <div
              key={eventKey(e)}
              data-index={vItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start}px)`,
              }}
            >
              <StructuralRow event={e} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-[var(--surface-inset)] rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-[var(--text-tertiary)]" weight="bold" />
        <span className="text-2xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{label}</span>
      </div>
      <p className="metric-mono text-sm font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function ModelPill({ label, value, fullValue }: { label: string; value: string; fullValue?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-accent/[0.04] dark:bg-accent/[0.08] rounded-lg">
      <span className="text-2xs font-medium text-[var(--text-tertiary)]">{label}</span>
      <span className="metric-mono text-xs font-bold text-accent truncate ml-2" title={fullValue ?? value}>{value}</span>
    </div>
  );
}

function TokenPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface-inset)] rounded-lg">
      <span className="text-2xs font-medium text-[var(--text-tertiary)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
        <span className="metric-mono text-xs font-bold text-[var(--text-primary)]">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}

function TimingPill({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
      highlight ? 'bg-accent/5' : warn ? 'bg-ember/5' : 'bg-[var(--surface-inset)]'
    }`}>
      <span className="text-2xs font-medium text-[var(--text-tertiary)]">{label}</span>
      <span className={`metric-mono text-xs font-bold ${
        highlight ? 'text-accent' : warn ? 'text-ember' : 'text-[var(--text-primary)]'
      }`}>{value}</span>
    </div>
  );
}
