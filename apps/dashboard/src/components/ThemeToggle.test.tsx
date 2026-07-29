import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from './ThemeToggle';

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('ThemeToggle', () => {
  it('exposes the current theme as an accessible pressed state', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const setTheme = vi.fn();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () => { root.render(<ThemeToggle theme="dark" setTheme={setTheme} />); });

    const group = container.querySelector('[role="group"][aria-label="Color theme"]');
    expect(group).not.toBeNull();
    const light = container.querySelector<HTMLButtonElement>('button[aria-label="Light theme"]')!;
    const dark = container.querySelector<HTMLButtonElement>('button[aria-label="Dark theme"]')!;
    const system = container.querySelector<HTMLButtonElement>('button[aria-label="System theme"]')!;
    expect(light.getAttribute('aria-pressed')).toBe('false');
    expect(dark.getAttribute('aria-pressed')).toBe('true');
    expect(system.getAttribute('aria-pressed')).toBe('false');

    await act(async () => { light.click(); });
    expect(setTheme).toHaveBeenCalledWith('light');
    await act(async () => root.unmount());
  });
});
