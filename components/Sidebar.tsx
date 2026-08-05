'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, Siren } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 bg-white/70 backdrop-blur-xl border-r border-black/[0.06] flex-col">
      <div className="h-16 flex items-center px-5">
        <div className="w-7 h-7 rounded-[8px] bg-gradient-to-b from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
          <Siren size={15} className="text-white" strokeWidth={2.25} />
        </div>
        <span className="ml-2.5 font-semibold text-[15px] text-neutral-900 tracking-tight">
          출퇴근전쟁봇
        </span>
      </div>

      <nav className="flex-1 py-2 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-blue-500/10 text-blue-600'
                  : 'text-neutral-500 hover:bg-black/[0.04] hover:text-neutral-800'
              }`}
            >
              <Icon size={17} strokeWidth={isActive ? 2.5 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="py-3 px-3 border-t border-black/[0.06]">
        <Link
          href="/login"
          className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-neutral-400 hover:bg-black/[0.04] hover:text-neutral-700 transition-all"
        >
          <LogIn size={17} />
          <span>로그인</span>
        </Link>
      </div>
    </aside>
  );
}
