import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CacheEfficiency from './CacheEfficiency';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('CacheEfficiency', () => {
  it('keeps the text-equivalent donut chart out of the keyboard order', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => root.render(
      <CacheEfficiency
        overall={[
          { name: 'Cache Read', value: 900, color: 'var(--chart-primary)' },
          { name: 'New Input', value: 100, color: 'var(--chart-secondary)' },
        ]}
        overTime={[]}
        hitRate={90}
      />,
    ));

    expect(container.textContent).toContain('Cache Read');
    expect(container.textContent).toContain('90%');
    expect(container.querySelector('[tabindex="0"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
