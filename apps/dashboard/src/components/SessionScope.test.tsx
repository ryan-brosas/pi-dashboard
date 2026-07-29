import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SessionScope from './SessionScope';

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function mount(node: React.ReactElement) {
  const container = document.createElement('div');
  const root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return {
    container,
    promise: act(async () => { root.render(node); }),
    unmount: () => act(async () => { root.unmount(); }),
  };
}

describe('SessionScope', () => {
  it('renders a compact select instead of one button per session', async () => {
    const sessions = Array.from({ length: 141 }, (_, i) => ({
      sessionId: `sid-${i}`,
      label: `relay-${i}`,
      requestCount: i + 1,
    }));
    const { container, promise, unmount } = mount(
      <SessionScope
        sessions={sessions}
        activeSessionId={null}
        onSelect={() => {}}
        onRemove={() => {}}
        onClearAll={() => {}}
      />,
    );
    await promise;

    // One <select>, not 141 session buttons.
    expect(container.querySelectorAll('select')).toHaveLength(1);
    expect(container.querySelectorAll('option')).toHaveLength(142); // "All runs" + 141
    // No per-session remove buttons clutter the bar; only Clear all (and a
    // remove affordance when a specific session is active).
    expect(container.querySelectorAll('button')).toHaveLength(1);

    await unmount();
  });

  it('marks usage-only runs and exposes loading state', async () => {
    const sessions = [
      { sessionId: 'usage-only', label: 'Usage only', requestCount: 8, detailedCount: 0 },
      { sessionId: 'detailed', label: 'Detailed', requestCount: 5, detailedCount: 5 },
    ];
    const { container, promise, unmount } = mount(
      <SessionScope
        sessions={sessions}
        activeSessionId="usage-only"
        onSelect={() => {}}
        onRemove={() => {}}
        onClearAll={() => {}}
        loading
      />,
    );
    await promise;

    const labels = [...container.querySelectorAll('option')].map((option) => option.textContent);
    expect(labels).toContain('Usage only (8 · usage only)');
    expect(labels).toContain('Detailed (5)');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Loading run');

    await unmount();
  });

  it('exposes a sized remove control only for the active session', async () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    const sessions = [
      { sessionId: 'sid-a', label: 'Run A', requestCount: 3 },
      { sessionId: 'sid-b', label: 'Run B', requestCount: 5 },
    ];
    const { container, promise, unmount } = mount(
      <SessionScope sessions={sessions} activeSessionId="sid-a" onSelect={onSelect} onRemove={onRemove} onClearAll={onClearAll} />,
    );
    await promise;

    const select = container.querySelector('select')!;
    expect(select.value).toBe('sid-a');

    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove Run A"]')!;
    expect(remove.className).toContain('h-7');
    expect(remove.className).toContain('w-7');
    expect(select.className).toContain('h-7');

    await act(async () => { remove.click(); });
    expect(onRemove).toHaveBeenCalledWith('sid-a');

    // Selecting "All runs" clears the active session.
    await act(async () => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenLastCalledWith(null);

    const clear = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Clear all')!;
    expect(clear.className).toContain('h-7');
    await act(async () => { clear.click(); });
    expect(onClearAll).toHaveBeenCalledOnce();

    await unmount();
  });
});
