export type ViewTab = 'dashboard' | 'usage' | 'watch' | 'tps' | 'sql';

interface NavItem {
  value: ViewTab;
  label: string;
  requiresSession?: boolean;
}

export const VIEW_TABS: NavItem[] = [
  { value: 'dashboard', label: 'Overview' },
  { value: 'usage', label: 'Usage', requiresSession: true },
  { value: 'watch', label: 'Market' },
  { value: 'tps', label: 'Provider stats' },
  { value: 'sql', label: 'SQL', requiresSession: true },
];
