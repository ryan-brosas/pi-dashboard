import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import ViewNavigation from './ViewNavigation';

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('ViewNavigation', () => {
  it('connects the dashboard brand to the author site', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => root.render(
      <ViewNavigation
        viewTab="dashboard"
        onChange={() => {}}
        onUpload={() => {}}
        canUseSessionTabs
      />,
    ));

    const brand = container.querySelector<HTMLAnchorElement>('a[aria-label="pi-tps by Ryan Jose Brosas"]');
    expect(brand?.href).toBe('https://ryanjosebrosas.dev/');
    expect(brand?.target).toBe('_blank');
    expect(brand?.rel).toContain('noopener');

    await act(async () => root.unmount());
  });
});
