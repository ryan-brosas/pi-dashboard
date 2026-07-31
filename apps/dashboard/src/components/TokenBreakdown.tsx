import { memo } from 'react';
import { motion } from 'framer-motion';

import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import FadingTooltip from './FadingTooltip';

import type { TokenCompositionRow } from '../lib/queries';

interface Props {
  data: TokenCompositionRow[];
}

function TokenTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown>; name?: string; value?: number; color?: string; dataKey?: string }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  return (
    <div className="glass-panel rounded-lg px-4 py-3 text-sm">
      <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Request #{String(d.index)}</p>
      <div className="space-y-1">
        {payload.map((p, index) => (
          <div key={p.dataKey ?? p.name ?? index} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
            <span className="text-[var(--text-tertiary)] w-20">{p.name}</span>
            <span className="metric-mono font-semibold text-[var(--text-primary)]">{p.value?.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokenBreakdownInner({ data }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Token Composition — Last 30 Requests</h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">How cache, new input, and output compose each request</p>
        </div>
      </div>

      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          <RBarChart
            title="Token composition for the last 30 requests"
            desc="Stacked cache-read, new-input, and output token counts for each recent request."
            data={data}
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dy={8}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            />
            <FadingTooltip content={<TokenTooltip />} />
            <Bar dataKey="cacheRead" name="Cache Read" stackId="a" fill="var(--chart-positive)" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
            <Bar dataKey="input" name="New Input" stackId="a" fill="var(--chart-primary)" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
            <Bar dataKey="output" name="Output" stackId="a" fill="var(--chart-warning)" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
          </RBarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
          <span className="text-[var(--text-tertiary)]">Cache Read</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[var(--chart-axis)]" />
          <span className="text-[var(--text-tertiary)]">New Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-moss" />
          <span className="text-[var(--text-tertiary)]">Output</span>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(TokenBreakdownInner);
