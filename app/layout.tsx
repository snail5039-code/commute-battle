import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import PwaRegistration from '@/components/PwaRegistration';

export const metadata: Metadata = {
  title: '출퇴근 생존일지',
  description: '매일의 출퇴근을 기록하고 캐릭터와 함께 성장하세요.',
  applicationName: '출퇴근 배틀',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '출퇴근 배틀',
  },
  icons: {
    icon: '/icons/app-icon.svg',
    apple: '/icons/app-icon-maskable.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
        <PwaInstallPrompt />
        <PwaRegistration />
      </body>
    </html>
  );
}
