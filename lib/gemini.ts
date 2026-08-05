import { GoogleGenerativeAI } from '@google/generative-ai';
import { RouteGuideResponse } from './types';
import { PetTriggerKey } from './petTriggers';
import { getStatsFallbackComment, MonthlyStats } from './stats';
import { TimeSegment, TIME_SEGMENT_LABELS, IDLE_CHAT_FALLBACK } from './petMessages';

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

interface RouteGuideInput {
  home_address: string;
  work_address: string;
  commute_type: 'commute' | 'return';
  weather: {
    precipitation_mm_h: number;
    probability: number;
    condition: string;
  };
  recent_avg_departure_time?: string;
  recent_avg_arrival_time?: string;
}

export async function generateRouteGuide(
  input: RouteGuideInput
): Promise<RouteGuideResponse> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `너는 직장인의 출퇴근을 도와주는 경로 안내 AI야.

[상황]
- 출발지: ${input.home_address}
- 도착지: ${input.work_address}
- 이동 종류: ${input.commute_type === 'commute' ? '출근' : '퇴근'}
- 오늘 날씨: ${input.weather.condition} (강수량 ${input.weather.precipitation_mm_h}mm/h, 강수 확률 ${input.weather.probability}%)
- 평소 출발시간: ${input.recent_avg_departure_time || '08:00'}

[응답 형식]
다음 JSON 형식으로 응답해줘:
{
  "route": "지하철 41분 · 도보 5분 형식",
  "recommended_departure": "평소보다 10분 빨리 07:55 출발",
  "difficulty": "peaceful/caution/alert/danger 중 하나",
  "message": "게임 톤의 배경 문구 1~2줄"
}

난이도 선택 기준:
- peaceful: 맑음/흐림 강수확률 <30%
- caution: 강수확률 30~60% or 약한비 (1~2mm/h)
- alert: 강수량 3~9mm/h
- danger: 강수량 10mm/h↑

메시지 예시:
- peaceful: "무풍지대입니다", "평화로운 출근길이네요"
- caution: "우산을 챙기세요", "습도 주의보 발효"
- alert: "제14차 도시 진입 작전 — 도보 구간 난이도 상승"
- danger: "생존 모드 진입", "이것은 실전입니다"`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSON 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON not found in response');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      route: parsed.route || '경로를 조회할 수 없습니다',
      recommended_departure:
        parsed.recommended_departure || '직접 확인해주세요',
      difficulty: parsed.difficulty || 'peaceful',
      message: parsed.message || '오늘도 화이팅!',
    };
  } catch (error) {
    console.error('Gemini API Error:', error);

    // 폴백
    return {
      route: '경로를 직접 확인해주세요',
      recommended_departure: '편한 시간에 출발하세요',
      difficulty: 'peaceful',
      message: '오늘도 무사히 귀가하길 바랍니다',
    };
  }
}

const PET_TRIGGER_INSTRUCTIONS: Record<PetTriggerKey, string> = {
  praise_commute:
    '사용자가 오늘 정시에 출근을 완료했다. 진심으로 칭찬하고 뿌듯해하는 멘트를 만들어라.',
  praise_return:
    '사용자가 오늘 칼퇴(정시 퇴근)에 성공했다. 신나서 칭찬하는 멘트를 만들어라.',
  commute_late_1:
    '사용자가 평소보다 출근이 살짝 늦어지고 있다 (경고 1단계). 장난스럽게 재촉하는 가벼운 멘트를 만들어라.',
  commute_late_2:
    '사용자가 출근이 꽤 많이 늦어지고 있다 (경고 2단계, 1단계보다 심각). 짜증이 섞인, 더 다급하게 채근하는 멘트를 만들어라.',
  commute_late_3:
    '사용자가 출근을 심각하게 안 하고 있다 (경고 3단계, 최고 수준). 화가 난 듯 강하게 다그치는 멘트를 만들어라. 그래도 걱정하는 마음은 담아라.',
  return_late_1:
    '사용자가 평소보다 퇴근이 늦어지고 있다. 야근 중인 것 같다. 놀리듯 걱정하는 멘트를 만들어라.',
  return_late_2:
    '사용자가 매우 오랫동안 퇴근을 안 하고 있다 (야근이 심각하게 길어짐). 진심으로 걱정하며 이제 그만 퇴근하라고 강하게 말하는 멘트를 만들어라.',
  evening_checkin:
    '사용자가 오늘 퇴근을 완료했다. 하루를 마무리하며 고생했다고 격려하는 멘트를 만들어라.',
};

const PET_FALLBACK_MESSAGES: Record<PetTriggerKey, string[]> = {
  praise_commute: [
    '오, 정시 출근! 역시 내 주인이야',
    '오늘도 지각 안 했네, 칭찬해!',
  ],
  praise_return: ['칼퇴 성공! 잘했어', '오늘은 제때 퇴근했네, 대단해'],
  commute_late_1: [
    '야, 너 출근 안 하냐?',
    '나 혼자 성장 못 하잖아, 빨리 나와',
  ],
  commute_late_2: [
    '이러다 지각이다, 진짜 빨리 나와',
    '오늘 늦잠 잤구나, 얼른 준비해',
  ],
  commute_late_3: [
    '너 진짜 출근 안 할 거야?!',
    '이건 심각하다, 지금 당장 나와야 해',
  ],
  return_late_1: ['아직도 회사냐?', '칼퇴 수호자 배지는 물 건너갔네'],
  return_late_2: [
    '너무 오래 있는다, 이제 그만 퇴근해',
    '야근 중이야? 너무 무리하지 마',
  ],
  evening_checkin: [
    '오늘 하루 어땠냐?',
    '고생했다, 내일 또 보자',
    '오늘도 무사히 귀환했네, 잘했어',
  ],
};

export async function generatePetMessage(
  trigger: PetTriggerKey,
  characterStage: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `너는 사용자를 매일 지켜보며 함께 성장하는 작은 캐릭터야 (현재 진화 단계: ${characterStage}).
사용자가 출퇴근을 게임처럼 관리하는 서비스에 살고 있다.

[상황]
${PET_TRIGGER_INSTRUCTIONS[trigger]}

[규칙]
- 반말로, 짧게 한 문장만 (20자 이내)
- 질책이 아니라 애정 있는 잔소리 톤
- 문장만 출력하고 다른 설명은 붙이지 마라`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');

    return text || pickFallback(PET_FALLBACK_MESSAGES[trigger]);
  } catch (error) {
    console.error('Gemini Pet Message Error:', error);
    return pickFallback(PET_FALLBACK_MESSAGES[trigger]);
  }
}

function pickFallback(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function generateIdleChat(
  segment: TimeSegment,
  characterStage: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `너는 사용자와 함께 지내는 작은 캐릭터야 (현재 진화 단계: ${characterStage}).
지금은 ${TIME_SEGMENT_LABELS[segment]} 시간대야.

[규칙]
- 출퇴근과 상관없는 가벼운 잡담을 반말로 한 문장만 해라 (20자 이내)
- 지금 시간대(${TIME_SEGMENT_LABELS[segment]})에 어울리는 내용으로
- 문장만 출력하고 다른 설명은 붙이지 마라`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');

    return text || pickFallback(IDLE_CHAT_FALLBACK[segment]);
  } catch (error) {
    console.error('Gemini Idle Chat Error:', error);
    return pickFallback(IDLE_CHAT_FALLBACK[segment]);
  }
}

const PLAY_FALLBACK = ['꺄, 신난다!', '더 놀아줘!', '히히, 재밌다'];
const POKE_FALLBACK = ['왜 불러?', '나 여기 있어', '심심했어?'];

export async function generatePlayMessage(
  characterStage: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `너는 사용자와 함께 지내는 작은 캐릭터야 (현재 진화 단계: ${characterStage}).
사용자가 방금 너를 쓰다듬거나 놀아줬다. 신나고 즐거운 반응 멘트를 반말로 한 문장만 해라 (15자 이내).
문장만 출력하고 다른 설명은 붙이지 마라.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');

    return text || pickFallback(PLAY_FALLBACK);
  } catch (error) {
    console.error('Gemini Play Message Error:', error);
    return pickFallback(PLAY_FALLBACK);
  }
}

export async function generatePokeMessage(
  characterStage: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `너는 사용자와 함께 지내는 작은 캐릭터야 (현재 진화 단계: ${characterStage}).
사용자가 방금 너를 눌렀다(클릭했다). 매번 다른, 짧고 귀여운 반응 멘트를 반말로 한 문장만 해라 (15자 이내).
가벼운 감정 표현, 질문, 투정, 관찰 등 다양한 종류로 매번 다르게 반응해라.
문장만 출력하고 다른 설명은 붙이지 마라.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^["']|["']$/g, '');

    return text || pickFallback(POKE_FALLBACK);
  } catch (error) {
    console.error('Gemini Poke Message Error:', error);
    return pickFallback(POKE_FALLBACK);
  }
}

export async function generateStatsComment(
  stats: MonthlyStats,
  monthLabel: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `너는 사용자의 출퇴근 데이터를 분석해서 짧은 코멘트를 주는 AI야.

[${monthLabel} 데이터]
- 출근 완료: ${stats.commuteArrivals.length}회
- 퇴근 완료: ${stats.returnArrivals.length}회
- 출근과 퇴근을 모두 완료한 날: ${stats.roundTripDays}일
- 기록한 날: ${stats.activeDays}일
- 평균 출근 소요 시간: ${stats.avgCommuteDuration === null ? '데이터 없음' : `${stats.avgCommuteDuration}분`}
- 평균 퇴근 소요 시간: ${stats.avgReturnDuration === null ? '데이터 없음' : `${stats.avgReturnDuration}분`}
- 주의 이상 날씨에서 완료한 이동: ${stats.challengingWeatherTrips}회
- 조퇴: ${stats.earlyLeaves.length}회
- 휴가: ${stats.vacations.length}일, 병가: ${stats.sickDays.length}일
- 결근: ${stats.absences.length}회

[규칙]
- 매번 표현과 관점을 바꾸되, 위 데이터에서 실제로 확인되는 패턴 하나만 짚어 2문장 이내로 코멘트해라
- 질책하지 말고 관찰+격려 톤으로 ("~하시네요", "~군요" 같은 부드러운 존댓말)
- 정시·지각 여부는 데이터에 없으므로 절대 추측하거나 언급하지 마라
- 0인 수치를 성취나 문제로 과장하지 말고, 데이터가 부족하면 어떤 기록이 쌓이고 있는지만 말해라
- 문장만 출력하고 다른 설명은 붙이지 마라`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return text || getStatsFallbackComment(stats);
  } catch (error) {
    console.error('Gemini Stats Comment Error:', error);
    return getStatsFallbackComment(stats);
  }
}

export async function generateDifficultyMessage(
  weather: { precipitation_mm_h: number; probability: number; condition: string }
): Promise<string> {
  if (weather.precipitation_mm_h >= 10) return 'danger';
  if (weather.precipitation_mm_h >= 3) return 'alert';
  if (weather.probability >= 30) return 'caution';
  return 'peaceful';
}
