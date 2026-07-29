import { act, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRemoteMetrics } from './useRemoteMetrics';

afterEach(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Shared fetch stub: manifest + snapshot always succeed; the hourly detailed
 *  feed fails (503) on the first request and succeeds thereafter. */
function stubFailingThenRecovering() {
  let detailedRequests = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/feed/manifest.json') {
      return {
        ok: true,
        json: async () => ({
          version: 'version-1',
          files: ['hourly/data.jsonl'],
          recordCount: 1,
          snapshot: 'snapshot.json',
        }),
      } as Response;
    }
    if (url === '/feed/snapshot.json') {
      return { ok: true, json: async () => ({}) } as Response;
    }
    if (url === '/feed/hourly/data.jsonl') {
      detailedRequests += 1;
      if (detailedRequests === 1) return { ok: false, status: 503 } as Response;
      return {
        ok: true,
        text: async () => '{"type":"usage","data":{"sessionId":"session-1"}}\n',
      } as Response;
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return () => detailedRequests;
}

async function settlePending(container: HTMLElement, want: string, key = 'status') {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const el = container.querySelector(`[data-testid="${key}"]`);
    if (el?.textContent === want) return true;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  return false;
}

describe('useRemoteMetrics', () => {
  it('does not automatically retry a failed detailed feed in a tight loop', async () => {
    const getDetailedRequests = stubFailingThenRecovering();

    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    function Probe() {
      const replaceSessions = useCallback(() => {}, []);
      const onSnapshotDetected = useCallback(() => {}, []);
      const { snapshot, detailedLoaded, detailedLoading, detailedError, loadDetailed } =
        useRemoteMetrics(replaceSessions, onSnapshotDetected);
      useEffect(() => {
        if (snapshot && !detailedLoaded && !detailedLoading && !detailedError) {
          void loadDetailed();
        }
      }, [detailedError, detailedLoaded, detailedLoading, loadDetailed, snapshot]);
      return <span data-testid="status">{detailedLoaded ? 'loaded' : detailedError ? 'failed' : 'pending'}</span>;
    }

    await act(async () => root.render(<Probe />));
    expect(await settlePending(container, 'failed')).toBe(true);

    // Only one detailed request after a latched failure — no retry storm.
    expect(getDetailedRequests()).toBe(1);

    await act(async () => root.unmount());
  });

  it('reloads detailed sessions on manifest rollover without repeating initial detection', async () => {
    vi.useFakeTimers();
    let version = 1;
    const replaceSessions = vi.fn(async () => {});
    const onSnapshotDetected = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/feed/manifest.json') {
        return {
          ok: true,
          json: async () => ({
            version: `version-${version}`,
            files: ['hourly/data.jsonl'],
            recordCount: 1,
            snapshot: 'snapshot.json',
          }),
        } as Response;
      }
      if (url === '/feed/snapshot.json') {
        return {
          ok: true,
          json: async () => ({ schemaVersion: 1, sourceRecordCount: 1, usage: [], activity: [] }),
        } as Response;
      }
      if (url === '/feed/hourly/data.jsonl') {
        return {
          ok: true,
          text: async () => `{"type":"usage","data":{"sessionId":"session-${version}"}}\n`,
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    function Probe() {
      const state = useRemoteMetrics(replaceSessions, onSnapshotDetected);
      useEffect(() => {
        if (state.snapshot && !state.detailedLoaded && !state.detailedLoading && !state.detailedError) {
          void state.loadDetailed();
        }
      }, [state]);
      return <span data-testid="status">{state.manifestVersion}:{state.detailedLoaded ? 'loaded' : 'pending'}</span>;
    }

    await act(async () => root.render(<Probe />));
    expect(await settlePending(container, 'version-1:loaded')).toBe(true);
    expect(replaceSessions).toHaveBeenCalledTimes(1);
    expect(onSnapshotDetected).toHaveBeenCalledTimes(1);

    version = 2;
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(await settlePending(container, 'version-2:loaded')).toBe(true);
    expect(replaceSessions).toHaveBeenCalledTimes(2);
    const reloaded = (replaceSessions.mock.calls[1] as unknown as [[{ raw: string }]])[0][0];
    expect(reloaded.raw).toContain('session-2');
    expect(onSnapshotDetected).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('recovers via manual retry after a latched failure', async () => {
    const getDetailedRequests = stubFailingThenRecovering();

    const container = document.createElement('div');
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    function Probe() {
      const replaceSessions = useCallback(() => {}, []);
      const onSnapshotDetected = useCallback(() => {}, []);
      const { snapshot, detailedLoaded, detailedLoading, detailedError, loadDetailed } =
        useRemoteMetrics(replaceSessions, onSnapshotDetected);
      useEffect(() => {
        if (snapshot && !detailedLoaded && !detailedLoading && !detailedError) {
          void loadDetailed();
        }
      }, [detailedError, detailedLoaded, detailedLoading, loadDetailed, snapshot]);
      return (
        <div>
          <span data-testid="status">{detailedLoaded ? 'loaded' : detailedError ? 'failed' : 'pending'}</span>
          {detailedError && (
            <button data-testid="retry" onClick={() => void loadDetailed()}>
              Retry
            </button>
          )}
        </div>
      );
    }

    await act(async () => root.render(<Probe />));
    expect(await settlePending(container, 'failed')).toBe(true);
    expect(getDetailedRequests()).toBe(1);

    // Manual retry (mirrors the App "Retry" button): loadDetailed runs again,
    // the now-successful feed loads, and the error clears.
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="retry"]')?.click();
    });
    expect(await settlePending(container, 'loaded')).toBe(true);
    expect(getDetailedRequests()).toBe(2);

    await act(async () => root.unmount());
  });
});
