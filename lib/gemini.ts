import { GoogleGenerativeAI } from '@google/generative-ai';
import { RouteGuideResponse } from './types';

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

export async function generateDifficultyMessage(
  weather: { precipitation_mm_h: number; probability: number; condition: string }
): Promise<string> {
  if (weather.precipitation_mm_h >= 10) return 'danger';
  if (weather.precipitation_mm_h >= 3) return 'alert';
  if (weather.probability >= 30) return 'caution';
  return 'peaceful';
}
