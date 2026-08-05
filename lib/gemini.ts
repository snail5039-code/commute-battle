import { GoogleGenerativeAI } from '@google/generative-ai';
import { RouteGuideResponse } from './types';
import { PetTriggerKey } from './petTriggers';
import { formatMinutesOfDay, getStatsFallbackComment, MonthlyStats } from './stats';
import { IDLE_CHAT_FALLBACK, TimeSegment, TIME_SEGMENT_LABELS } from './petMessages';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '');
const MODEL = 'gemini-3.5-flash';

interface RouteGuideInput {
  home_address: string;
  work_address: string;
  commute_type: 'commute' | 'return';
  weather: { precipitation_mm_h: number; probability: number; condition: string };
  recent_avg_departure_time?: string;
  recent_avg_arrival_time?: string;
}

function model() {
  return genAI.getGenerativeModel({ model: MODEL });
}

function pickFallback(pool: string[]) {
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function generateRouteGuide(input: RouteGuideInput): Promise<RouteGuideResponse> {
  try {
    const prompt = `직장인의 이동을 돕는 경로 안내 AI다. 다음 정보를 바탕으로 JSON만 출력하라.
- 출발지: ${input.home_address}
- 목적지: ${input.work_address}
- 이동: ${input.commute_type === 'commute' ? '출근' : '퇴근'}
- 날씨: ${input.weather.condition}, 강수 ${input.weather.precipitation_mm_h}mm/h, 확률 ${input.weather.probability}%
- 평소 출발: ${input.recent_avg_departure_time ?? '08:00'}
형식: {"route":"간단한 경로","recommended_departure":"추천 시각","difficulty":"peaceful|caution|alert|danger","message":"짧은 안내"}`;
    const text = (await model().generateContent(prompt)).response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON not found in response');
    const parsed = JSON.parse(match[0]);
    return {
      route: parsed.route || '경로를 직접 확인해 주세요.',
      recommended_departure: parsed.recommended_departure || '여유 있게 출발해 주세요.',
      difficulty: parsed.difficulty || 'peaceful',
      message: parsed.message || '안전한 이동이 가장 중요해요.',
    };
  } catch (error) {
    console.error('Gemini API Error:', error);
    return {
      route: '경로를 직접 확인해 주세요.',
      recommended_departure: '여유 있게 출발해 주세요.',
      difficulty: 'peaceful',
      message: '오늘도 안전하게 이동하세요.',
    };
  }
}

const PET_CONTEXT: Record<PetTriggerKey, string> = {
  praise_commute: '사용자가 오늘 제시간에 출근했다. 진심으로 칭찬한다.',
  praise_return: '사용자가 오늘 퇴근을 완료했다. 수고를 인정한다.',
  commute_late_1: '출근이 조금 늦어지고 있다. 가볍게 재촉한다.',
  commute_late_2: '출근이 많이 늦어지고 있다. 걱정하며 분명하게 재촉한다.',
  commute_late_3: '출근이 심하게 늦어지고 있다. 단호하지만 다정하게 출발을 권한다.',
  return_late_1: '평소보다 퇴근이 늦다. 무리하지 않는지 걱정한다.',
  return_late_2: '퇴근이 매우 늦다. 일을 멈추고 쉬라고 권한다.',
  evening_checkin: '오늘 퇴근을 완료했다. 하루를 마무리하며 격려한다.',
};

const PET_FALLBACK: Record<PetTriggerKey, string[]> = {
  praise_commute: ['정시 출근 멋져! 오늘 흐름이 좋아.', '오늘도 제시간에 도착했네!'],
  praise_return: ['퇴근 완료! 오늘도 수고했어.', '이제 편하게 쉬자!'],
  commute_late_1: ['조금 서두르면 괜찮아!', '이제 출발할 시간이야.'],
  commute_late_2: ['지금은 바로 출발해야겠어!', '준비를 마치고 얼른 나가자.'],
  commute_late_3: ['걱정돼. 지금 바로 출발하자!', '더 늦기 전에 꼭 출발해!'],
  return_late_1: ['아직 회사야? 너무 무리하지 마.', '오늘은 조금 늦네. 괜찮아?'],
  return_late_2: ['이제 일을 멈추고 집에 가자.', '충분히 했어. 오늘은 꼭 쉬어.'],
  evening_checkin: ['오늘 하루도 정말 수고했어.', '잘 마무리했네. 푹 쉬자!'],
};

async function generateShortCharacterMessage(prompt: string, fallback: string[]) {
  try {
    const text = (await model().generateContent(`${prompt}\n반말 한 문장, 20자 안팎으로 문장만 출력하라.`)).response.text().trim().replace(/^["']|["']$/g, '');
    return text || pickFallback(fallback);
  } catch (error) {
    console.error('Gemini Character Message Error:', error);
    return pickFallback(fallback);
  }
}

export function generatePetMessage(trigger: PetTriggerKey, characterStage: string) {
  return generateShortCharacterMessage(
    `너는 함께 성장하는 작은 캐릭터다. 성장 단계는 ${characterStage}. ${PET_CONTEXT[trigger]}`,
    PET_FALLBACK[trigger]
  );
}

export function generateIdleChat(segment: TimeSegment, characterStage: string) {
  return generateShortCharacterMessage(
    `너는 성장 단계 ${characterStage}인 작은 캐릭터다. 지금은 ${TIME_SEGMENT_LABELS[segment]}이며 가벼운 일상 이야기를 한다.`,
    IDLE_CHAT_FALLBACK[segment]
  );
}

export function generatePlayMessage(characterStage: string) {
  return generateShortCharacterMessage(
    `너는 성장 단계 ${characterStage}인 작은 캐릭터다. 사용자가 놀아 줘서 신나게 반응한다.`,
    ['좋아, 더 놀자!', '신난다! 또 해 줘!']
  );
}

export function generatePokeMessage(characterStage: string) {
  return generateShortCharacterMessage(
    `너는 성장 단계 ${characterStage}인 작은 캐릭터다. 사용자가 콕 찔러서 귀엽고 매번 다른 반응을 한다.`,
    ['왜 불렀어?', '나 여기 있어!', '간지러워!']
  );
}

export async function generateStatsComment(stats: MonthlyStats, monthLabel: string) {
  try {
    const prompt = `출퇴근 기록 코치로서 ${monthLabel} 데이터를 설명하라.
- 출근 완료: ${stats.commuteArrivals.length}건
- 평가 가능한 출근: ${stats.evaluatedCommutes}건
- 업무 시작 기준: ${formatMinutesOfDay(stats.workStartMinutes)}
- 지각: ${stats.lateCount}건, ${stats.lateRate ?? '계산 불가'}%
- 평균 지각: ${stats.avgLateMinutes ?? '해당 없음'}분
- 평균 출근 이동: ${stats.avgCommuteDuration ?? '계산 불가'}분
- 미완료 출근: ${stats.incompleteCommutes}건
- 잘못된 도착 시각: ${stats.invalidArrivalTimes}건
- 이상 이동시간 제외: ${stats.excludedDurationCount}건
is_on_time 값은 사용하지 않았고 실제 도착 시각만으로 계산했다. 숫자를 반복 나열하지 말고, 가장 의미 있는 관찰 하나와 구체적인 다음 행동 하나를 자연스러운 한국어 두 문장으로 작성하라. 불완전 데이터가 있으면 단정하지 말라. 문장만 출력하라.`;
    const text = (await model().generateContent(prompt)).response.text().trim();
    return text || getStatsFallbackComment(stats);
  } catch (error) {
    console.error('Gemini Stats Comment Error:', error);
    return getStatsFallbackComment(stats);
  }
}

export async function generateDifficultyMessage(weather: {
  precipitation_mm_h: number;
  probability: number;
  condition: string;
}): Promise<string> {
  if (weather.precipitation_mm_h >= 10) return 'danger';
  if (weather.precipitation_mm_h >= 3) return 'alert';
  if (weather.probability >= 30) return 'caution';
  return 'peaceful';
}
