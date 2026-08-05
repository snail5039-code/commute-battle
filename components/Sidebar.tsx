'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, Siren } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-16 shrink-0 bg-white/70 backdrop-blur-xl border-r border-black/[0.06] flex-col items-center">
      <div className="h-16 flex items-center justify-center">
        <div className="w-8 h-8 rounded-[9px] bg-gradient-to-b from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
          <Siren size={16} className="text-white" strokeWidth={2.25} />
        </div>
      </div>

      <nav className="flex-1 py-2 space-y-1.5 flex flex-col items-center w-full">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center w-10 h-10 rounded-[10px] transition-all ${
                isActive
                  ? 'bg-blue-500/10 text-blue-600'
                  : 'text-neutral-400 hover:bg-black/[0.04] hover:text-neutral-700'
              }`}
            >
              <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
            </Link>
          );
        })}
      </nav>

      <div className="py-3 border-t border-black/[0.06] w-full flex justify-center">
        <Link
          href="/login"
          title="로그인"
          className="flex items-center justify-center w-10 h-10 rounded-[10px] text-neutral-400 hover:bg-black/[0.04] hover:text-neutral-700 transition-all"
        >
          <LogIn size={19} />
        </Link>
      </div>
    </aside>
  );
}
