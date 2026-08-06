'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPwaServerSnapshot, getPwaSnapshot, initializePwaInstall, requestPwaInstall, subscribePwa, type PwaPlatform } from '@/lib/pwa';

const guides: Array<{ platform: PwaPlatform; title: string; label: string; steps: string[] }> = [
  { platform: 'android', title: 'Android · Chrome', label: 'Android', steps: ['Chrome에서 이 페이지를 엽니다.', '상단의 설치하기 버튼 또는 브라우저 메뉴(⋮)를 누릅니다.', '‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택합니다.'] },
  { platform: 'ios', title: 'iPhone · iPad', label: 'iOS', steps: ['Safari에서 이 페이지를 엽니다.', '하단 또는 상단의 공유 버튼(□↑)을 누릅니다.', '‘홈 화면에 추가’를 선택하고 ‘추가’를 누릅니다.'] },
  { platform: 'desktop', title: '데스크톱 · Chrome/Edge', label: '데스크톱', steps: ['Chrome 또는 Edge에서 이 페이지를 엽니다.', '주소창 오른쪽의 설치 아이콘을 누르거나 브라우저 메뉴를 엽니다.', '‘출퇴근 배틀 설치’를 선택해 확인합니다.'] },
];

export default function PwaInstallGuide() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaSnapshot, getPwaServerSnapshot);
  const [result, setResult] = useState('');

  useEffect(() => { initializePwaInstall(); }, []);

  const install = async () => {
    setResult('');
    const outcome = await requestPwaInstall();
    if (outcome === 'dismissed') setResult('설치를 취소했습니다. 원할 때 다시 시도할 수 있어요.');
    if (outcome === 'unavailable') setResult('브라우저 메뉴의 설치 기능을 이용해 주세요.');
  };

  const status = pwa.installed
    ? { label: '설치됨', detail: '이 기기에 이미 앱이 설치되어 있어요.', tone: 'bg-emerald-50 text-emerald-800' }
    : pwa.canPrompt
      ? { label: '설치 가능', detail: '지금 바로 이 기기에 설치할 수 있어요.', tone: 'bg-blue-50 text-blue-800' }
      : pwa.platform === 'ios'
        ? { label: '수동 설치', detail: 'Safari 공유 메뉴에서 홈 화면에 추가해 주세요.', tone: 'bg-amber-50 text-amber-800' }
        : { label: '브라우저에서 확인', detail: '설치 조건이 충족되면 브라우저 메뉴에 설치 항목이 나타나요.', tone: 'bg-slate-100 text-slate-700' };

  return (
    <div className="space-y-5">
      <section className={`rounded-2xl p-5 ${status.tone}`} aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-bold">현재 상태 · {status.label}</p><p className="mt-1 text-sm opacity-80">{status.detail}</p></div>
          {pwa.canPrompt && !pwa.installed && <button type="button" onClick={() => void install()} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">이 기기에 설치하기</button>}
        </div>
        {result && <p className="mt-3 text-sm font-semibold">{result}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {guides.map((guide) => {
          const current = guide.platform === pwa.platform;
          return <section key={guide.platform} className={`card p-5 ${current ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="flex items-center justify-between gap-2"><h2 className="font-extrabold">{guide.title}</h2>{current && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">현재 기기</span>}</div>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">{guide.steps.map((step, index) => <li key={step} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{index + 1}</span><span>{step}</span></li>)}</ol>
          </section>;
        })}
      </div>

      <p className="text-sm leading-6 text-slate-500">설치 항목이 보이지 않으면 일반 브라우저 탭에서 다시 열고 페이지를 새로고침해 보세요. 시크릿 모드나 일부 인앱 브라우저에서는 설치가 지원되지 않을 수 있습니다.</p>
    </div>
  );
}
