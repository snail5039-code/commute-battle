'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import SwipeNav from './SwipeNav';
import PetWidget from './PetWidget';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = localStorage.getItem('uiCompact') === 'true' ? 'compact' : '';
    root.dataset.contrast = localStorage.getItem('uiContrast') === 'true' ? 'high' : '';
    root.dataset.motion = localStorage.getItem('uiReducedMotion') === 'true' ? 'reduced' : '';
  }, []);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-transparent">
      <Sidebar />
      <main id="main-content" className="relative min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <SwipeNav>{children}</SwipeNav>
      </main>
      <MobileTabBar />
      <PetWidget />
    </div>
  );
}
