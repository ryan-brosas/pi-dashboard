/**
 * Lightweight pure-SVG chart primitives for the snapshot-backed Usage
 * dashboard. Replaces Recharts (~287 KB raw) with ~3 KB of hand-rolled
 * SVG — no external dependency, no canvas, same CSS-variable theming.
 */

interface ChartPoint {
  label: string;
  [key: string]: string | number;
}

const AXIS_FONT = 11;
const PAD = { top: 8, right: 8, bottom: 24, left: 0 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function scale(value: number, max: number, height: number): number {
  return max > 0 ? height - (value / max) * height : height;
}

function formatCostTick(value: number, max: number): string {
  const precision = max >= 100 ? 0 : max >= 10 ? 1 : max >= 1 ? 2 : max >= 0.1 ? 3 : 4;
  return `$${value.toFixed(precision)}`;
}

function EmptyChartState({ height }: { height: number }) {
  return (
    <div role="img" aria-label="No chart data in range" className="grid place-items-center text-center" style={{ height }}>
      <p className="text-xs font-semibold text-[var(--text-secondary)]">No chart data in range</p>
    </div>
  );
}

/** Dual-axis bar + line chart for cost vs. call volume. */
export function MiniBarLineChart({
  data, height = 270,
}: {
  data: ChartPoint[];
  height?: number;
}) {
  if (data.length === 0) {
    return <EmptyChartState height={height} />;
  }

  const chartH = height - PAD.top - PAD.bottom;
  const width = 800;
  const chartW = width - PAD.left - PAD.right - 44; // right Y-axis

  const maxCalls = niceMax(Math.max(...data.map((d) => Number(d.calls) || 0), 0));
  const maxCost = niceMax(Math.max(...data.map((d) => Number(d.costUsd) || 0), 0));

  const barW = Math.min(40, (chartW / data.length) * 0.6);
  const step = data.length > 0 ? chartW / data.length : 0;

  const linePath = data
    .map((d, i) => {
      const x = PAD.left + step * i + step / 2;
      const y = PAD.top + scale(Number(d.costUsd) || 0, maxCost, chartH);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    cost: maxCost * t,
    calls: maxCalls * t,
    y: PAD.top + chartH - t * chartH,
  }));

  const xTicks = data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 8)) === 0);

  return (
    <svg role="img" aria-label="Cost and request volume over time" viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <line key={i} x1={PAD.left} y1={t.y} x2={PAD.left + chartW} y2={t.y} stroke="var(--chart-grid)" strokeDasharray="3 3" />
      ))}
      {/* Left Y-axis (cost) */}
      {yTicks.map((t, i) => (
        <text key={`yl${i}`} x={PAD.left + 38} y={t.y + 3} fontSize={AXIS_FONT} fill="var(--chart-axis)" textAnchor="end">
          {formatCostTick(t.cost, maxCost)}
        </text>
      ))}
      {/* Right Y-axis (calls) */}
      {yTicks.map((t, i) => (
        <text key={`yr${i}`} x={PAD.left + chartW + 4} y={t.y + 3} fontSize={AXIS_FONT} fill="var(--chart-axis)" textAnchor="start">
          {t.calls >= 1000 ? `${(t.calls / 1000).toFixed(0)}k` : t.calls.toFixed(0)}
        </text>
      ))}
      {/* Bars */}
      {data.map((d, i) => {
        const calls = Number(d.calls) || 0;
        const x = PAD.left + step * i + (step - barW) / 2;
        const h = (calls / maxCalls) * chartH;
        return <rect key={`b${i}`} x={x} y={PAD.top + chartH - h} width={barW} height={h} fill="var(--chart-axis)" opacity={0.22} rx={3} />;
      })}
      {/* Line */}
      <path d={linePath} fill="none" stroke="var(--chart-primary)" strokeWidth={2.5} />
      {data.length < 40 && data.map((d, i) => {
        const x = PAD.left + step * i + step / 2;
        const y = PAD.top + scale(Number(d.costUsd) || 0, maxCost, chartH);
        return <circle key={`d${i}`} cx={x} cy={y} r={3} fill="var(--chart-primary)" />;
      })}
      {data.length === 1 && (
        <text x={PAD.left + chartW / 2} y={PAD.top + 18} fontSize={AXIS_FONT} fill="var(--chart-axis)" textAnchor="middle">
          One interval in range · add activity to see a trend
        </text>
      )}
      {/* X-axis labels */}
      {xTicks.map((d) => {
        const i = data.indexOf(d);
        const x = PAD.left + step * i + step / 2;
        return <text key={`x${i}`} x={x} y={height - 6} fontSize={AXIS_FONT} fill="var(--chart-axis)" textAnchor="middle">{d.label}</text>;
      })}
    </svg>
  );
}

/** Stacked area chart for token composition (cache read, input, output). */
export function MiniStackedAreaChart({
  data, height = 250,
}: {
  data: ChartPoint[];
  height?: number;
}) {
  if (data.length === 0) {
    return <EmptyChartState height={height} />;
  }

  const chartH = height - PAD.top - PAD.bottom;
  const width = 800;
  const chartW = width - PAD.left - PAD.right - 48;

  const maxTotal = niceMax(Math.max(...data.map((d) =>
    (Number(d.cacheReadTokens) || 0) + (Number(d.inputTokens) || 0) + (Number(d.outputTokens) || 0)
  ), 1));

  const step = data.length > 1 ? chartW / (data.length - 1) : 0;
  const series = [
    { key: 'cacheReadTokens', stroke: 'var(--chart-positive)', fill: 'var(--chart-positive)' },
    { key: 'inputTokens', stroke: 'var(--chart-primary)', fill: 'var(--chart-primary)' },
    { key: 'outputTokens', stroke: 'var(--chart-warning)', fill: 'var(--chart-warning)' },
  ];

  // Build stacked paths
  const stacks = series.map((s, si) => {
    const lower = data.map((d, i) => {
      const x = data.length === 1 ? PAD.left + chartW / 2 : PAD.left + step * i;
      let base = 0;
      for (let j = 0; j < si; j++) base += Number(data[i][series[j].key]) || 0;
      return { x, base, val: Number(d[s.key]) || 0 };
    });
    const top = lower.map((p) => ({ x: p.x, y: PAD.top + scale(p.base + p.val, maxTotal, chartH) }));
    const bottom = lower.map((p) => ({ x: p.x, y: PAD.top + scale(p.base, maxTotal, chartH) }));
    const path = [
      ...top.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      ...bottom.reverse().map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      'Z',
    ].join(' ');
    return { path, stroke: s.stroke, fill: s.fill };
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: maxTotal * t,
    y: PAD.top + chartH - t * chartH,
  }));

  const xTicks = data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 8)) === 0);

  return (
    <svg role="img" aria-label="Token composition over time" viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
      {yTicks.map((t, i) => (
        <line key={i} x1={PAD.left} y1={t.y} x2={PAD.left + chartW} y2={t.y} stroke="var(--chart-grid)" strokeDasharray="3 3" />
      ))}
      {yTicks.map((t, i) => (
        <text key={`y${i}`} x={PAD.left + 44} y={t.y + 3} fontSize={AXIS_FONT} fill="var(--chart-axis)" textAnchor="end">
          {t.val >= 1e6 ? `${(t.val / 1e6).toFixed(0)}M` : t.val >= 1e3 ? `${(t.val / 1e3).toFixed(0)}k` : t.val.toFixed(0)}
        </text>
      ))}
      {data.length === 1 ? (() => {
        let base = 0;
        return series.map((item) => {
          const value = Number(data[0][item.key]) || 0;
          const y = PAD.top + scale(base + value, maxTotal, chartH);
          const segmentHeight = (value / maxTotal) * chartH;
          base += value;
          return <rect key={item.key} x={PAD.left + chartW / 2 - 20} y={y} width={40} height={segmentHeight} fill={item.fill} fillOpacity={0.5} />;
        });
      })() : stacks.map((s, i) => (
        <path key={i} d={s.path} fill={s.fill} fillOpacity={0.34} stroke={s.stroke} strokeWidth={1.5} />
      ))}
      {data.length === 1 && (
        <text x={PAD.left + chartW / 2} y={PAD.top + 18} fontSize={AXIS_FONT} fill="var(--chart-axis)" textAnchor="middle">
          One interval in range · add activity to see a trend
        </text>
      )}
      {xTicks.map((d) => {
        const i = data.indexOf(d);
        const x = data.length === 1 ? PAD.left + chartW / 2 : PAD.left + step * i;
        return <text key={`x${i}`} x={x} y={height - 6} fontSize={AXIS_FONT} fill="var(--chart-axis)" textAnchor="middle">{d.label}</text>;
      })}
    </svg>
  );
}
