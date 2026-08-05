'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import SwipeNav from './SwipeNav';
import PetWidget from './PetWidget';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 min-h-screen bg-[#f5f6f8]">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-16 md:pb-0">
        <SwipeNav>{children}</SwipeNav>
      </main>
      <MobileTabBar />
      <PetWidget />
    </div>
  );
}
