import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, MapPin, Play, Settings, Sparkles, Trophy } from 'lucide-react';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = {
  title: '사용법 | 출퇴근 배틀',
  description: '출퇴근 배틀의 기본 설정부터 출퇴근 기록, AI 비서와 보상 기능까지 알아보세요.',
};

const steps = [
  { icon: Settings, title: '1. 출퇴근 정보 설정', description: '설정에서 집과 직장 주소, 출퇴근 시각과 근무 요일을 입력하세요.', href: '/settings', action: '설정 열기' },
  { icon: MapPin, title: '2. 이동 경로 확인', description: '이동 화면에서 현재 위치와 목적지를 확인하고 자주 쓰는 경로를 관리하세요.', href: '/map', action: '이동 열기' },
  { icon: Play, title: '3. 출근·퇴근 기록', description: '홈에서 출근 또는 퇴근 버튼을 누르면 이동 시간이 기록되고 캐릭터가 성장해요.', href: '/', action: '홈으로 이동' },
  { icon: Trophy, title: '4. 도감과 통계 확인', description: '꾸준히 기록해 배지와 액세서리를 모으고, 통계에서 나의 출퇴근 패턴을 살펴보세요.', href: '/badges', action: '도감 열기' },
];

export default function GuidePage() {
  return (
    <div className="min-h-screen">
      <TopBar title="간단한 사용법" subtitle="처음부터 차근차근, 출퇴근 기록을 시작해 보세요" />
      <main className="shell-content p-4 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="card overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white md:p-8">
            <div className="flex items-center gap-2 text-blue-100"><Sparkles size={18} aria-hidden="true" /><span className="text-xs font-bold tracking-widest">빠른 시작</span></div>
            <h1 className="mt-3 break-keep text-2xl font-black md:text-3xl">매일의 출퇴근을 작은 모험으로</h1>
            <p className="mt-3 max-w-2xl break-words text-sm leading-7 text-blue-100">주소와 근무 시간을 한 번 설정하고 출근·퇴근을 기록하세요. 이동 기록이 쌓일수록 캐릭터가 성장하고 새로운 배지와 보상이 열립니다.</p>
          </section>
          <section aria-labelledby="guide-steps-title">
            <h2 id="guide-steps-title" className="text-lg font-extrabold text-slate-900">4단계로 시작하기</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {steps.map(({ icon: Icon, title, description, href, action }) => (
                <article key={title} className="card flex min-w-0 flex-col p-5">
                  <div className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"><Icon size={21} aria-hidden="true" /></div>
                  <h3 className="mt-4 font-extrabold text-slate-900">{title}</h3>
                  <p className="mt-2 flex-1 break-words text-sm leading-6 text-slate-600">{description}</p>
                  <Link href={href} className="mt-4 inline-flex min-h-11 items-center self-start rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">{action}</Link>
                </article>
              ))}
            </div>
          </section>
          <section className="card p-5 md:p-6">
            <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><Bot size={20} aria-hidden="true" /></div><div className="min-w-0"><h2 className="font-extrabold text-slate-900">출퇴근 비서도 활용해 보세요</h2><p className="mt-1 break-words text-sm leading-6 text-slate-600">출발 시각이나 이동 기록이 궁금할 때 출퇴근 비서에게 물어보세요. 실제 기록과 설정 정보를 참고해 답해요.</p><Link href="/assistant" className="mt-3 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-blue-700 hover:bg-blue-50">출퇴근 비서 열기</Link></div></div>
          </section>
        </div>
      </main>
    </div>
  );
}
