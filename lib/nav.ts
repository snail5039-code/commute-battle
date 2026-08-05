import { Home, Award, BarChart3, Settings, LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', icon: Home },
  { href: '/badges', label: '배지', icon: Award },
  { href: '/stats', label: '통계', icon: BarChart3 },
  { href: '/settings', label: '설정', icon: Settings },
];
