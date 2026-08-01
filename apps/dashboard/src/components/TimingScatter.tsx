import { useMemo, useState, memo } from 'react';
import { motion } from 'framer-motion';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ZAxis, Cell
} from 'recharts';
import FadingTooltip from './FadingTooltip';

import { timelineEventKey, type ScatterPoint } from '../lib/queries';
import { formatDuration, formatThreshold } from '@pi-tps/metrics-core';
import type { DataThresholds } from '@pi-tps/metrics-core';
import { PanelHeader, SegmentedControl } from './ui/Panel';

interface Props {
  data: ScatterPoint[];
  onPointClick: (id: string) => void;
  thresholds: DataThresholds;
}

function TimingTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  const tps = Number(d.effectiveTps ?? d.tps);
  const wallTps = Number(d.wallTps);
  const loss = tps > 0 ? ((tps - wallTps) / tps) * 100 : 0;
  const wallShare = tps > 0 ? (wallTps / tps) * 100 : 0;
  return (
    <div className="glass-panel px-4 py-3 text-sm" style={{ minWidth: 220 }}>
      <p className="ui-kicker mb-2">
        Request #{Number(d.index) + 1}
      </p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Total tokens</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{Number(d.tokensTotal).toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">TTFT</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{formatDuration(Number(d.ttftMs ?? d.y))}</span>
        </div>
        <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">Cache hit</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{(Number(d.cacheRatio) * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
          <span className="text-[var(--text-tertiary)]">New input</span>
          <span className="metric-mono font-semibold text-[var(--text-primary)]">{Number(d.input).toLocaleString()}</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-[var(--border)]">
        <p className="ui-kicker mb-1.5">Speed</p>
        <div className="space-y-1">
          <div className="flex justify-between text-xs whitespace-nowrap">
            <span className="text-[var(--text-tertiary)]">Active</span>
            <span className="metric-mono font-semibold text-moss">{tps.toFixed(1)} tok/s</span>
          </div>
          <div className="flex justify-between text-xs whitespace-nowrap">
            <span className="text-[var(--text-tertiary)]">Wall</span>
            <span className="metric-mono font-semibold text-accent">{wallTps.toFixed(1)} tok/s</span>
          </div>
          <div className="flex justify-between text-xs whitespace-nowrap">
            <span className="text-[var(--text-tertiary)]">Loss</span>
            <span className={`metric-mono font-semibold ${loss > 50 ? 'text-ember' : loss > 20 ? 'text-amber' : 'text-[var(--text-secondary)]'}`}>{loss.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--surface-inset)]">
            <div className="h-full bg-moss" style={{ width: `${Math.max(0, Math.min(100, wallShare))}%` }} />
            <div className="h-full bg-ember" style={{ width: `${Math.max(0, Math.min(100, 100 - wallShare))}%` }} />
          </div>
        </div>
      </div>
      {Number(d.stallCount) > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]">
          <div className="flex justify-between text-xs whitespace-nowrap">
            <span className="text-ember">Stalls</span>
            <span className="metric-mono font-semibold text-ember">{String(d.stallCount)} · {formatDuration(Number(d.stallMs))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TimingScatterInner({ data, onPointClick, thresholds }: Props) {
  const [scale, setScale] = useState<'linear' | 'log'>('log');
  const { cacheThreshold, lowContext } = thresholds;

  const chartData = useMemo(() => data.map((e, i) => ({
    x: e.tokensTotal,
    y: e.ttftMs,
    z: e.totalMs,
    cacheRatio: e.cacheRatio,
    newRatio: e.newRatio,
    category: e.category,
    index: i,
    id: e.id,
    selectionId: timelineEventKey(e),
    input: e.input,
    output: e.output,
    cacheRead: e.cacheRead,
    tps: e.effectiveTps,
    wallTps: e.wallTps,
    stallCount: e.stallCount,
    stallMs: e.stallMs,
    effectiveTps: e.effectiveTps,
    ttftMs: e.ttftMs,
    tokensTotal: e.tokensTotal,
  })), [data]);

  const colorMap = {
    fast: 'var(--success)',
    normal: 'var(--chart-primary)',
    slow: 'var(--danger)',
    anomaly: 'var(--warning)',
  };

  const MAX_POINTS = 100;
  const displayData = useMemo(() => {
    if (chartData.length <= MAX_POINTS) return chartData;
    const step = chartData.length / MAX_POINTS;
    return chartData.filter((_, i) => Math.floor(i / step) !== Math.floor((i + 1) / step));
  }, [chartData]);

  const xDomain = useMemo(() => {
    const vals = chartData.map(d => d.x);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (scale === 'log') return [Math.max(1, min * 0.8), max * 1.1];
    return [0, max * 1.05];
  }, [chartData, scale]);

  const yDomain = useMemo(() => {
    const vals = chartData.map(d => d.y);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (scale === 'log') return [Math.max(100, min * 0.8), max * 1.1];
    return [0, max * 1.05];
  }, [chartData, scale]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <PanelHeader
        title="TTFT vs context size"
        action={
          <>
            {chartData.length > MAX_POINTS && (
              <span className="text-2xs text-[var(--text-tertiary)]">
                {displayData.length} of {chartData.length} points
              </span>
            )}
            <SegmentedControl
              label="Scale"
              value={scale}
              onChange={setScale}
              options={[{ value: 'log', label: 'Log' }, { value: 'linear', label: 'Linear' }] as const}
            />
          </>
        }
      />

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          <ScatterChart
            title="TTFT versus context size"
            desc="Each point compares time to first token with request context size. Color represents cache efficiency."
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" />
            <XAxis
              type="number"
              dataKey="x"
              name="Total Tokens"
              scale={scale}
              domain={xDomain as [number, number]}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dy={8}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="TTFT (ms)"
              scale={scale}
              domain={yDomain as [number, number]}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
            />
            <ZAxis type="number" dataKey="z" range={[40, 200]} />
            <FadingTooltip content={<TimingTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={displayData} onClick={(d: unknown) => onPointClick((d as { payload: { selectionId: string } }).payload.selectionId)}>
              {displayData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colorMap[entry.category]}
                  fillOpacity={0.7}
                  cursor="pointer"
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Swatches read from colorMap so the legend cannot drift from the plot. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs">
        {([
          ['fast', `Fast (cached, >${formatThreshold(cacheThreshold)})`],
          ['normal', 'Normal'],
          ['slow', `Slow zone (${formatThreshold(lowContext)}–${formatThreshold(cacheThreshold)})`],
          ['anomaly', 'Anomaly (massive new input)'],
        ] as const).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-sm" style={{ background: colorMap[key] }} />
            <span className="text-[var(--text-tertiary)]">{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default memo(TimingScatterInner);
