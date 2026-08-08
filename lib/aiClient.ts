import type { PetTriggerKey } from './petTriggers';
import { IDLE_CHAT_FALLBACK, pickPetLine, type TimeSegment } from './petMessages';
import { getStatsFallbackComment, type MonthlyStats } from './stats';
import type { CommuteRecord, RouteGuideResponse } from './types';
import type { AiRequest, AiResultMap, AssistantAnswer, AssistantInput, Enhancement, RouteComment, RouteCommentInput, RouteGuideInput } from './aiTypes';
import { compactRouteSegments, redactAssistantInput, safeRouteGuideInput } from './aiPayload';

export type { RouteComment, RouteCommentInput, RouteCommentSegment, RouteGuideInput } from './aiTypes';

const PET_FALLBACK: Record<PetTriggerKey, string> = {
  praise_commute: '정시 출근 멋져! 오늘 흐름이 좋아.', praise_return: '퇴근 완료! 오늘도 수고했어.',
  commute_late_1: '조금 서두르면 괜찮아.', commute_late_2: '준비를 마치고 바로 출발하자!',
  commute_late_3: '걱정돼. 지금 바로 출발하자!', return_late_1: '오늘은 조금 늦었네. 괜찮아?',
  return_late_2: '이제 일을 멈추고 집에 가자.', evening_checkin: '오늘 하루도 정말 수고했어.',
};

function routeFallback(input: RouteCommentInput): RouteComment {
  const transit = input.segments.filter((item) => item.trafficType !== 3);
  const walks = input.segments.filter((item) => item.trafficType === 3);
  const transfers = Math.max(0, transit.length - 1);
  const longestWalk = walks.reduce((max, item) => Math.max(max, item.distance), 0);
  const names = transit.map((item) => item.laneName || item.label).filter(Boolean).slice(0, 3);
  return {
    summary: transit.length
      ? `${names.join(' → ')} 순서로 약 ${Math.round(input.totalTime)}분 이동하며, 도보는 총 ${Math.round(input.totalWalk)}m입니다.`
      : `약 ${Math.round(input.totalDistance)}m를 ${Math.round(input.totalTime)}분 동안 걷는 경로입니다.`,
    caution: longestWalk >= 600 ? `최장 도보 구간이 약 ${Math.round(longestWalk)}m이니 편한 신발과 날씨를 확인하세요.` : transfers ? `환승이 ${transfers}회 있으니 내리기 전에 다음 승차 위치를 확인하세요.` : '별도 혼잡 정보가 없으므로 현장 안내를 확인하세요.',
    actions: ['출발 전에 전체 소요 시간과 첫 승차 위치를 확인하세요.', transfers ? '환승 직전에 다음 노선과 승차 지점을 확인하세요.' : '이동 중 안전한 보행로를 이용하세요.'],
    source: 'route',
  };
}

function routeGuideFallback(input: RouteGuideInput): RouteGuideResponse {
  const rain = input.weather.precipitation_mm_h;
  return {
    route: `${input.commute_type === 'commute' ? input.home_address : input.work_address}에서 ${input.commute_type === 'commute' ? input.work_address : input.home_address}까지 경로를 확인하세요.`,
    recommended_departure: rain > 0 ? '비를 고려해 평소보다 10분 일찍 출발하세요.' : '평소 출발 시각에 맞춰 여유 있게 출발하세요.',
    difficulty: rain >= 10 ? 'danger' : rain >= 3 ? 'alert' : input.weather.probability >= 30 ? 'caution' : 'peaceful',
    message: rain > 0 ? '우산과 미끄러운 길을 조심하세요.' : '안전하게 이동하세요.',
  };
}

async function requestAi<K extends keyof AiResultMap>(request: Extract<AiRequest, { kind: K }>): Promise<AiResultMap[K]> {
  const response = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  if (!response.ok) throw new Error(`AI request failed (${response.status})`);
  const body = await response.json() as { data?: AiResultMap[K] };
  if (body.data === undefined) throw new Error('Invalid AI response');
  return body.data;
}

function withFallback<T>(fallback: T, request: Promise<T>): Enhancement<T> {
  return { fallback, enhancement: request.catch(() => fallback) };
}

export function requestRouteComment(input: RouteCommentInput): Enhancement<RouteComment> {
  const fallback = routeFallback(input);
  const safeInput = { segments: compactRouteSegments(input.segments), totalTime: input.totalTime, totalDistance: input.totalDistance, totalWalk: input.totalWalk, departureTime: input.departureTime.toISOString() };
  return withFallback(fallback, requestAi({ kind: 'route-comment', input: safeInput }));
}
export function generateRouteComment(input: RouteCommentInput) { return requestRouteComment(input).enhancement; }

export function requestRouteGuide(input: RouteGuideInput): Enhancement<RouteGuideResponse> {
  const fallback = routeGuideFallback(input);
  return withFallback(fallback, requestAi({ kind: 'route-guide', input: safeRouteGuideInput(input) }));
}
export function generateRouteGuide(input: RouteGuideInput) { return requestRouteGuide(input).enhancement; }

function characterRequest(input: Extract<AiRequest, { kind: 'character-message' }>['input'], fallback: string) {
  return withFallback(fallback, requestAi({ kind: 'character-message', input }));
}
const messageVariant = () => Math.floor(Math.random() * 24);
export function generatePetMessage(trigger: PetTriggerKey, characterStage: string) { return characterRequest({ mode: 'trigger', trigger, characterStage, variant: messageVariant() }, PET_FALLBACK[trigger]).enhancement; }
export function generateIdleChat(segment: TimeSegment, characterStage: string) { return characterRequest({ mode: 'idle', segment, characterStage, variant: messageVariant() }, pickPetLine(IDLE_CHAT_FALLBACK[segment])).enhancement; }
export function generateCoachMessage(records: CommuteRecord[], now: Date, characterStage: string, fallbackLines: string[]) {
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayCommuteDone = records.some((record) => record.date === localDate && record.type === 'commute' && Boolean(record.end_time));
  const todayReturnDone = records.some((record) => record.date === localDate && record.type === 'return' && Boolean(record.end_time));
  const recentCommutes = records.filter((record) => record.type === 'commute' && record.end_time).slice(0, 10);
  const durations = recentCommutes.map((record) => record.duration_minutes).filter((value): value is number => typeof value === 'number' && value > 0 && value < 1440);
  const averageMinutes = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  return characterRequest({
    mode: 'coach',
    characterStage,
    variant: messageVariant(),
    summary: {
      todayCommuteDone,
      todayReturnDone,
      recentCommutes: recentCommutes.length,
      onTimeCount: recentCommutes.filter((record) => record.is_on_time).length,
      lateCount: recentCommutes.filter((record) => !record.is_on_time).length,
      averageMinutes,
      currentHour: now.getHours(),
      hints: fallbackLines.slice(0, 4),
    },
  }, pickPetLine(fallbackLines)).enhancement;
}
export function generatePlayMessage(characterStage: string) { return characterRequest({ mode: 'play', characterStage, variant: messageVariant() }, pickPetLine(['좋아, 같이 놀자!', '기분 좋아졌어! 한 번 더!', '잠깐 쉬면서 나랑 놀자.', '헤헤, 네가 놀아주니까 신난다!'])).enhancement; }
export function generatePokeMessage(characterStage: string) { return characterRequest({ mode: 'poke', characterStage, variant: messageVariant() }, pickPetLine(['간지러워!', '왜 불렀어? 기록 확인해줄까?', '나 여기 있어!', '콕 찔렀지? 오늘도 같이 힘내자!', '응? 무슨 일이야?'])).enhancement; }

export function requestStatsComment(stats: MonthlyStats, monthLabel: string): Enhancement<string[]> {
  const fallback = getStatsFallbackComment(stats);
  const { evaluatedCommutes, workStartMinutes, lateCount, lateRate, avgLateMinutes, avgCommuteDuration } = stats;
  const summary = { commuteArrivals: stats.commuteArrivals.length, evaluatedCommutes, workStartMinutes, lateCount, lateRate, avgLateMinutes, avgCommuteDuration, excludedRecords: stats.quality.excludedRecords.length };
  return withFallback(fallback, requestAi({ kind: 'stats-comment', input: { monthLabel, stats: summary } }));
}
export function generateStatsComment(stats: MonthlyStats, monthLabel: string) { return requestStatsComment(stats, monthLabel).enhancement; }

export function requestAssistant(input: AssistantInput): Enhancement<AssistantAnswer> {
  const fallback: AssistantAnswer = { text: '답변 서비스가 잠시 원활하지 않아요.', details: ['저장된 기록을 바탕으로 한 기본 안내를 확인해 주세요.'], conclusion: '잠시 후 다시 시도해 주세요.', cautions: ['실제 교통과 날씨에 따라 결과가 달라질 수 있어요.'], fallback: true };
  return withFallback(fallback, requestAi({ kind: 'assistant', input: redactAssistantInput(input) }));
}

export async function generateDifficultyMessage(weather: RouteGuideInput['weather']): Promise<string> {
  return weather.precipitation_mm_h >= 10 ? 'danger' : weather.precipitation_mm_h >= 3 ? 'alert' : weather.probability >= 30 ? 'caution' : 'peaceful';
}
