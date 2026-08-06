'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, LoaderCircle, Navigation, Plus, RefreshCcw, Send, ShieldCheck, UserRound } from 'lucide-react';
import { requestAssistant } from '@/lib/aiClient';
import { AI_ASSISTANT_HISTORY_LIMIT } from '@/lib/aiPayload';
import type { AiEvidence, AssistantAnswer } from '@/lib/aiTypes';
import { getWorkdaySchedule, loadWorkSchedule, useStore } from '@/lib/store';
import { computePeriodStats } from '@/lib/stats';
import type { CommuteRecord, User } from '@/lib/types';
import AiEvidencePanel from './AiEvidencePanel';
import StatusIcon from './StatusIcon';

const MAX_QUESTION_LENGTH = 300;
const STARTERS = ['오늘 몇 시에 출발하면 좋을까?', '버스랑 도보 중 뭐가 나아?', '지도에서 경로는 어떻게 봐?'];

type Intent = 'departure' | 'route' | 'mobility-choice' | 'summary' | 'site' | 'badge' | 'settings' | 'security' | 'clarify' | 'other';
type Turn = { id: number; question: string; answer: AssistantAnswer; intent: Intent; failed: boolean };

function normalize(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_QUESTION_LENGTH);
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function hasDestinationHint(text: string) {
  return /까지|으로|로|회사|집|학교|역|터미널|공항|병원|카페|강남|서울|대전|부산|인천|주소/.test(text);
}

function isShortQuestion(text: string) {
  const compact = text.replace(/\s/g, '');
  return compact.length <= 6 || ['뭐야', '왜', '어떻게', '문제', '안돼', '안됨', '알려줘', '해줘'].includes(compact);
}

function classify(question: string): Intent {
  const text = question.replace(/\s/g, '').toLowerCase();
  if (includesAny(text, ['비밀번호', 'password', '패스워드', 'apikey', 'api키', 'secret', '시크릿', '토큰', 'token', '쿠키', 'cookie', '세션', 'session', 'supabasekey', 'db접속', '데이터베이스접속', '해킹', '우회', '권한우회', '보안해제', '관리자권한'])) return 'security';

  const asksTransportChoice = includesAny(text, ['버스', '택시', '도보', '걸어', '걸어서', '대중교통']) && includesAny(text, ['탈까', '갈까', '나아', '좋아', '추천', '급해', '늦었']);
  if (asksTransportChoice && !hasDestinationHint(text)) return 'mobility-choice';

  if (isShortQuestion(text)) return 'clarify';
  if (includesAny(text, ['사용법', '어떻게써', '어떻게사용', '기능', '사이트', '서비스', '페이지', '홈화면', '설명'])) return 'site';
  if (includesAny(text, ['배지', '퀘스트', '펫', '캐릭터', '경험치', '진화', '도감'])) return 'badge';
  if (includesAny(text, ['설정', '주소', '출근시간', '퇴근시간', '근무', '알림'])) return 'settings';
  if (includesAny(text, ['경로', '지도', '대중교통', '도보', '버스', '택시', '지하철', '환승', '거리', '길'])) return 'route';
  if (includesAny(text, ['출발', '몇시', '언제', '지각', '늦어', '도착예상', '도착'])) return 'departure';
  if (includesAny(text, ['요약', '통계', '최근', '평균', '기록', '이번달', '이번 달'])) return 'summary';
  return 'other';
}

function evidence(label: string, values: string[] = []): AiEvidence[] {
  return [{ label, kind: 'record', checkedAt: new Date().toISOString(), values, source: '내 브라우저의 출퇴근 기록과 앱 설정' }];
}

export default function AssistantPanel({ user, records }: { user: User; records: CommuteRecord[] }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const schedule = useStore((state) => state.workSchedule);
  const setSchedule = useStore((state) => state.setWorkSchedule);

  useEffect(() => { setSchedule(loadWorkSchedule(user.id)); }, [setSchedule, user.id]);

  const stats = useMemo(() => computePeriodStats(records, 'month', new Date(), schedule), [records, schedule]);

  function basicAnswer(intent: Intent): AssistantAnswer {
    const average = stats.avgCommuteDuration;
    const todaySchedule = getWorkdaySchedule(schedule, new Date());
    const completedCommutes = stats.commuteArrivals.length;
    const lateRate = stats.lateRate;

    if (intent === 'security') return {
      text: '그 내용은 보안상 도와줄 수 없어요.',
      details: ['비밀번호, API 키, 토큰, 세션, 데이터베이스 접속 정보, 권한 우회 방법은 안내하지 않습니다.', '대신 계정 보호, 비밀번호 변경, 권한 설정 점검처럼 안전한 방향은 도와드릴 수 있어요.', '출퇴근 기록이나 사이트 사용법 관련 질문으로 바꿔 물어봐 주세요.'],
      evidence: evidence('보안 질문 차단', ['민감 정보 요청 감지']),
      sources: ['앱 보안 정책'],
      cautions: ['민감 정보는 채팅창에 입력하지 마세요.'],
    };

    if (intent === 'mobility-choice') return {
      text: '일정이 급하면 먼저 목적지를 알아야 정확히 골라줄 수 있어요. 어디까지 가시는데요?',
      details: ['목적지와 언제까지 도착해야 하는지 알려주면 버스, 택시, 도보 중 현실적인 선택을 비교해 드릴게요.', '예: “서울역까지 30분 안에 가야 해”처럼 말해 주세요.', '비용이 중요하면 “돈 아끼고 싶어”, 시간이 중요하면 “가장 빨리”라고 같이 알려주세요.'],
      evidence: evidence('이동수단 선택에 필요한 정보', ['목적지', '도착 제한 시간', '비용 우선순위']),
      sources: ['사용자 질문', '지도 경로 기능'],
      cautions: ['실시간 교통 상황은 지도에서 경로를 계산한 뒤 확인하는 게 가장 정확합니다.'],
    };

    if (intent === 'clarify') return {
      text: '뭐가 문제인지 조금만 더 알려줄래요? 어느 것을 알려줄까요?',
      details: ['출발 시간 추천이 필요한지 알려주세요.', '지도 경로나 현재 위치 문제가 궁금한지 알려주세요.', '기록 통계, 배지, 펫, 설정 사용법 중 무엇인지 말해 주세요.'],
      evidence: evidence('질문 범위 확인', ['질문이 너무 짧아 추가 설명 필요']),
      sources: ['사용자 질문'],
    };

    if (intent === 'site') return {
      text: '이 서비스는 출근·퇴근 기록을 남기고, 지도 경로와 통계, 배지, 펫 성장을 함께 관리하는 출퇴근 도우미예요.',
      details: ['홈에서는 출근하기와 퇴근하기를 기록합니다.', '지도에서는 현재 위치 또는 저장한 주소 기준으로 도보와 대중교통 경로를 봅니다.', '통계와 캘린더에서는 이번 달 기록, 지각, 휴가, 병가, 이동 시간을 확인합니다.', '배지와 퀘스트에서는 기록을 쌓아 보상을 얻고 펫을 성장시킵니다.'],
      evidence: evidence('서비스 화면 구성', ['홈', '지도', '통계', '배지와 퀘스트', '설정', '앱 설치', '간단한 사용법']),
      sources: ['앱 내부 페이지 구성', '저장된 출퇴근 기록'],
      cautions: ['실시간 교통 상황은 지도 경로가 계산된 시점 기준으로만 참고해 주세요.'],
    };

    if (intent === 'route') return {
      text: '지도 페이지에서 도보와 대중교통을 바꿔 보면서 출발지와 도착지 기준 경로를 확인할 수 있어요.',
      details: ['현재 위치에서 출발하거나 저장한 주소에서 출발할 수 있습니다.', '대중교통은 버스·지하철·기차 구간과 도보 연결 구간을 나눠 보여줍니다.', '도보는 걸어서 이동하는 예상 시간과 거리를 보여줍니다.', '택시는 앱 안에서 직접 호출하지는 않지만, 급한 일정이면 택시와 대중교통 비교 기준을 알려드릴 수 있어요.'],
      evidence: evidence('경로 안내 기능', ['도보', '대중교통', '현재 위치', '저장한 주소']),
      sources: ['지도 페이지', '경로 계산 결과'],
      cautions: ['위치 권한이 꺼져 있으면 저장한 주소 기준으로 안내될 수 있습니다.'],
    };

    if (intent === 'departure') return {
      text: average === null ? `아직 완료된 출근 이동 기록이 부족해요. 기본 출근 시간 ${todaySchedule.startTime}을 기준으로 여유 있게 출발해 보세요.` : `근무 시작 ${todaySchedule.startTime} 기준으로, 평균 이동 시간 ${average}분에 여유 시간을 더해 출발하는 게 좋아요.`,
      details: average === null ? ['출근과 도착 기록이 쌓이면 평균 이동 시간을 계산해 더 정확히 말해줄게요.', '처음에는 지도 페이지의 도착 예상 시간을 기준으로 판단해 주세요.'] : [`이번 달 완료된 출근 기록은 ${completedCommutes}건입니다.`, lateRate === null ? '지각률은 아직 계산할 기록이 부족합니다.' : `현재 계산된 지각률은 ${lateRate}%입니다.`, '비나 교통 상황이 나쁘면 평소보다 10분 정도 먼저 출발하는 편이 안전합니다.'],
      evidence: evidence('출발 추천 기준', [`근무 시작 ${todaySchedule.startTime}`, average === null ? '평균 이동 시간 없음' : `평균 이동 ${average}분`]),
      sources: ['근무 시간 설정', '이번 달 출퇴근 기록'],
      cautions: ['실제 교통 상황과 날씨에 따라 도착 시간은 달라질 수 있습니다.'],
    };

    if (intent === 'summary') return {
      text: completedCommutes ? `이번 달 완료된 출근 기록은 ${completedCommutes}건이에요.` : '이번 달에는 아직 완료된 출근 기록이 부족해요.',
      details: [average === null ? '평균 이동 시간은 기록이 더 쌓이면 계산됩니다.' : `평균 출근 이동 시간은 ${average}분입니다.`, lateRate === null ? '지각률은 아직 계산할 수 없습니다.' : `근무 시작 시간을 기준으로 한 지각률은 ${lateRate}%입니다.`, `분석에 사용된 출퇴근 기록은 총 ${records.length}건입니다.`],
      evidence: evidence('최근 출퇴근 통계', [`완료 출근 ${completedCommutes}건`, average === null ? '평균 없음' : `평균 ${average}분`]),
      sources: ['이번 달 출퇴근 기록', '근무 시간 설정'],
    };

    if (intent === 'badge') return {
      text: '배지와 펫은 실제 출퇴근 기록, 연속 출근, 퀘스트 달성으로 성장해요.',
      details: ['출근과 퇴근을 꾸준히 완료하면 퀘스트 진행도가 올라갑니다.', '배지를 얻으면 펫 액세서리와 성장 보상이 열립니다.', '휴가·병가는 연속 기록을 보호하고, 결근은 기록 흐름에 영향을 줄 수 있습니다.'],
      evidence: evidence('게임 보상 기능', ['배지', '퀘스트', '펫 경험치', '액세서리']),
      sources: ['배지와 퀘스트 페이지', '펫 성장 기록'],
    };

    if (intent === 'settings') return {
      text: '설정에서 집 주소, 회사 주소, 출근·퇴근 시간, 근무 요일, 알림, 경로 선호를 바꿀 수 있어요.',
      details: ['출근 시간과 퇴근 시간을 바꾸면 홈 화면과 통계의 기준도 같이 바뀝니다.', '주소를 바꾸면 지도 경로의 저장한 주소 기준도 함께 바뀝니다.', '알림과 펫 조용히 모드도 설정에서 관리할 수 있습니다.'],
      evidence: evidence('설정 항목', ['주소', '근무 시간', '근무 요일', '알림', '경로 선호']),
      sources: ['설정 페이지'],
    };

    return {
      text: '출근 시간, 이동 경로, 기록 통계, 사이트 사용법 중 궁금한 걸 물어보면 바로 도와줄게요.',
      details: ['예: “오늘 몇 시에 출발하면 좋아?”', '예: “버스랑 택시 중 뭐가 나아?”', '예: “지도에서 대중교통 경로는 어떻게 봐?”'],
      evidence: evidence('비서가 답할 수 있는 범위', ['출퇴근 기록', '지도 경로', '통계', '설정', '배지와 펫']),
      sources: ['앱 내부 기능', '저장된 기록'],
    };
  }

  async function ask(raw: string) {
    const question = normalize(raw).trim();
    if (!question || busy) return;
    const intent = classify(question);
    const base = basicAnswer(intent);
    const id = nextId.current++;
    setBusy(true);
    try {
      if (intent === 'security' || intent === 'clarify' || intent === 'mobility-choice') {
        setTurns((items) => [...items, { id, question, answer: base, intent, failed: false }]);
        return;
      }
      const aiQuestion = `${question}\n\n답변 범위: 출퇴근 생존일지 사이트 사용법, 출퇴근 기록, 출발 시간, 지도 경로, 이동수단 선택, 통계, 배지, 펫, 설정 안에서만 답하세요. 보안 정보나 민감 정보는 답하지 마세요. 목적지·도착 시간·우선순위가 부족하면 결론을 지어내지 말고 필요한 정보를 자연스럽게 되물어보세요.`;
      const history = turns.slice(-AI_ASSISTANT_HISTORY_LIMIT).map((turn) => ({ question: turn.question, answer: turn.answer.text }));
      const result = await requestAssistant({ question: aiQuestion, context: { averageMinutes: stats.avgCommuteDuration, variabilityMinutes: stats.weekly.variabilityMinutes, lateRate: stats.lateRate }, ...(history.length ? { history } : {}) }).enhancement;
      const failed = result.fallback === true;
      const answer = failed ? base : {
        text: result.conclusion || result.text || base.text,
        details: result.details?.length ? result.details.slice(0, 6) : base.details,
        evidence: result.evidence?.length ? result.evidence : base.evidence,
        sources: result.sources?.length ? result.sources : base.sources,
        cautions: result.cautions?.length ? result.cautions : base.cautions,
      };
      setTurns((items) => [...items, { id, question, answer, intent, failed }]);
    } catch {
      setTurns((items) => [...items, { id, question, answer: base, intent, failed: true }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    void ask(question);
  }

  function startNew() {
    setTurns([]);
    setInput('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const suggestions = turns.length ? ['조금 더 쉽게 설명해 줘', '목적지는 회사야', '가장 빠른 방법으로 알려줘'] : STARTERS;

  return <div className="min-w-0 space-y-4">
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <StatusIcon icon={Bot} tone="blue" size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-950">출퇴근 비서</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">사이트 사용법, 출퇴근 기록, 지도 경로, 이동수단 선택까지 쉽게 답해요.</p>
        </div>
        {turns.length > 0 && <button type="button" onClick={startNew} disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"><Plus size={15} />새 질문</button>}
      </div>
    </section>

    {turns.length > 0 && <div className="space-y-4" aria-live="polite">{turns.map((turn) => <div key={turn.id} className="space-y-2">
      <div className="ml-auto flex max-w-[92%] items-start justify-end gap-2 sm:max-w-[85%]">
        <div className="rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-sm leading-6 text-white">{turn.question}</div>
        <UserRound size={18} className="mt-3 shrink-0 text-slate-400" />
      </div>
      <section className="card mr-auto max-w-[96%] p-4 sm:max-w-[90%] sm:p-5">
        <div className="flex items-start gap-2">
          <Bot size={18} className="mt-0.5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-6 text-slate-900">{turn.answer.text}</p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">{turn.answer.details.map((detail, index) => <li key={`${index}-${detail}`} className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-600" />{detail}</li>)}</ul>
            {(turn.intent === 'route' || turn.intent === 'mobility-choice') && <Link href="/map" className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Navigation size={14} />지도에서 경로 보기</Link>}
            {turn.failed && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p>AI 응답 대신 저장된 기록과 앱 정보로 기본 안내를 보여드렸어요.</p><button type="button" onClick={() => void ask(turn.question)} disabled={busy} className="mt-1 inline-flex min-h-9 items-center gap-1 font-bold disabled:opacity-50"><RefreshCcw size={14} />다시 질문</button></div>}
            <AiEvidencePanel evidence={turn.answer.evidence ?? evidence('저장된 출퇴근 기록과 앱 설정')} sources={turn.answer.sources ?? ['저장된 출퇴근 기록']} cautions={turn.answer.cautions ?? ['실제 교통 상황과 날씨에 따라 결과가 달라질 수 있습니다.']} />
          </div>
        </div>
      </section>
    </div>)}</div>}

    {busy && <div role="status" className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800"><LoaderCircle size={16} className="animate-spin" />기록과 앱 정보를 확인하고 있어요.</div>}

    <div>
      <p className="mb-2 px-1 text-xs font-bold text-slate-600">{turns.length ? '이어 물어보세요' : '추천 질문'}</p>
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">{suggestions.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={busy} className="min-h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50">{item}</button>)}</div>
    </div>

    <form onSubmit={submit} className="card sticky bottom-3 z-10 p-3 shadow-lg shadow-slate-200/60">
      <div className="flex min-w-0 gap-2">
        <label className="sr-only" htmlFor="assistant-question">질문</label>
        <input ref={inputRef} id="assistant-question" value={input} maxLength={MAX_QUESTION_LENGTH} autoComplete="off" spellCheck={false} onChange={(event) => setInput(normalize(event.target.value))} placeholder={turns.length ? '이어서 궁금한 점을 물어보세요' : '출퇴근이나 이동수단을 물어보세요'} className="min-w-0 flex-1 rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
        <button type="submit" disabled={busy || !input.trim()} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" aria-label="질문 보내기">{busy ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}</button>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 px-1 text-[11px] text-slate-500">
        <p>{turns.length ? '답변 뒤에도 계속 질문할 수 있어요.' : '정확한 주소, 연락처, 계정 정보는 입력하지 마세요.'}</p>
        <span className="shrink-0 tabular-nums" aria-label={`입력 글자 수 ${input.length}/${MAX_QUESTION_LENGTH}`}>{input.length}/{MAX_QUESTION_LENGTH}</span>
      </div>
    </form>
  </div>;
}
