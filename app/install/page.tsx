import type { Metadata } from 'next';
import Link from 'next/link';
import PwaInstallGuide from '@/components/PwaInstallGuide';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = {
  title: '앱 설치 방법 | 출퇴근 배틀',
  description: 'Android, iPhone, iPad, 데스크톱에서 출퇴근 배틀을 설치하는 방법을 확인하세요.',
};

export default function InstallPage() {
  return (
    <div className="min-h-screen">
      <TopBar title="앱 설치" subtitle="홈 화면에서 더 빠르고 편하게 시작하세요" />
      <main className="shell-content p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <PwaInstallGuide />
          <Link href="/settings" className="mt-6 inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100">설정으로 돌아가기</Link>
        </div>
      </main>
    </div>
  );
}
