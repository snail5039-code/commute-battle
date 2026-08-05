import { CommuteRecord } from './types';

export interface WeatherPoint {
  time: string;
  temperature: number;
  apparentTemperature: number;
  precipitation: number;
  precipitationProbability: number;
  weatherCode: number;
  windSpeed: number;
}

export interface WeatherResponse {
  current: WeatherPoint;
  hourly: WeatherPoint[];
  source: 'open-meteo' | 'fallback';
  locationSource?: 'current' | 'saved-address' | 'default';
  message?: string;
}

export interface DepartureRecommendation {
  departureTime: string;
  tripMinutes: number;
  bufferMinutes: number;
  reasons: string[];
}

export const WEATHER_FALLBACK: WeatherResponse = {
  current: {
    time: '',
    temperature: 20,
    apparentTemperature: 20,
    precipitation: 0,
    precipitationProbability: 0,
    weatherCode: 3,
    windSpeed: 0,
  },
  hourly: [],
  source: 'fallback',
  message: '실시간 날씨를 불러오지 못해 기본 안전 여유를 적용했어요.',
};

export function weatherLabel(code: number) {
  if (code === 0) return '맑음';
  if (code <= 3) return '구름';
  if (code === 45 || code === 48) return '안개';
  if (code >= 95) return '뇌우';
  if (code >= 71 && code <= 86) return '눈';
  if (code >= 51 && code <= 67) return '비';
  if (code >= 80 && code <= 82) return '소나기';
  return '흐림';
}

export async function fetchWeather(lat: number, lng: number, signal?: AbortSignal) {
  const response = await fetch(`/api/weather?lat=${lat}&lng=${lng}`, { signal });
  if (!response.ok) throw new Error('날씨 조회에 실패했습니다.');
  return response.json() as Promise<WeatherResponse>;
}

function recentTripMinutes(records: CommuteRecord[]) {
  const values = records
    .filter((record) => record.type === 'commute' && Boolean(record.end_time))
    .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime())
    .slice(0, 10)
    .map((record) => record.duration_minutes ?? (new Date(record.end_time!).getTime() - new Date(record.start_time ?? record.end_time!).getTime()) / 60_000)
    .filter((value) => Number.isFinite(value) && value >= 5 && value <= 240);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 45;
}

function formatTime(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function recommendDeparture(records: CommuteRecord[], weather: WeatherResponse, date = new Date()): DepartureRecommendation {
  const tripMinutes = recentTripMinutes(records);
  const reasons = [`최근 정상 출근 ${Math.min(10, records.filter((record) => record.type === 'commute' && Boolean(record.end_time)).length)}건 기준 ${tripMinutes}분`];
  let bufferMinutes = 10;
  const day = date.getDay();

  if (day === 1) {
    bufferMinutes += 5;
    reasons.push('월요일 혼잡 여유 5분');
  } else if (day === 5) {
    bufferMinutes += 3;
    reasons.push('금요일 혼잡 여유 3분');
  }

  const forecast = weather.hourly.find((point) => point.time.includes('08:')) ?? weather.current;
  if (forecast.precipitation >= 3 || forecast.precipitationProbability >= 60) {
    bufferMinutes += 10;
    reasons.push('강수 가능성에 10분 추가');
  } else if (forecast.precipitation > 0 || forecast.precipitationProbability >= 30) {
    bufferMinutes += 5;
    reasons.push('약한 강수 가능성에 5분 추가');
  }
  if (forecast.windSpeed >= 35) {
    bufferMinutes += 10;
    reasons.push('강풍에 10분 추가');
  } else if (forecast.windSpeed >= 20) {
    bufferMinutes += 5;
    reasons.push('바람에 5분 추가');
  }
  if (weather.source === 'fallback') reasons.push('날씨 미확인으로 기본 안전 여유 적용');
  reasons.push('09:00 도착 · 기본 안전 여유 10분');

  return { departureTime: formatTime(9 * 60 - tripMinutes - bufferMinutes), tripMinutes, bufferMinutes, reasons };
}
