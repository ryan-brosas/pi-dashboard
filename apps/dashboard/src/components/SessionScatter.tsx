import { useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ZAxis, Cell
} from 'recharts';
import FadingTooltip from './FadingTooltip';

import { formatCurrency, formatDuration, formatTps } from '@pi-tps/metrics-core';

interface SessionScatterData {
  sessions: Array<{
    sessionId: string;
    fileName: string | null;
    totalCostUsd: number | null;
    wallClockMs: number;
    weightedTps: number;
    totalCalls: number;
    totalTokens: number;
    totalOutput: number;
    avgTtft: number;
    avgTps: number;
    model: string;
  }>;
}

interface Props {
  multiSummary: SessionScatterData;
  onSessionClick: (sessionId: string) => void;
}

function SessionTooltip({ active, payload, hasCost }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }>; hasCost: boolean }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-sm" style={{ minWidth: 240 }}>
      <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
        {String(d.fileName || String(d.sessionId).slice(0, 24))}
      </p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Requests</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{String(d.totalCalls)}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Tokens</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{Number(d.totalTokens).toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Wtd TPS</span>
          <span className="metric-mono font-semibold text-accent">{formatTps(Number(d.weightedTps))}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Avg TPS</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{formatTps(Number(d.avgTps))}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Avg TTFT</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{formatDuration(Math.round(Number(d.avgTtft)))}</span>
        </div>
        {hasCost && (
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-[var(--text-tertiary)]">Cost</span>
            <span className="metric-mono font-semibold text-[var(--text-primary)]">{formatCurrency(Number(d.y))}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Model</span>
          <span className="text-[var(--text-secondary)] truncate max-w-[10rem]">{String(d.model).split('/').pop()}</span>
        </div>
      </div>
      <p className="text-2xs text-[var(--text-tertiary)] mt-2 pt-1.5 border-t border-[var(--border)]">Click to focus on this run</p>
    </div>
  );
}

function SessionScatterInner({ multiSummary, onSessionClick }: Props) {
  const hasCost = multiSummary.sessions.some(s => s.totalCostUsd !== null);

  const data = useMemo(() => {
    return multiSummary.sessions.map(s => ({
      x: s.weightedTps,
      y: hasCost ? (s.totalCostUsd ?? 0) : s.wallClockMs,
      z: s.totalCalls,
      sessionId: s.sessionId,
      fileName: s.fileName,
      totalTokens: s.totalTokens,
      totalOutput: s.totalOutput,
      totalCalls: s.totalCalls,
      avgTtft: s.avgTtft,
      avgTps: s.avgTps,
      weightedTps: s.weightedTps,
      model: s.model,
      wallClockMs: s.wallClockMs,
    }));
  }, [multiSummary, hasCost]);

  const yLabel = hasCost ? 'Cost (USD)' : 'Wall-clock Duration';
  const yFormatter = hasCost
    ? (v: number) => formatCurrency(v)
    : (v: number) => formatDuration(v);

  const xDomain = useMemo(() => {
    if (data.length === 0) return [0, 100];
    const vals = data.map(d => d.x);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.1, 1);
    return [Math.max(0, min - pad), max + pad];
  }, [data]);

  const yDomain = useMemo(() => {
    if (data.length === 0) return [0, 1];
    const vals = data.map(d => d.y);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.1, hasCost ? 0.001 : 1000);
    return [Math.max(0, min - pad), max + pad];
  }, [data, hasCost]);

  if (data.length < 2) return null;

  // Color by model — hash model name to one of a set of colors
  const modelColors = [
    'var(--chart-primary)', 'var(--chart-positive)', 'var(--chart-warning)', 'var(--chart-danger)', 'var(--chart-secondary)',
    '#db2777', 'var(--accent-light)', '#65a30d', '#ea580c', '#6d28d9',
  ];
  const modelToColor = new Map<string, string>();
  let colorIdx = 0;
  for (const s of multiSummary.sessions) {
    if (!modelToColor.has(s.model)) {
      modelToColor.set(s.model, modelColors[colorIdx % modelColors.length]);
      colorIdx++;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Run comparison</h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Each dot is one session. Bubble size = request count. Color = model.</p>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          <ScatterChart
            title="Run comparison"
            desc="Each point represents one session. Position shows time to first token and throughput; bubble size shows request count."
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" />
            <XAxis
              type="number"
              dataKey="x"
              name="Weighted TPS"
              domain={xDomain as [number, number]}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              domain={yDomain as [number, number]}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={yFormatter}
            />
            <ZAxis type="number" dataKey="z" range={[60, 400]} />
            <FadingTooltip content={<SessionTooltip hasCost={hasCost} />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={data} onClick={(d: unknown) => onSessionClick((d as { payload: { sessionId: string } }).payload.sessionId)}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={modelToColor.get(entry.model) ?? 'var(--chart-primary)'}
                  fillOpacity={0.65}
                  stroke={modelToColor.get(entry.model) ?? 'var(--chart-primary)'}
                  strokeWidth={1.5}
                  cursor="pointer"
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Model color legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs">
        {Array.from(modelToColor.entries()).map(([model, color]) => (
          <div key={model} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[var(--text-tertiary)]">{model.split('/').pop()}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default memo(SessionScatterInner);
