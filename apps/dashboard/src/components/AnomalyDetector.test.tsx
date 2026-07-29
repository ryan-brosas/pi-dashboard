import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnomalyRow } from '../lib/queries';
import AnomalyDetector from './AnomalyDetector';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

function anomaly(index: number): AnomalyRow {
  return {
    eventId: `event-${index}`,
    sessionId: 'session-1',
    type: 'slow-zone',
    index,
    description: `anomaly-${index}`,
    severity: 'medium',
    tokensTotal: 1_000,
    energyCostUsd: null,
    tokenCostUsd: null,
  };
}

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('AnomalyDetector', () => {
  it('bounds rendered anomaly cards while preserving the total count', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => root.render(<AnomalyDetector anomalies={Array.from({ length: 500 }, (_, i) => anomaly(i))} />));

    expect(container.textContent).toContain('500 found');
    expect(container.textContent).toContain('Showing highest-priority 50');
    expect(container.textContent).toContain('anomaly-0');
    expect(container.textContent).not.toContain('anomaly-50');

    await act(async () => root.unmount());
  });
});
