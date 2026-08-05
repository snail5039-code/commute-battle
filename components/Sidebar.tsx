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
    <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-width)] shrink-0 flex-col items-center border-r border-slate-200/80 bg-white/80 py-4 backdrop-blur-xl md:flex">
      <Link href="/" className="group relative flex size-12 items-center justify-center rounded-2xl text-slate-950" aria-label="출퇴근 생존일지 홈">
        <span className="flex size-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-200/70 transition-transform group-hover:-translate-y-0.5">
          <Siren size={19} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="sidebar-tooltip">출퇴근 생존일지</span>
      </Link>

      <nav aria-label="주요 메뉴" className="mt-7 flex flex-1 flex-col items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const label = LABELS[item.href] ?? item.label;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} aria-label={label}
              className={`group relative flex size-11 items-center justify-center rounded-[14px] transition-all ${isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
              <span className="sidebar-tooltip">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 pt-3">
        <Link href="/login" aria-label="로그인" className="group relative flex size-11 items-center justify-center rounded-[14px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <LogIn size={20} aria-hidden="true" /><span className="sidebar-tooltip">로그인</span>
        </Link>
      </div>
    </aside>
  );
}
