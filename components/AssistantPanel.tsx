'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, CloudRain, Navigation, Send, ShieldCheck } from 'lucide-react';
import { requestAssistant } from '@/lib/aiClient';
import type { AiEvidence } from '@/lib/aiTypes';
import { loadWorkSchedule, useStore, workTimeToMinutes } from '@/lib/store';
import { assessDataQuality, qualitySummary } from '@/lib/dataQuality';
import { geocodeAddress, loadKakaoMapSdk } from '@/lib/kakaoMap';
import { computeMonthlyStats } from '@/lib/stats';
import { CommuteRecord, User } from '@/lib/types';
import { fetchWeather, weatherLabel, type WeatherResponse } from '@/lib/weather';
import StatusIcon from './StatusIcon';
import AiEvidencePanel from './AiEvidencePanel';

type Intent = 'departure_time' | 'less_walking' | 'commute_summary' | 'unsupported';
interface Answer { intent: Intent; text: string; details: string[]; evidence?: AiEvidence[]; sources?: string[]; cautions?: string[] }
interface RouteSummary { totalTime?: number; totalWalk?: number }

function parseIntent(input: string): Intent {
  const normalized = input.replace(/\s/g, '');
  if (/(언제|몇시).*(나가|출발)|비.*(언제|출발)/.test(normalized)) return 'departure_time';
  if (/(걷기|도보).*(적|최소)|덜걷/.test(normalized)) return 'less_walking';
  if (/(요약|통계|최근|지각|평균)/.test(normalized)) return 'commute_summary';
  return 'unsupported';
}

function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    );
  });
}

async function fetchRoute(start: { lat: number; lng: number }, end: { lat: number; lng: number }) {
  const params = new URLSearchParams({ sx: String(start.lng), sy: String(start.lat), ex: String(end.lng), ey: String(end.lat), mode: 'transit' });
  const response = await fetch(`/api/route/transit?${params}`);
  if (!response.ok) return null;
  const data = await response.json() as { summary?: RouteSummary };
  return data.summary ?? null;
}

function sameAnswer(left: { text: string; details: string[] }, right: { text: string; details: string[] }) {
  return left.text.trim() === right.text.trim() && JSON.stringify(left.details) === JSON.stringify(right.details);
}

const RECENT_RESPONSE_KEY = 'commute-battle:assistant-response-hashes:v1';
function responseHash(value: { text: string; details: string[] }) {
  const input = `${value.text}|${value.details.join('|')}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}
function rememberResponse(value: { text: string; details: string[] }) {
  try {
    const hash = responseHash(value);
    const recent = JSON.parse(sessionStorage.getItem(RECENT_RESPONSE_KEY) || '[]') as string[];
    if (recent.includes(hash)) return false;
    sessionStorage.setItem(RECENT_RESPONSE_KEY, JSON.stringify([hash, ...recent].slice(0, 12)));
  } catch { /* session storage unavailable: do not block the answer */ }
  return true;
}

export default function AssistantPanel({ user, records }: { user: User; records: CommuteRecord[] }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const workStartTime = useStore((state) => state.workSchedule.startTime);
  const setWorkSchedule = useStore((state) => state.setWorkSchedule);
  const workStartMinutes = workTimeToMinutes(workStartTime);
  useEffect(() => { setWorkSchedule(loadWorkSchedule(user.id)); }, [setWorkSchedule, user.id]);
  const stats = useMemo(() => computeMonthlyStats(records, new Date(), workStartMinutes), [records, workStartMinutes]);
  const quality = useMemo(() => assessDataQuality(records), [records]);

  function initialAnswer(intent: Intent): Answer {
    if (intent === 'unsupported') return { intent, text: '출발 시각, 걷기 적은 경로, 최근 통계에 관해서만 도와드릴 수 있어요.', details: ['기록 추가·수정·삭제 요청은 실행하지 않아요.'] };
    if (intent === 'commute_summary') return {
      intent,
      text: stats.weekly.sampleSize ? `최근 7일 평균은 ${stats.weekly.averageMinutes}분, 변동성은 ±${stats.weekly.variabilityMinutes}분이에요.` : '최근 7일에 분석 가능한 완료 기록이 없어요.',
      details: [`안정적인 요일: ${stats.weekly.stableWeekday ?? '판단 보류'}`, `추천: ${stats.weekly.actions.join(' · ')}`, ...qualitySummary(quality).map((value) => `분석 제외: ${value}`)],
    };
    return { intent, text: intent === 'departure_time' ? '최근 기록을 기준으로 출발 시각을 계산하고 있어요.' : '현재 위치에서 걷기 적은 경로를 확인하고 있어요.', details: ['규칙 기반 답변을 먼저 준비했어요.'] };
  }

  async function enhance(question: string, fallback: Answer, forecast: WeatherResponse | null, route: RouteSummary | null) {
    const request = requestAssistant({
      question,
      context: {
        averageMinutes: stats.weekly.averageMinutes,
        variabilityMinutes: stats.weekly.variabilityMinutes,
        lateRate: stats.lateRate,
        weather: forecast ? `${weatherLabel(forecast.current.weatherCode)}, 강수 ${forecast.current.precipitation}mm, 강수확률 ${forecast.current.precipitationProbability}%` : undefined,
        routeMinutes: route?.totalTime ?? null,
      },
    });
    const enhanced = await request.enhancement;
    if (sameAnswer(enhanced, request.fallback) || sameAnswer(enhanced, fallback) || !rememberResponse(enhanced)) return;
    setAnswer({ ...fallback, text: enhanced.conclusion || enhanced.text, details: enhanced.details, evidence: enhanced.evidence?.length ? enhanced.evidence : fallback.evidence, sources: enhanced.sources?.length ? enhanced.sources : fallback.sources, cautions: enhanced.cautions?.length ? enhanced.cautions : fallback.cautions });
  }

  async function ask(question: string) {
    const intent = parseIntent(question);
    const immediate = initialAnswer(intent);
    setAnswer(immediate);
    if (intent === 'unsupported') return;
    setBusy(true);
    try {
      let forecast: WeatherResponse | null = null;
      let route: RouteSummary | null = null;
      if (intent !== 'commute_summary') {
        const start = await currentPosition();
        const workAddress = user.work_address;
        const destination = workAddress ? await loadKakaoMapSdk().then((sdk) => geocodeAddress(sdk, workAddress)).catch(() => null) : null;
        [forecast, route] = await Promise.all([
          start ? fetchWeather(start.lat, start.lng).catch(() => null) : Promise.resolve(null),
          start && destination ? fetchRoute(start, destination).catch(() => null) : Promise.resolve(null),
        ]);
      }

      let fallback = immediate;
      if (intent === 'less_walking') {
        fallback = {
          intent,
          text: route ? `현재 대중교통 경로의 예상 도보는 약 ${Math.round((route.totalWalk ?? 0) / 100) / 10}km예요.` : '경로 API를 확인하지 못했어요. 이동 화면에서 현재 위치 기준 경로를 비교해 주세요.',
          details: [route?.totalTime ? `예상 총 ${route.totalTime}분` : '등록한 회사 주소와 위치 권한을 확인해 주세요.', '도보 최소 요청으로 해석했어요.'],
        };
      } else if (intent === 'departure_time') {
        const tripMinutes = route?.totalTime ?? stats.weekly.averageMinutes ?? 45;
        const rainBuffer = forecast && (forecast.current.precipitation > 0 || forecast.current.precipitationProbability >= 30) ? 10 : 0;
        const variability = stats.weekly.variabilityMinutes ?? 5;
        const departureMinutes = Math.max(0, workStartMinutes - tripMinutes - rainBuffer - variability);
        fallback = {
          intent,
          text: `${String(Math.floor(departureMinutes / 60)).padStart(2, '0')}:${String(departureMinutes % 60).padStart(2, '0')} 출발을 권해요.`,
          details: [`이동 ${tripMinutes}분 + 변동 여유 ${variability}분${rainBuffer ? ' + 비 여유 10분' : ''}`, forecast ? `${weatherLabel(forecast.current.weatherCode)} · 강수 ${forecast.current.precipitation}mm · 강수확률 ${forecast.current.precipitationProbability}%` : '날씨 조회 실패: 통계 기준으로 계산', route ? '실시간 경로 API 반영' : '경로 조회 실패: 최근 평균으로 계산'],
        };
      }
      const checkedAt = new Date().toISOString();
      const evidence: AiEvidence[] = [
        { label: '최근 통근 기록 분석', kind: 'record', checkedAt, values: [stats.weekly.averageMinutes === null ? '평균 없음' : `평균 ${stats.weekly.averageMinutes}분`, stats.lateRate === null ? '지각률 없음' : `지각률 ${stats.lateRate}%`], fallback: false, source: '브라우저에 저장된 통근 기록' },
        forecast ? { label: '현재 날씨 조회', kind: 'realtime', checkedAt, values: [`강수 ${forecast.current.precipitation}mm`, `강수확률 ${forecast.current.precipitationProbability}%`], fallback: false, source: '날씨 API' } : { label: '날씨 조회 실패', kind: 'estimate', checkedAt, fallback: true, source: '저장 기록 기반 계산' },
        route ? { label: '현재 대중교통 경로', kind: 'realtime', checkedAt, values: [`예상 ${route.totalTime ?? 0}분`, `도보 ${route.totalWalk ?? 0}m`], fallback: false, source: '경로 API' } : { label: '경로 조회 실패', kind: 'estimate', checkedAt, values: [stats.weekly.averageMinutes === null ? '기본 45분' : `최근 평균 ${stats.weekly.averageMinutes}분`], fallback: true, source: '규칙 기반 계산' },
      ];
      fallback = { ...fallback, evidence: intent === 'commute_summary' ? evidence.slice(0, 1) : evidence, sources: ['통근 기록', ...(forecast ? ['날씨 API'] : []), ...(route ? ['경로 API'] : [])], cautions: ['실시간 교통 상황과 실제 소요 시간은 달라질 수 있습니다.'] };
      setAnswer(fallback);
      await enhance(question, fallback, forecast, route).catch(() => undefined);
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); const question = input.trim(); if (!question || busy) return; setInput(''); void ask(question); }
  const examples = ['오늘 비 오는데 언제 나가?', '걷기 적은 경로', '최근 7일 통계 요약'];
  return <div className="min-w-0 space-y-4">
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5"><div className="flex items-center gap-3"><StatusIcon icon={Bot} tone="blue" size="lg" /><div className="min-w-0"><h2 className="font-bold text-slate-950">출퇴근 비서</h2><p className="mt-0.5 text-xs leading-5 text-slate-500">날씨 · 경로 · 신뢰 가능한 통계를 함께 확인해요.</p></div></div></section>
    <div className="flex flex-wrap gap-2">{examples.map((example) => <button key={example} onClick={() => void ask(example)} disabled={busy} className="min-h-10 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">{example}</button>)}</div>
    {answer && <section aria-live="polite" className="card p-5"><h3 className="text-xs font-bold text-slate-500">결론</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-900">{answer.text}</p><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">{answer.details.map((detail, index) => <li key={`${detail}-${index}`} className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-600"/>{detail}</li>)}</ul>{answer.intent === 'less_walking' && <Link href="/map" className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Navigation size={14}/>이동 화면 열기</Link>}<AiEvidencePanel evidence={answer.evidence ?? [{ label: '규칙 기반 답변', kind: 'estimate', fallback: true, source: '앱 내 계산' }]} sources={answer.sources ?? []} cautions={answer.cautions ?? []}/></section>}
    <form onSubmit={submit} className="card flex min-w-0 gap-2 p-3"><label className="sr-only" htmlFor="assistant-question">질문</label><input id="assistant-question" value={input} onChange={(event) => setInput(event.target.value)} placeholder="출퇴근 질문을 입력하세요" className="min-w-0 flex-1 rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"/><button disabled={busy} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="질문 보내기">{busy ? <CloudRain className="animate-pulse" size={18}/> : <Send size={18}/>}</button></form>
    <p className="text-center text-[11px] text-neutral-400">규칙 기반 intent만 처리하며 데이터베이스에는 쓰지 않습니다.</p>
  </div>;
}
