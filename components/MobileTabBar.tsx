'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--nav-border)] bg-[var(--nav-bg)] pb-[env(safe-area-inset-bottom)] text-[var(--nav-text)] md:hidden">
      <div className="mx-auto flex max-w-full overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          const label = item.label;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} aria-label={label}
              className={`relative flex min-h-16 min-w-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors ${isActive ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]' : 'text-[var(--nav-text)] active:bg-[var(--surface-muted)]'}`}>
              {isActive && <span className="absolute top-0 h-0.5 w-full bg-[var(--brand)]" />}
              <span className="flex size-8 items-center justify-center">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
              </span>
              <span className="max-w-full whitespace-nowrap px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
