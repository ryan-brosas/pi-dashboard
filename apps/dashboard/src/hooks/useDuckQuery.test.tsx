import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useDuckQuery } from './useDuckQuery';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  while (roots.length > 0) await act(async () => roots.pop()?.unmount());
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function Harness({ query, queryKey }: { query: () => Promise<string>; queryKey: string }) {
  const { data, loading, error } = useDuckQuery(query, [queryKey]);
  return <output>{loading ? 'loading' : 'ready'}:{data ?? 'empty'}:{error?.message ?? 'none'}</output>;
}

function mount(query: () => Promise<string>, queryKey = 'first') {
  const container = document.createElement('div');
  const root = createRoot(container);
  roots.push(root);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return {
    container,
    render: (nextQuery: () => Promise<string>, nextKey: string) => act(async () => {
      root.render(<Harness query={nextQuery} queryKey={nextKey} />);
    }),
    ready: act(async () => { root.render(<Harness query={query} queryKey={queryKey} />); }),
  };
}

describe('useDuckQuery', () => {
  it('clears stale data while a changed query is loading', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const view = mount(() => first.promise);
    await view.ready;
    await act(async () => first.resolve('first result'));
    expect(view.container.textContent).toBe('ready:first result:none');

    await view.render(() => second.promise, 'second');
    expect(view.container.textContent).toBe('loading:empty:none');
  });

  it('ignores a superseded failure and exposes the current failure', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const view = mount(() => first.promise);
    await view.ready;
    await view.render(() => second.promise, 'second');

    await act(async () => first.reject(new Error('stale failure')));
    expect(view.container.textContent).toBe('loading:empty:none');

    await act(async () => second.reject(new Error('current failure')));
    expect(view.container.textContent).toBe('ready:empty:current failure');
  });

  it('ignores a superseded query result', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const view = mount(() => first.promise);
    await view.ready;
    await view.render(() => second.promise, 'second');

    await act(async () => second.resolve('second result'));
    expect(view.container.textContent).toBe('ready:second result:none');

    await act(async () => first.resolve('stale first result'));
    expect(view.container.textContent).toBe('ready:second result:none');
  });
});
