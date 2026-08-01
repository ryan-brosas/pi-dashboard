import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  formatCurrency, formatDuration, formatNumber, formatTps, type ModelInfo,
} from '@pi-tps/metrics-core';
import { PanelHeader } from './ui/Panel';

interface Props {
  models: ModelInfo[];
  totalCalls: number;
  estimatedModelIds: Set<string>;
}

function ModelPerformanceInner({ models, totalCalls, estimatedModelIds }: Props) {
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
      <PanelHeader
        title="Model performance"
        action={<span className="text-2xs metric-mono text-[var(--text-tertiary)]">{rows.length} models · {formatNumber(totalCalls, 0)} calls</span>}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-2xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] ui-kicker">
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
                      <span className="max-w-[12rem] truncate">{row.modelId.split('/').pop()}</span>
                      {isFastest && <span className="text-2xs text-[var(--text-tertiary)]">fastest</span>}
                      {isCheapest && <span className="text-2xs text-[var(--text-tertiary)]">cheapest</span>}
                      {row.estimated && <span className="text-2xs text-[var(--text-tertiary)]">est.</span>}
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
    </motion.div>
  );
}

export default React.memo(ModelPerformanceInner);
