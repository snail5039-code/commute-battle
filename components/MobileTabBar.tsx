'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';

const LABELS: Record<string, string> = {
  '/': '홈', '/map': '이동', '/badges': '배지', '/stats': '통계', '/settings': '설정',
};

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-6 px-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const label = LABELS[item.href] ?? item.label;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${isActive ? 'text-blue-700' : 'text-slate-500 active:bg-slate-100'}`}>
              {isActive && <span className="absolute top-1 h-0.5 w-5 rounded-full bg-blue-600" />}
              <span className={`flex size-9 items-center justify-center rounded-xl transition-all ${isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-100'}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
              </span>
              <span className="max-w-full truncate px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
