import { Warning, Info } from '@phosphor-icons/react';
import type { ModelInfo } from '@pi-tps/metrics-core';
import { formatTps, formatCurrency, formatDuration, formatNumber } from '@pi-tps/metrics-core';
import { TOKEN_SERIES } from '../../lib/seriesColors';

export function TpsTooltip({ activeTps, wallTps, lossPct, mode }: { activeTps: number; wallTps: number; lossPct: number; mode: 'avg' | 'weighted' }) {
  const wallShare = activeTps > 0 ? (wallTps / activeTps) * 100 : 0;
  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{mode === 'avg' ? 'Average' : 'Weighted'} Speed</p>
        <p className="text-2xs text-[var(--text-tertiary)]">tok/s</p>
      </div>
      <div className="flex gap-2 mb-2 min-w-0">
        <div className="flex-1 min-w-0 rounded-md bg-moss/5 dark:bg-moss/10 p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-moss">Active</p>
          <p className="metric-mono text-sm font-bold text-[var(--text-primary)] mt-0.5 truncate">{formatTps(activeTps)}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-md bg-accent/5 dark:bg-accent/10 p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-accent">Wall</p>
          <p className="metric-mono text-sm font-bold text-[var(--text-primary)] mt-0.5 truncate">{formatTps(wallTps)}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-md bg-ember/5 dark:bg-ember/10 p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ember">Loss</p>
          <p className="metric-mono text-sm font-bold text-[var(--text-primary)] mt-0.5 truncate">{lossPct.toFixed(1)}%</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-2xs text-[var(--text-tertiary)] mb-1">
          <span>Retention</span>
          <span className="metric-mono font-medium text-moss">{wallShare.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--surface-inset)]">
          <div className="h-full bg-moss" style={{ width: `${wallShare}%` }} />
          <div className="h-full bg-ember" style={{ width: `${Math.max(0, 100 - wallShare)}%` }} />
        </div>
      </div>
      <div className="space-y-1 mt-2 pt-2 border-t border-[var(--border)]">
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-moss mt-1.5 shrink-0" />
          <p className="text-2xs text-[var(--text-secondary)] leading-relaxed">
            <span className="font-semibold text-moss">Active</span> — generation-only throughput, excluding stalls and TTFT
          </p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-accent mt-1.5 shrink-0" />
          <p className="text-2xs text-[var(--text-secondary)] leading-relaxed">
            <span className="font-semibold text-accent">Wall</span> — pooled wall-clock throughput, including stalls and TTFT
          </p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-ember mt-1.5 shrink-0" />
          <p className="text-2xs text-[var(--text-secondary)] leading-relaxed">
            <span className="font-semibold text-ember">Loss</span> — percentage of active throughput lost to stalls, TTFT, and gaps
          </p>
        </div>
      </div>
      <p className="text-2xs leading-relaxed text-[var(--text-tertiary)] mt-2">
        {mode === 'avg' ? 'Simple mean of per-request generation throughput.' : 'Token-weighted average throughput. Longer responses count more heavily.'}
      </p>
      <p className="text-2xs leading-relaxed text-[var(--text-separator)] mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <span className="font-semibold text-[var(--text-secondary)]">Standard term:</span> Output speed (tokens/s) — measures the <strong>decode</strong> stage (token-by-token generation). Also called generation throughput or output token rate.
      </p>
    </div>
  );
}

export function RequestsTooltip({
  total,
  models,
  avgTokensPerCall,
  stalledCalls,
  cachedCalls,
  fastCalls,
}: {
  total: number;
  models: ModelInfo[];
  avgTokensPerCall: number;
  stalledCalls: number;
  cachedCalls: number;
  fastCalls: number;
}) {
  const stallPct = total > 0 ? (stalledCalls / total) * 100 : 0;
  const cachePct = total > 0 ? (cachedCalls / total) * 100 : 0;
  const fastPct = total > 0 ? (fastCalls / total) * 100 : 0;

  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Requests</p>
        <p className="text-2xs text-[var(--text-tertiary)]">calls</p>
      </div>
      <div className="flex items-baseline gap-2 mb-2.5">
        <p className="metric-mono text-xl font-bold text-[var(--text-primary)]">{formatNumber(total, 0)}</p>
        <span className="text-2xs text-[var(--text-tertiary)]">total LLM calls</span>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1 min-w-0 rounded-md bg-[var(--surface-inset)] p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Tok/call</p>
          <p className="metric-mono text-xs font-bold text-[var(--text-primary)] mt-0.5">{formatNumber(Math.round(avgTokensPerCall), 0)}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-md bg-moss/5 dark:bg-moss/10 p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-moss">Fast TTFT</p>
          <p className="metric-mono text-xs font-bold text-[var(--text-primary)] mt-0.5">{fastCalls}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-md bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-amber">Stalled</p>
          <p className="metric-mono text-xs font-bold text-[var(--text-primary)] mt-0.5">{stalledCalls}</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div>
          <div className="flex items-center justify-between text-2xs text-[var(--text-tertiary)] mb-0.5">
            <span>Fast responses (&lt; 3s TTFT)</span>
            <span className="metric-mono font-medium text-moss">{fastPct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-[var(--surface-inset)]">
            <div className="h-full bg-moss" style={{ width: `${fastPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-2xs text-[var(--text-tertiary)] mb-0.5">
            <span>Cache-aware calls</span>
            <span className="metric-mono font-medium text-accent">{cachePct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-[var(--surface-inset)]">
            <div className="h-full" style={{ background: TOKEN_SERIES.cacheRead, width: `${cachePct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-2xs text-[var(--text-tertiary)] mb-0.5">
            <span>Stalled calls</span>
            <span className="metric-mono font-medium text-ember">{stallPct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-[var(--surface-inset)]">
            <div className="h-full bg-ember" style={{ width: `${stallPct}%` }} />
          </div>
        </div>
      </div>

      {models.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Per Model</p>
            <p className="text-2xs text-[var(--text-tertiary)]">calls</p>
          </div>
          {models.map(m => {
            const pct = total > 0 ? (m.callCount / total) * 100 : 0;
            return (
              <div key={m.modelId} className="space-y-1">
                <div className="flex items-center justify-between text-2xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[var(--text-secondary)] font-medium truncate">{m.modelId.split('/').pop()}</span>
                    <span className="text-2xs text-[var(--text-tertiary)]">{m.provider}</span>
                  </div>
                  <span className="metric-mono font-medium text-[var(--text-primary)] shrink-0">{m.callCount}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden bg-[var(--surface-inset)]">
                  <div className="h-full bg-accent/40" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-2xs leading-relaxed text-[var(--text-tertiary)] mt-2">
        Each LLM call is one assistant turn. Fast responses (&lt; 3s TTFT) felt snappy. Stalled calls experienced at least one idle pause. Cache-aware calls read or wrote prompt cache.
      </p>
      <p className="text-2xs leading-relaxed text-[var(--text-separator)] mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <span className="font-semibold text-[var(--text-secondary)]">Standard term:</span> Requests per second (RPS) — system throughput across all concurrent requests. Primarily emphasized for batch or high-throughput serving scenarios.
      </p>
    </div>
  );
}

export function TotalTimeTooltip({ wallClockMs, totalTimeMs, generationMs }: { wallClockMs: number; totalTimeMs: number; generationMs: number }) {
  const overhead = Math.max(0, totalTimeMs - generationMs);
  const idle = Math.max(0, wallClockMs - totalTimeMs);
  const denominator = Math.max(wallClockMs, totalTimeMs, 1);

  const genPct = (generationMs / denominator) * 100;
  const overPct = (overhead / denominator) * 100;
  const idlePct = (idle / denominator) * 100;

  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Time Breakdown</p>
      </div>

      <div className="flex items-baseline gap-2 mb-2.5">
        <p className="metric-mono text-xl font-bold text-[var(--text-primary)]">{formatDuration(wallClockMs)}</p>
        <span className="text-2xs text-[var(--text-tertiary)]">wall-clock span</span>
      </div>

      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between text-2xs">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-moss" />
            Generation time
          </span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatDuration(generationMs)}</span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber" />
            Overhead (TTFT + stalls)
          </span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatDuration(overhead)}</span>
        </div>
        {idle > 0 && (
          <div className="flex items-center justify-between text-2xs">
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-separator)]" />
              Idle (between requests)
            </span>
            <span className="metric-mono font-medium text-[var(--text-primary)]">{formatDuration(idle)}</span>
          </div>
        )}
        {totalTimeMs > wallClockMs && (
          <div className="flex items-center justify-between text-2xs">
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Parallel overlap
            </span>
            <span className="metric-mono font-medium text-accent">{formatDuration(totalTimeMs - wallClockMs)}</span>
          </div>
        )}
      </div>

      <div className="mb-1">
        <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--surface-inset)]">
          <div className="h-full bg-moss" style={{ width: `${genPct}%` }} />
          <div className="h-full bg-amber" style={{ width: `${overPct}%` }} />
          {idle > 0 && <div className="h-full bg-[var(--text-separator)]" style={{ width: `${idlePct}%` }} />}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-moss" />
          <span className="text-2xs text-[var(--text-tertiary)]">gen {genPct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber" />
          <span className="text-2xs text-[var(--text-tertiary)]">over {overPct.toFixed(0)}%</span>
        </div>
        {idle > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-separator)]" />
            <span className="text-2xs text-[var(--text-tertiary)]">idle {idlePct.toFixed(0)}%</span>
          </div>
        )}
      </div>

      <p className="text-2xs leading-relaxed text-[var(--text-tertiary)] pt-2 border-t border-[var(--border)]">
        Wall-clock is the real-world time from first to last event. It includes idle gaps between user interactions. "Active" time (generation + overhead) is the sum of individual request durations — it can exceed wall-clock when multiple requests execute in parallel.
      </p>
      <p className="text-2xs leading-relaxed text-[var(--text-separator)] mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <span className="font-semibold text-[var(--text-secondary)]">Standard term:</span> End-to-end latency — total wall-clock time from request submission to final token. Breaks down as TTFT + (ITL × output tokens).
      </p>
    </div>
  );
}

export function TtftTooltip({ avgTtft, p50, p75, p90, p99, min, max }: { avgTtft: number; p50: number; p75: number; p90: number; p99: number; min: number; max: number }) {
  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Time to First Token</p>
        <p className="text-2xs text-[var(--text-tertiary)]">latency</p>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <p className="metric-mono text-xl font-bold text-[var(--text-primary)]">{formatDuration(Math.round(avgTtft))}</p>
        <span className="text-2xs text-[var(--text-tertiary)]">mean</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <div className="flex items-center justify-between text-2xs">
          <span className="text-[var(--text-secondary)]">Min</span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatDuration(min)}</span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="text-[var(--text-secondary)]">P50</span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatDuration(p50)}</span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="text-[var(--text-secondary)]">P75</span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatDuration(p75)}</span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="text-[var(--text-secondary)]">P90</span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatDuration(p90)}</span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="text-[var(--text-secondary)]">P99</span>
          <span className="metric-mono font-medium text-ember">{formatDuration(p99)}</span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="text-[var(--text-secondary)]">Max</span>
          <span className="metric-mono font-medium text-ember">{formatDuration(max)}</span>
        </div>
      </div>
      <p className="text-2xs leading-relaxed text-[var(--text-tertiary)] pt-2 border-t border-[var(--border)]">
        TTFT measures the delay from sending the prompt to receiving the first token. High P99 values often indicate cold starts or queueing.
      </p>
      <p className="text-2xs leading-relaxed text-[var(--text-separator)] mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <span className="font-semibold text-[var(--text-secondary)]">Standard term:</span> Time to First Token (TTFT) — measures the <strong>prefill</strong> stage (prompt processing before generation begins). For reasoning models, Time to First Answer Token (TTFAT) is the operationally relevant variant.
      </p>
    </div>
  );
}

export function StallsTooltip({ count, ms, totalTimeMs }: { count: number; ms: number; totalTimeMs: number }) {
  const stallPct = totalTimeMs > 0 ? (ms / totalTimeMs) * 100 : 0;
  const avgStall = count > 0 ? ms / count : 0;
  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Stall Analysis</p>
        <Warning weight="bold" size={12} className="text-ember" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 rounded-md bg-ember/5 dark:bg-ember/10 p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ember">Events</p>
          <p className="metric-mono text-sm font-bold text-[var(--text-primary)] mt-0.5">{formatNumber(count, 0)}</p>
        </div>
        <div className="flex-1 rounded-md bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-amber">Total</p>
          <p className="metric-mono text-sm font-bold text-[var(--text-primary)] mt-0.5">{formatDuration(ms)}</p>
        </div>
        <div className="flex-1 rounded-md bg-[var(--surface-inset)] p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Avg</p>
          <p className="metric-mono text-sm font-bold text-[var(--text-primary)] mt-0.5">{formatDuration(Math.round(avgStall))}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-2xs text-[var(--text-tertiary)] mb-1">
          <span>Stall overhead</span>
          <span className="metric-mono font-medium text-ember">{stallPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--surface-inset)]">
          <div className="h-full bg-ember" style={{ width: `${stallPct}%` }} />
          <div className="h-full bg-moss" style={{ width: `${Math.max(0, 100 - stallPct)}%` }} />
        </div>
      </div>
      <p className="text-2xs leading-relaxed text-[var(--text-tertiary)] mt-2">
        Stalls are pauses where the model is idle — waiting for tokens to arrive, network hiccups, or queueing delays.
      </p>
      <p className="text-2xs leading-relaxed text-[var(--text-separator)] mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <span className="font-semibold text-[var(--text-secondary)]">Standard term:</span> Inter-token Latency (ITL) — the time between consecutive output tokens. Also called Time Per Output Token (TPOT) when referring to the mean. Variable ITL causes perceptible stuttering even when average output speed looks acceptable.
      </p>
    </div>
  );
}

export function CostTooltip({ totalCost, energyCost, costSource, models, totalTokens, estimated = false }: {
  totalCost: number | null;
  energyCost: number | null;
  costSource: 'neuralwatt' | 'tps' | 'both' | null;
  models: ModelInfo[];
  totalTokens: number;
  estimated?: boolean;
}) {
  if (totalCost === null) {
    return (
      <div className="glass-panel rounded-lg px-4 py-3 text-xs">
        <div className="flex items-center justify-between mb-2">
          <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cost</p>
        <Info weight="bold" size={12} className="text-[var(--text-tertiary)]" />
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">No cost data available for this session.</p>
      </div>
    );
  }

  const tpsShare = energyCost !== null && totalCost > 0
    ? ((totalCost - energyCost) / totalCost) * 100 : 0;
  const energyShare = energyCost !== null && totalCost > 0
    ? (energyCost / totalCost) * 100 : 0;
  const costPer1M = totalTokens > 0 ? (totalCost / (totalTokens / 1_000_000)) : 0;

  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total Cost</p>
        <p className="text-2xs text-[var(--text-tertiary)]">USD</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="metric-mono text-xl font-bold text-[var(--text-primary)]">{formatCurrency(totalCost)}</p>
        <span className="text-2xs text-[var(--text-tertiary)]">{estimated ? 'native + market estimates' : costSource ? 'native provider cost' : 'unknown source'}</span>
      </div>

      <div className="flex gap-2 mb-3 mt-2.5">
        <div className="flex-1 min-w-0 rounded-md bg-[var(--surface-inset)] p-1.5 text-center">
          <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Per 1M tok</p>
          <p className="metric-mono text-xs font-bold text-[var(--text-primary)] mt-0.5">${costPer1M.toFixed(3)}</p>
        </div>
        {energyCost !== null && (
          <div className="flex-1 min-w-0 rounded-md bg-accent/5 dark:bg-accent/10 p-1.5 text-center">
            <p className="text-2xs font-semibold uppercase tracking-wider text-accent">Energy</p>
            <p className="metric-mono text-xs font-bold text-[var(--text-primary)] mt-0.5">{formatCurrency(energyCost)}</p>
          </div>
        )}
        {costSource === 'both' && energyCost !== null && (
          <div className="flex-1 min-w-0 rounded-md bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
            <p className="text-2xs font-semibold uppercase tracking-wider text-amber">Token est.</p>
            <p className="metric-mono text-xs font-bold text-[var(--text-primary)] mt-0.5">{formatCurrency(Math.max(0, totalCost - energyCost))}</p>
          </div>
        )}
      </div>

      {costSource === 'both' && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-2xs text-[var(--text-tertiary)] mb-1">
            <span>Cost attribution</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--surface-inset)]">
            <div className="h-full bg-accent" style={{ width: `${energyShare}%` }} />
            <div className="h-full bg-amber" style={{ width: `${tpsShare}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-2xs text-[var(--text-tertiary)]">neuralwatt {energyShare.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-amber" />
              <span className="text-2xs text-[var(--text-tertiary)]">provider {tpsShare.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      {models.some(m => m.blendedCostUsd !== null) && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Per Model</p>
            <p className="text-2xs text-[var(--text-tertiary)]">cost</p>
          </div>
          {models
            .filter(m => m.blendedCostUsd !== null)
            .sort((a, b) => (b.blendedCostUsd ?? 0) - (a.blendedCostUsd ?? 0))
            .map(m => {
              const pct = totalCost > 0 ? ((m.blendedCostUsd ?? 0) / totalCost) * 100 : 0;
              const cost = m.blendedCostUsd ?? 0;
              return (
                <div key={m.modelId} className="space-y-1">
                  <div className="flex items-center justify-between text-2xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[var(--text-secondary)] font-medium truncate">{m.modelId.split('/').pop()}</span>
                      <span className="text-[var(--text-tertiary)] text-2xs">{m.callCount} calls</span>
                    </div>
                    <span className="metric-mono font-medium shrink-0 text-amber">
                      {formatCurrency(cost)}
                    </span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden bg-[var(--surface-inset)]">
                    <div className="h-full bg-amber/60" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <p className="text-2xs leading-relaxed text-[var(--text-tertiary)] mt-2">
        {costSource === 'neuralwatt' && 'All costs measured via NeuralWatt energy profiling.'}
        {costSource === 'tps' && (estimated ? 'Native costs are preserved; missing routes use matched market input, output, and cache rates.' : 'Costs come from native provider token pricing.')}
        {costSource === 'both' && 'Costs are a hybrid — NeuralWatt where energy data was paired, provider token pricing as fallback for unpaired requests.'}
      </p>
    </div>
  );
}

export function TokensTooltip({ input, output, cacheRead, cacheWrite, total, totalCost }: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; totalCost: number | null }) {
  const inputPct = total > 0 ? (input / total) * 100 : 0;
  const outputPct = total > 0 ? (output / total) * 100 : 0;
  const cacheReadPct = total > 0 ? (cacheRead / total) * 100 : 0;
  const cacheWritePct = total > 0 ? (cacheWrite / total) * 100 : 0;
  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Token Breakdown</p>
        <p className="text-2xs text-[var(--text-tertiary)]">tokens</p>
      </div>
      <div className="space-y-1 mb-2">
        <div className="flex items-center justify-between text-2xs">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: TOKEN_SERIES.input }} />
            New input
          </span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatNumber(input)} <span className="text-[var(--text-tertiary)]">({inputPct.toFixed(0)}%)</span></span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: TOKEN_SERIES.output }} />
            Output
          </span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatNumber(output)} <span className="text-[var(--text-tertiary)]">({outputPct.toFixed(0)}%)</span></span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: TOKEN_SERIES.cacheRead }} />
            Cache read
          </span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatNumber(cacheRead)} <span className="text-[var(--text-tertiary)]">({cacheReadPct.toFixed(0)}%)</span></span>
        </div>
        <div className="flex items-center justify-between text-2xs">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: TOKEN_SERIES.cacheWrite }} />
            Cache write
          </span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatNumber(cacheWrite)} <span className="text-[var(--text-tertiary)]">({cacheWritePct.toFixed(0)}%)</span></span>
        </div>
      </div>
      <div>
        <div className="h-1.5 rounded-full overflow-hidden flex">
          <div className="h-full" style={{ background: TOKEN_SERIES.input, width: `${inputPct}%` }} />
          <div className="h-full" style={{ background: TOKEN_SERIES.output, width: `${outputPct}%` }} />
          <div className="h-full" style={{ background: TOKEN_SERIES.cacheRead, width: `${cacheReadPct}%` }} />
          <div className="h-full" style={{ background: TOKEN_SERIES.cacheWrite, width: `${cacheWritePct}%` }} />
        </div>
      </div>
      <div className="space-y-1 mt-2 pt-2 border-t border-[var(--border)]">
        <div className="flex items-center justify-between text-2xs">
          <span className="text-[var(--text-secondary)]">Total</span>
          <span className="metric-mono font-medium text-[var(--text-primary)]">{formatNumber(total)}</span>
        </div>
        {totalCost !== null && (
          <div className="flex items-center justify-between text-2xs">
            <span className="text-[var(--text-secondary)]">Cost per 1M tokens</span>
            <span className="metric-mono font-medium text-[var(--text-primary)]">
              {total > 0 ? `$${((totalCost / (total / 1_000_000))).toFixed(4)}` : '-'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
