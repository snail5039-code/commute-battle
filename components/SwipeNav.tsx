'use client';

import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';

const SWIPE_THRESHOLD = 60;

export default function SwipeNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!start.current) return;
    const t = e.changedTouches[0];
    const deltaX = t.clientX - start.current.x;
    const deltaY = t.clientY - start.current.y;
    start.current = null;

    if (
      Math.abs(deltaX) < SWIPE_THRESHOLD ||
      Math.abs(deltaX) < Math.abs(deltaY) * 1.5
    ) {
      return;
    }

    const currentIndex = NAV_ITEMS.findIndex((item) => item.href === pathname);
    if (currentIndex === -1) return;

    // swipe left (finger moves left) -> go to next tab
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const next = NAV_ITEMS[nextIndex];
    if (next) router.push(next.href);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="min-h-screen">
      {children}
    </div>
  );
}
