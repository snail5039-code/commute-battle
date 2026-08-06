'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-full overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          const label = item.label;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} aria-label={label}
              className={`relative flex min-h-16 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors ${isActive ? 'text-blue-700' : 'text-slate-500 active:bg-slate-100'}`}>
              {isActive && <span className="absolute top-1 h-0.5 w-5 rounded-full bg-blue-600" />}
              <span className={`flex size-9 items-center justify-center rounded-xl transition-all ${isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-100'}`}>
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
