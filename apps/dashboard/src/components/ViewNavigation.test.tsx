import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import ViewNavigation from './ViewNavigation';

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('ViewNavigation', () => {
  it('links the logo directly to the author home page', async () => {
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

    const brand = container.querySelector<HTMLAnchorElement>('a[aria-label="Visit Ryan Jose Brosas home"]');
    expect(brand?.href).toBe('https://ryanjosebrosas.dev/');
    expect(brand?.target).toBe('');
    expect(brand?.querySelector('svg')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
