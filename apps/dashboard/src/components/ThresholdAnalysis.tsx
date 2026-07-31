import React from 'react';
import { motion } from 'framer-motion';
import { Gauge, TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import type { ThresholdStat } from '../lib/queries';
import { formatThreshold, formatDuration } from '@pi-tps/metrics-core';

interface Props {
  stats: ThresholdStat[];
}

function ThresholdAnalysisInner({ stats }: Props) {
  // Find the threshold with the strongest improvement (largest negative delta = above is faster)
  const strongest = stats.filter(s => s.ttftDelta < 0 && s.above.count > 0 && s.below.count > 0)
    .reduce<typeof stats[0] | null>((best, s) => !best || s.ttftDelta < best.ttftDelta ? s : best, null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <Gauge size={18} className="text-accent" weight="bold" />
        <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Threshold Crossings</h2>
      </div>

      <div className="space-y-4">
        {stats.map((s) => {
          const progress = s.below.count / (s.below.count + s.above.count);

          return (
            <div
              key={s.threshold}
              className="group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  At {formatThreshold(s.threshold)} tokens
                </span>
                <span className="text-2xs metric-mono text-[var(--text-tertiary)]">
                  {s.above.count} above
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-[var(--surface-inset)] rounded-full overflow-hidden mb-3">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="metric-mono text-sm font-bold text-[var(--text-primary)]">{formatDuration(Math.round(s.below.avgTtft))}</p>
                  <p className="text-2xs text-[var(--text-tertiary)] mt-0.5">Below</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className={`flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full ${
                    s.ttftDelta > 0
                      ? 'bg-ember/10 text-ember'
                      : s.ttftDelta < 0
                      ? 'bg-moss/10 text-moss'
                      : 'bg-[var(--surface-inset)] dark:bg-white/[0.04] text-[var(--text-tertiary)]'
                  }`}>
                    {s.ttftDelta > 0 ? <TrendUp size={10} /> : s.ttftDelta < 0 ? <TrendDown size={10} /> : <Minus size={10} />}
                    {s.ttftDelta !== 0 && <span className="metric-mono">{formatDuration(Math.abs(Math.round(s.ttftDelta)))}</span>}
                  </div>
                </div>
                <div className="text-center">
                  <p className="metric-mono text-sm font-bold text-[var(--text-primary)]">{formatDuration(Math.round(s.above.avgTtft))}</p>
                  <p className="text-2xs text-[var(--text-tertiary)] mt-0.5">Above</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] dark:border-white/[0.06]">
        {strongest ? (
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            The <span className="metric-mono font-semibold text-[var(--text-primary)]">{formatThreshold(strongest.threshold)} threshold</span> shows
            the strongest improvement signal — TTFT drops by{' '}
            <span className="metric-mono font-semibold text-moss">{formatDuration(Math.abs(Math.round(strongest.ttftDelta)))}</span>{' '}
            once requests cross it, indicating a meaningful TTFT shift at this boundary.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            No threshold shows a significant TTFT improvement above it. Requests remain consistently timed across token counts.
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default React.memo(ThresholdAnalysisInner);
