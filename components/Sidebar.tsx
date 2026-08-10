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
    <aside className="sticky top-0 z-50 hidden h-screen w-16 shrink-0 flex-col items-center border-r border-[var(--nav-border)] bg-[var(--nav-bg)] py-3 text-[var(--nav-text)] md:flex">
      <Link href="/" className="group relative flex size-10 items-center justify-center" aria-label="출퇴근 생존일지 홈">
        <StatusIcon icon={Siren} inverted className="bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] transition-opacity group-hover:opacity-85" />
        <span className="sidebar-tooltip">출퇴근 생존일지</span>
      </Link>

      <nav aria-label="주요 메뉴" className="mt-4 flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 [scrollbar-width:none]">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          const label = item.label;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} aria-label={label}
              className={`group relative flex size-10 items-center justify-center transition-colors ${isActive ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]' : 'text-[var(--nav-text)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]'}`}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
              <span className="sidebar-tooltip">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--nav-border)] pt-3">
        <LogoutButton compact />
      </div>
    </aside>
  );
}
