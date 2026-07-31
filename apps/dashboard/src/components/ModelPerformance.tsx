import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from '@phosphor-icons/react';
import {
  formatCurrency, formatDuration, formatNumber, formatTps, type ModelInfo,
} from '@pi-tps/metrics-core';

interface Props {
  models: ModelInfo[];
  avgTps: number;
  weightedTps: number;
  totalCalls: number;
  estimatedModelIds: Set<string>;
}

function ModelPerformanceInner({ models, avgTps, weightedTps, totalCalls, estimatedModelIds }: Props) {
  const rows = useMemo(() => models.map((model) => ({
    ...model,
    costPerMillion: model.blendedCostUsd !== null && model.totalTokens > 0
      ? model.blendedCostUsd / (model.totalTokens / 1_000_000)
      : null,
    estimated: estimatedModelIds.has(`${model.provider}:${model.modelId}`),
  })), [estimatedModelIds, models]);

  if (rows.length < 2) return null;
  const fastest = rows.filter((row) => row.avgTps !== null)
    .sort((a, b) => (b.avgTps ?? 0) - (a.avgTps ?? 0))[0];
  const cheapest = rows.filter((row) => row.costPerMillion !== null)
    .sort((a, b) => (a.costPerMillion ?? Infinity) - (b.costPerMillion ?? Infinity))[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <Trophy size={16} className="text-accent" weight="bold" />
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Model Performance</h2>
        <span className="ml-auto text-2xs metric-mono text-[var(--text-tertiary)]">{rows.length} models · {formatNumber(totalCalls, 0)} calls</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-2xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-2xs uppercase tracking-wider text-[var(--text-tertiary)]">
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-right font-medium">Provider</th>
              <th className="px-3 py-2 text-right font-medium">Calls</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Avg TPS</th>
              <th className="px-3 py-2 text-right font-medium">Avg TTFT</th>
              <th className="px-3 py-2 text-right font-medium">Cost/1M</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isFastest = row === fastest;
              const isCheapest = row === cheapest && !isFastest;
              return (
                <tr key={`${row.provider}:${row.modelId}`} className="border-b border-[var(--border-subtle)]">
                  <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                    <div className="flex items-center gap-1.5">
                      {isFastest && <span className="rounded-sm bg-moss/10 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-moss">Fastest</span>}
                      {isCheapest && <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-accent">Cheapest</span>}
                      <span className="max-w-[12rem] truncate">{row.modelId.split('/').pop()}</span>
                      {row.estimated && <span className="text-2xs font-semibold uppercase text-accent">est.</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{row.provider}</td>
                  <td className="px-3 py-2.5 text-right metric-mono">{formatNumber(row.callCount, 0)}</td>
                  <td className="px-3 py-2.5 text-right metric-mono">{formatNumber(row.totalTokens)}</td>
                  <td className="px-3 py-2.5 text-right metric-mono">{row.avgTps !== null ? formatTps(row.avgTps) : '—'}</td>
                  <td className="px-3 py-2.5 text-right metric-mono">{row.avgTtftMs !== null ? formatDuration(Math.round(row.avgTtftMs)) : '—'}</td>
                  <td className="px-3 py-2.5 text-right metric-mono">{row.costPerMillion !== null ? `$${row.costPerMillion.toFixed(4)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right metric-mono">{row.blendedCostUsd !== null ? formatCurrency(row.blendedCostUsd) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-4 border-t border-[var(--border-subtle)] pt-3 text-2xs text-[var(--text-tertiary)] dark:border-white/[0.06] dark:text-[var(--text-secondary)]">
        <span>Avg TPS <span className="metric-mono font-medium text-[var(--text-secondary)]">{formatTps(avgTps)}</span></span>
        <span>Wtd TPS <span className="metric-mono font-medium text-accent">{formatTps(weightedTps)}</span></span>
      </div>
    </motion.div>
  );
}

export default React.memo(ModelPerformanceInner);
