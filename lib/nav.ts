import { Award, BarChart3, BookOpen, Bot, Download, Home, MapPin, MessageCircle, Settings, LucideIcon } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: LucideIcon }
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', icon: Home }, { href: '/map', label: '이동', icon: MapPin },
  { href: '/assistant', label: '비서', icon: Bot }, { href: '/badges', label: '배지', icon: Award },
  { href: '/stats', label: '통계', icon: BarChart3 }, { href: '/settings', label: '설정', icon: Settings },
  { href: '/community', label: '커뮤니티', icon: MessageCircle },
  { href: '/install', label: '앱 설치', icon: Download }, { href: '/guide', label: '사용법', icon: BookOpen },
];
