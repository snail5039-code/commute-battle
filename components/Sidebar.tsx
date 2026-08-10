'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Siren } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';
import StatusIcon from './StatusIcon';
import LogoutButton from './LogoutButton';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-50 hidden h-screen w-16 shrink-0 flex-col items-center border-r border-[#5f3567] bg-[#3f0e40] py-3 md:flex">
      <Link href="/" className="group relative flex size-10 items-center justify-center text-white" aria-label="출퇴근 생존일지 홈">
        <StatusIcon icon={Siren} inverted className="bg-[#611f69] transition-colors group-hover:bg-[#7b2b84]" />
        <span className="sidebar-tooltip">출퇴근 생존일지</span>
      </Link>

      <nav aria-label="주요 메뉴" className="mt-4 flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 [scrollbar-width:none]">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          const label = item.label;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} aria-label={label}
              className={`group relative flex size-10 items-center justify-center transition-colors ${isActive ? 'bg-white text-[#3f0e40]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
              <span className="sidebar-tooltip">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/15 pt-3 text-white">
        <LogoutButton compact />
      </div>
    </aside>
  );
}
