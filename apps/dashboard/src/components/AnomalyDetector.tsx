import React from 'react';
import { motion } from 'framer-motion';
import { Warning, Lightning } from '@phosphor-icons/react';
import { MAX_ANOMALY_ROWS, type AnomalyRow } from '../lib/queries';

interface Props {
  anomalies: AnomalyRow[];
}

function AnomalyDetectorInner({ anomalies }: Props) {
  if (anomalies.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="card-surface p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-moss/10 rounded-md">
            <Lightning size={16} className="text-moss" weight="bold" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Anomaly Detector</h2>
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">No anomalies detected in this session.</p>
      </motion.div>
    );
  }

  const totalCount = anomalies[0]?.totalCount ?? anomalies.length;
  const visibleAnomalies = anomalies.slice(0, MAX_ANOMALY_ROWS);

  const colorForSeverity = (s: string) => {
    switch (s) {
      case 'high': return 'bg-ember/8 border-ember/20 text-ember';
      case 'medium': return 'bg-amber/8 border-amber/20 text-amber';
      default: return 'bg-[var(--surface-inset)] border-[var(--border)] text-[var(--text-secondary)]';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber/10 rounded-md">
            <Warning size={16} className="text-amber" weight="bold" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Anomaly Detector</h2>
        </div>
        <span className="text-2xs metric-mono font-semibold text-[var(--text-tertiary)]">{totalCount} found</span>
      </div>

      {totalCount > MAX_ANOMALY_ROWS && (
        <p className="-mt-3 mb-3 text-2xs text-[var(--text-tertiary)]">
          Showing highest-priority {MAX_ANOMALY_ROWS}
        </p>
      )}

      <div className="space-y-2.5 max-h-80 overflow-y-auto scrollbar-thin">
        {visibleAnomalies.map((a) => (
          <div
            key={`${a.eventId}-${a.type}`}
            className={`p-3 rounded-lg border ${colorForSeverity(a.severity)}`}
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5">
                {a.type === 'cache-drop' && <Lightning size={14} weight="bold" />}
                {a.type === 'slow-zone' && <Warning size={14} weight="bold" />}
                {a.type === 'high-new-input' && <Warning size={14} weight="bold" />}
                {a.type === 'stall-spike' && <Warning size={14} weight="bold" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-primary)]">{a.description}</p>
                <p className="text-2xs metric-mono text-[var(--text-tertiary)] mt-1">
                  #{a.index + 1} · total={a.tokensTotal.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default React.memo(AnomalyDetectorInner);
