'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, Siren } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';

const LABELS: Record<string, string> = {
  '/': '홈', '/map': '이동', '/badges': '배지', '/stats': '통계', '/settings': '설정',
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r border-slate-200/80 bg-white/75 backdrop-blur-xl md:flex">
      <Link href="/" className="mx-4 mt-4 flex h-14 items-center gap-3 rounded-2xl px-3 text-slate-950" aria-label="출퇴근 생존일지 홈">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-200">
          <Siren size={18} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold tracking-tight">출퇴근 생존일지</span>
          <span className="block text-[11px] font-medium text-slate-400">오늘도 무사 귀환</span>
        </span>
      </Link>

      <nav aria-label="주요 메뉴" className="mt-6 flex-1 space-y-1 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const label = LABELS[item.href] ?? item.label;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Icon size={19} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="m-4 border-t border-slate-200 pt-3">
        <Link href="/login" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <LogIn size={19} aria-hidden="true" /><span>로그인</span>
        </Link>
      </div>
    </aside>
  );
}
