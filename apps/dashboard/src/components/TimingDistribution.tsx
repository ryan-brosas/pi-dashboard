import React from 'react';
import { motion } from 'framer-motion';
import type { TtftBinRow } from '../lib/queries';
import { formatDuration } from '@pi-tps/metrics-core';
import { PanelHeader } from './ui/Panel';

interface Props {
  bins: TtftBinRow[];
  fastCount: number;
  slowCount: number;
  percentiles: { label: string; value: number }[];
}

function TimingDistributionInner({ bins, fastCount, slowCount, percentiles }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <PanelHeader
        title="TTFT distribution"
        action={
          <span className="text-2xs metric-mono text-[var(--text-tertiary)]">
            {fastCount} fast · {slowCount} slow
          </span>
        }
      />

      <div className="space-y-3">
        {bins.map((bin) => (
          <div key={bin.label} className="flex items-center gap-3">
            <span className="text-2xs metric-mono text-[var(--text-secondary)] w-14 shrink-0 text-right">{bin.label}</span>
            <div className="flex-1 h-7 bg-[var(--surface-inset)] rounded-md overflow-hidden relative">
              <motion.div
                className={`h-full ${bin.color} rounded-md`}
                initial={{ width: 0 }}
                animate={{ width: `${bin.barPct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
              {bin.count > 0 && (
                <span
                  className={`absolute inset-y-0 flex items-center text-2xs metric-mono font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${
                    bin.barPct > 15 ? 'left-2 text-white' : 'left-1 text-[var(--text-secondary)]'
                  }`}
                >
                  {bin.count}
                </span>
              )}
            </div>
            <span className="text-2xs metric-mono text-[var(--text-tertiary)] w-10 shrink-0">{bin.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] dark:border-white/[0.06]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[var(--border-subtle)]">
          {percentiles.map(({ label, value }) => {
            const color = label === 'P50' ? 'text-[var(--text-primary)]'
              : label === 'P75' ? 'text-amber'
              : label === 'P90' ? 'text-accent'
              : 'text-ember';
            return (
              <div key={label} className="text-center px-3 py-2 first:pl-0 last:pr-0">
                <p className="text-2xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
                <p className={`metric-mono text-sm font-semibold ${color} mt-0.5`}>
                  {formatDuration(value)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export default React.memo(TimingDistributionInner);
