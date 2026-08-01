import React from 'react';
import { motion } from 'framer-motion';
import { MAX_ANOMALY_ROWS, type AnomalyRow } from '../lib/queries';
import { PanelHeader } from './ui/Panel';

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
        <PanelHeader title="Anomalies" />
        <p className="text-sm text-[var(--text-tertiary)]">No anomalies detected in this session.</p>
      </motion.div>
    );
  }

  const totalCount = anomalies[0]?.totalCount ?? anomalies.length;
  const visibleAnomalies = anomalies.slice(0, MAX_ANOMALY_ROWS);

  const colorForSeverity = (s: string) => {
    switch (s) {
      case 'high': return 'border-l-ember';
      case 'medium': return 'border-l-amber';
      default: return 'border-l-[var(--border-strong)]';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <PanelHeader
        title="Anomalies"
        action={<span className="text-2xs metric-mono text-[var(--text-tertiary)]">{totalCount} found</span>}
      />

      {totalCount > MAX_ANOMALY_ROWS && (
        <p className="-mt-3 mb-3 text-2xs text-[var(--text-tertiary)]">
          Showing highest-priority {MAX_ANOMALY_ROWS}
        </p>
      )}

      <div className="space-y-2.5 max-h-80 overflow-y-auto scrollbar-thin">
        {visibleAnomalies.map((a) => (
          <div
            key={`${a.eventId}-${a.type}`}
            className={`border-l-2 py-1.5 pl-3 ${colorForSeverity(a.severity)}`}
          >
            <p className="text-xs text-[var(--text-primary)]">{a.description}</p>
            <p className="text-2xs metric-mono text-[var(--text-tertiary)] mt-0.5">
              #{a.index + 1} · total={a.tokensTotal.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default React.memo(AnomalyDetectorInner);
