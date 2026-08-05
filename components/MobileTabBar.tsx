'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/80 backdrop-blur-xl border-t border-black/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 py-2.5"
            >
              <Icon
                size={21}
                strokeWidth={isActive ? 2.5 : 2}
                className={isActive ? 'text-blue-600' : 'text-neutral-400'}
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? 'text-blue-600' : 'text-neutral-400'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
