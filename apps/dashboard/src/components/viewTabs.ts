import type { ElementType } from 'react';
import { SquaresFour, ChartBar, Storefront, Cpu, Terminal } from '@phosphor-icons/react';

export type ViewTab = 'dashboard' | 'usage' | 'watch' | 'tps' | 'sql';

interface NavItem {
  value: ViewTab;
  label: string;
  icon: ElementType;
  requiresSession?: boolean;
}

export const VIEW_TABS: NavItem[] = [
  { value: 'dashboard', label: 'Overview', icon: SquaresFour },
  { value: 'usage', label: 'Usage', icon: ChartBar, requiresSession: true },
  { value: 'watch', label: 'Market', icon: Storefront },
  { value: 'tps', label: 'Providers', icon: Cpu },
  { value: 'sql', label: 'SQL', icon: Terminal, requiresSession: true },
];
