import { SmartTooltip } from '../SmartTooltip';
import { TpsTooltip } from '../tooltips';
import { formatTps } from '@pi-tps/metrics-core';

function PillBody({ label, value, unit, subLabel, subValue, inline = false }: {
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  inline?: boolean;
}) {
  return (
    <div className={inline ? 'min-w-0' : 'min-w-0 rounded-md border border-[var(--border)] px-3.5 py-2.5'}>
      <p className="ui-kicker">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <p className={`metric-value whitespace-nowrap font-semibold leading-tight text-[var(--text-primary)] ${inline ? 'text-sm' : 'text-base'}`}>
          {value}
          {unit && <span className="ml-0.5 text-2xs font-normal text-[var(--text-tertiary)]">{unit}</span>}
        </p>
        {subValue && (
          <span className="text-2xs leading-tight text-[var(--text-tertiary)]">
            {subLabel && <span className="mr-0.5">{subLabel}</span>}
            <span className="metric-mono">{subValue}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function MetricPill({ label, value, unit, subLabel, subValue, tooltip, inline = false }: {
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  tooltip?: React.ReactNode;
  inline?: boolean;
}) {
  const body = (
    <PillBody label={label} value={value} unit={unit} subLabel={subLabel} subValue={subValue} inline={inline} />
  );
  if (!tooltip) return body;
  return <SmartTooltip content={tooltip}>{body}</SmartTooltip>;
}

export function TpsPill({ label, activeTps, wallTps, lossPct, mode, inline = false }: {
  label: string;
  activeTps: number;
  wallTps: number;
  lossPct: number;
  mode: 'avg' | 'weighted';
  inline?: boolean;
}) {
  return (
    <SmartTooltip
      content={<TpsTooltip activeTps={activeTps} wallTps={wallTps} lossPct={lossPct} mode={mode} />}
      preferredPlacement="bottom"
      gap={10}
    >
      <PillBody label={label} value={formatTps(activeTps)} unit="tok/s" inline={inline} />
    </SmartTooltip>
  );
}
