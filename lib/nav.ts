import { Award, BarChart3, BookOpen, Bot, Download, Home, MapPin, MessageCircle, MessagesSquare, Settings, ShieldCheck, UserRoundCheck, LucideIcon } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: LucideIcon }
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', icon: Home },
  { href: '/map', label: '이동', icon: MapPin },
  { href: '/stats', label: '근태 통계', icon: BarChart3 },
  { href: '/badges', label: '배지', icon: Award },
  { href: '/admin', label: '관리자 현황', icon: ShieldCheck },
  { href: '/chat', label: '부서 채팅', icon: MessagesSquare },
  { href: '/messages', label: '개인 채팅', icon: UserRoundCheck },
  { href: '/community', label: '커뮤니티', icon: MessageCircle },
  { href: '/assistant', label: '출퇴근 비서', icon: Bot },
  { href: '/settings', label: '설정', icon: Settings },
  { href: '/install', label: '앱 설치', icon: Download },
  { href: '/guide', label: '사용법', icon: BookOpen },
];
