import type { ElementType } from 'react';
import { SquaresFour, ChartBar, Storefront, Cpu, Terminal } from '@phosphor-icons/react';

export type ViewTab = 'dashboard' | 'usage' | 'watch' | 'tps' | 'sql';

export type NavGroup = 'data' | 'market';

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  data: 'Your data',
  market: 'Market',
};

interface NavItem {
  value: ViewTab;
  label: string;
  icon: ElementType;
  requiresSession?: boolean;
  group: NavGroup;
}

export const VIEW_TABS: NavItem[] = [
  { value: 'dashboard', label: 'Overview', icon: SquaresFour, group: 'data' },
  { value: 'usage', label: 'Usage', icon: ChartBar, requiresSession: true, group: 'data' },
  { value: 'sql', label: 'SQL', icon: Terminal, requiresSession: true, group: 'data' },
  { value: 'watch', label: 'Market', icon: Storefront, group: 'market' },
  { value: 'tps', label: 'Providers', icon: Cpu, group: 'market' },
];
