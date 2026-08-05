import type { CommuteDirection, RoutePreference } from './routePreferences';

const HISTORY_KEY = 'commuteRouteLearning:v1';
const SETTINGS_KEY = 'commuteRouteLearningEnabled:v1';
const MAX_RECORDS = 200;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export type WeatherCondition = 'clear' | 'wet' | 'severe' | 'unknown';
export interface LearnableRoute { signature: string; totalTime: number; totalWalk: number; transferCount: number }
interface RouteChoice extends LearnableRoute { direction: CommuteDirection; weekday: number; timeBand: string; weather: WeatherCondition; selectedAt: number }
export interface RouteRecommendation { signature: string; reason: string; learned: boolean }

export function routeSignature(segments: Array<{ trafficType: number; laneName?: string | null; label?: string; startName?: string | null; endName?: string | null }>): string {
  const signature = segments.filter((item) => item.trafficType !== 3).map((item) => {
    const lane = item.laneName || item.label || '대중교통';
    return item.startName || item.endName ? `${lane}(${item.startName || '?'}–${item.endName || '?'})` : lane;
  }).join(' → ');
  return signature || '도보 경로';
}

function timeBand(date: Date) {
  const hour = date.getHours();
  return hour < 7 ? 'early' : hour < 10 ? 'morning' : hour < 16 ? 'day' : hour < 20 ? 'evening' : 'night';
}

function readHistory(now = Date.now()): RouteChoice[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as RouteChoice[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.selectedAt >= now - MAX_AGE_MS).slice(-MAX_RECORDS) : [];
  } catch { return []; }
}

export function isRouteLearningEnabled() {
  return typeof window === 'undefined' || localStorage.getItem(SETTINGS_KEY) !== 'false';
}

export function setRouteLearningEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') localStorage.setItem(SETTINGS_KEY, String(enabled));
}

export function clearRouteLearning() {
  if (typeof window !== 'undefined') localStorage.removeItem(HISTORY_KEY);
}

export function recordRouteChoice(direction: CommuteDirection, route: LearnableRoute, weather: WeatherCondition = 'unknown', date = new Date()) {
  if (typeof window === 'undefined' || !isRouteLearningEnabled()) return;
  const history = readHistory(date.getTime());
  history.push({ ...route, direction, weekday: date.getDay(), timeBand: timeBand(date), weather, selectedAt: date.getTime() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_RECORDS)));
}

export function recommendRoute(candidates: LearnableRoute[], direction: CommuteDirection, preference: RoutePreference, weather: WeatherCondition = 'unknown', date = new Date()): RouteRecommendation | null {
  if (!candidates.length) return null;
  const fallback = [...candidates].sort((a, b) => preference === 'least-walking' ? a.totalWalk - b.totalWalk : preference === 'fewest-transfers' ? a.transferCount - b.transferCount : a.totalTime - b.totalTime)[0];
  if (!isRouteLearningEnabled()) return { signature: fallback.signature, reason: '기본 경로 선호 기준', learned: false };
  const relevant = readHistory(date.getTime()).filter((item) => item.direction === direction);
  if (relevant.length < 3) return { signature: fallback.signature, reason: `학습 데이터가 적어 ${preference === 'fastest' ? '빠른' : preference === 'least-walking' ? '도보가 적은' : '환승이 적은'} 경로를 추천해요`, learned: false };
  const scores = new Map<string, { score: number; matches: number }>();
  relevant.forEach((item) => {
    if (!candidates.some((candidate) => candidate.signature === item.signature)) return;
    const ageDays = Math.max(0, (date.getTime() - item.selectedAt) / 86_400_000);
    let score = Math.exp(-ageDays / 30);
    if (item.weekday === date.getDay()) score *= 1.8;
    if (item.timeBand === timeBand(date)) score *= 1.7;
    if (weather !== 'unknown' && item.weather === weather) score *= 1.5;
    const current = scores.get(item.signature) || { score: 0, matches: 0 };
    scores.set(item.signature, { score: current.score + score, matches: current.matches + 1 });
  });
  const best = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  if (!best) return { signature: fallback.signature, reason: '비슷한 기록이 없어 기본 선호 기준을 적용했어요', learned: false };
  return { signature: best[0], reason: `이 요일·시간대${weather === 'unknown' ? '' : '·날씨'}에 최근 ${best[1].matches}번 선택한 경향`, learned: true };
}
