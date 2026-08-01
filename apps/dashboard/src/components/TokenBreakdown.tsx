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
import { PanelHeader } from './ui/Panel';
import { TOKEN_SERIES } from '../lib/seriesColors';

const SERIES = [
  { key: 'cacheRead', label: 'Cache read', color: TOKEN_SERIES.cacheRead },
  { key: 'input', label: 'New input', color: TOKEN_SERIES.input },
  { key: 'output', label: 'Output', color: TOKEN_SERIES.output },
] as const;

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
      <PanelHeader
        title="Token composition"
        action={<span className="text-2xs text-[var(--text-tertiary)]">Last 30 requests</span>}
      />

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
            {SERIES.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                stackId="a"
                fill={series.color}
                radius={index === SERIES.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </RBarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs">
        {SERIES.map((series) => (
          <div key={series.key} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
            <span className="text-[var(--text-tertiary)]">{series.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default memo(TokenBreakdownInner);
