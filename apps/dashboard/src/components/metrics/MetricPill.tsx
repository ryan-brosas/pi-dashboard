import { SmartTooltip } from '../SmartTooltip';
import { TpsTooltip } from '../tooltips';
import { formatTps } from '@pi-tps/metrics-core';

const COLOR_SCHEMES: Record<string, { border: string; iconText: string }> = {
  moss: {
    border: 'border-moss/20 dark:border-moss/25',
    iconText: 'text-moss',
  },
  accent: {
    border: 'border-accent/20 dark:border-accent/25',
    iconText: 'text-accent',
  },
  amber: {
    border: 'border-amber/20 dark:border-amber/25',
    iconText: 'text-amber',
  },
  ember: {
    border: 'border-ember/20 dark:border-ember/25',
    iconText: 'text-ember',
  },
};

const DEFAULT_SCHEME = {
  border: 'border-[var(--border)]',
  iconText: 'text-zinc-500 dark:text-zinc-400',
};

const ACCENT_SCHEME = COLOR_SCHEMES.accent;

function getScheme(color?: string, accent?: boolean) {
  if (color && COLOR_SCHEMES[color]) return COLOR_SCHEMES[color];
  if (accent) return ACCENT_SCHEME;
  return DEFAULT_SCHEME;
}

function PillBody({ icon: Icon, label, value, unit, subLabel, subValue, accent = false, color, inline = false }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
  color?: 'moss' | 'accent' | 'amber' | 'ember';
  inline?: boolean;
}) {
  const scheme = getScheme(color, accent);
  if (inline) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Icon weight="bold" size={14} className={`shrink-0 ${scheme.iconText}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <p className="metric-value text-sm font-semibold text-[var(--text-primary)] leading-tight whitespace-nowrap">
              {value}{unit && <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">{unit}</span>}
            </p>
            {subValue && (
              <span className="text-[10px] text-[var(--text-tertiary)] leading-tight">
                {subLabel && <span className="text-[var(--text-tertiary)] mr-0.5">{subLabel}</span>}
                <span className="metric-mono font-medium">{subValue}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border bg-[var(--surface)] transition-colors ${scheme.border}`}
    >
      <Icon weight="bold" size={15} className={`shrink-0 ${scheme.iconText}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] leading-none">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className="metric-value text-base font-semibold text-[var(--text-primary)] leading-tight whitespace-nowrap">
            {value}{unit && <span className="text-xs text-[var(--text-tertiary)] ml-0.5">{unit}</span>}
          </p>
          {subValue && (
            <span className="text-[10px] text-[var(--text-tertiary)] leading-tight">
              {subLabel && <span className="text-[var(--text-tertiary)] mr-0.5">{subLabel}</span>}
              <span className="metric-mono font-medium">{subValue}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MetricPill({ icon, label, value, unit, subLabel, subValue, accent = false, color, tooltip, inline = false }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
  color?: 'moss' | 'accent' | 'amber' | 'ember';
  tooltip?: React.ReactNode;
  inline?: boolean;
}) {
  const body = (
    <PillBody
      icon={icon}
      label={label}
      value={value}
      unit={unit}
      subLabel={subLabel}
      subValue={subValue}
      accent={accent}
      color={color}
      inline={inline}
    />
  );
  if (!tooltip) return body;
  return (
    <SmartTooltip content={tooltip}>
      {body}
    </SmartTooltip>
  );
}

export function TpsPill({ icon, label, activeTps, wallTps, lossPct, accent = false, mode, inline = false }: {
  icon: React.ElementType;
  label: string;
  activeTps: number;
  wallTps: number;
  lossPct: number;
  accent?: boolean;
  mode: 'avg' | 'weighted';
  inline?: boolean;
}) {
  return (
    <SmartTooltip content={
      <TpsTooltip activeTps={activeTps} wallTps={wallTps} lossPct={lossPct} mode={mode} />
    } preferredPlacement="bottom" gap={10}>
      <PillBody
        icon={icon}
        label={label}
        value={formatTps(activeTps)}
        unit="tok/s"
        accent={accent}
        inline={inline}
      />
    </SmartTooltip>
  );
}
