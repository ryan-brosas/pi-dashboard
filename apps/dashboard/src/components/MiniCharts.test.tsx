import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MiniBarLineChart, MiniStackedAreaChart } from './MiniCharts';

function render(node: React.ReactNode): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(node);
  return container;
}

describe('MiniCharts', () => {
  it('renders distinct cost-axis labels for sub-dollar totals', () => {
    const chart = render(
      <MiniBarLineChart data={[
        { label: 'Now', calls: 4, costUsd: 0.01 },
        { label: 'Later', calls: 2, costUsd: 0.005 },
      ]} />,
    );
    const costLabels = [...chart.querySelectorAll('text')]
      .map((node) => node.textContent ?? '')
      .filter((label) => label.startsWith('$'));

    expect(costLabels).toHaveLength(5);
    expect(new Set(costLabels)).toHaveLength(5);
  });

  it('exposes chart meaning to assistive technology', () => {
    const points = [
      { label: 'Now', calls: 4, costUsd: 0.01, cacheReadTokens: 20, inputTokens: 10, outputTokens: 5 },
      { label: 'Later', calls: 2, costUsd: 0.005, cacheReadTokens: 15, inputTokens: 8, outputTokens: 3 },
    ];

    expect(render(<MiniBarLineChart data={points} />).querySelector('svg')?.getAttribute('aria-label'))
      .toBe('Cost and request volume over time');
    expect(render(<MiniStackedAreaChart data={points} />).querySelector('svg')?.getAttribute('aria-label'))
      .toBe('Token composition over time');
  });

  it('labels a single interval instead of presenting it as an empty plot', () => {
    const point = {
      label: 'Now', calls: 4, costUsd: 0.01,
      cacheReadTokens: 20, inputTokens: 10, outputTokens: 5,
    };

    expect(render(<MiniBarLineChart data={[point]} />).textContent).toContain('One interval in range');
    expect(render(<MiniStackedAreaChart data={[point]} />).textContent).toContain('One interval in range');
  });
});
