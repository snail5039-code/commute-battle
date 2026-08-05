import { NextRequest, NextResponse } from 'next/server';
import { WEATHER_FALLBACK, WeatherPoint, WeatherResponse } from '@/lib/weather';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; data: WeatherResponse }>();

interface OpenMeteoPayload {
  current: Record<string, number | string>;
  hourly: Record<string, Array<number | string>>;
}

function validCoordinate(value: string | null, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function point(values: Record<string, number | string>, index?: number): WeatherPoint {
  const get = (key: string) => {
    const value = values[key];
    return index === undefined ? value : (value as unknown as Array<number | string>)[index];
  };
  return {
    time: String(get('time') ?? ''),
    temperature: Number(get('temperature_2m') ?? 0),
    apparentTemperature: Number(get('apparent_temperature') ?? 0),
    precipitation: Number(get('precipitation') ?? 0),
    precipitationProbability: Number(get('precipitation_probability') ?? 0),
    weatherCode: Number(get('weather_code') ?? 0),
    windSpeed: Number(get('wind_speed_10m') ?? 0),
  };
}

export async function GET(request: NextRequest) {
  const lat = validCoordinate(request.nextUrl.searchParams.get('lat'), -90, 90);
  const lng = validCoordinate(request.nextUrl.searchParams.get('lng'), -180, 180);
  if (lat === null || lng === null) return NextResponse.json({ error: '유효한 위도와 경도가 필요합니다.' }, { status: 400 });

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.data, { headers: { 'X-Weather-Cache': 'HIT' } });

  const params = new URLSearchParams({
    latitude: String(lat), longitude: String(lng), timezone: 'Asia/Seoul',
    current: 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m',
    forecast_days: '2',
  });
  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params}`, { signal: AbortSignal.timeout(5_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const raw = await response.json() as OpenMeteoPayload;
    const times = raw.hourly.time ?? [];
    const data: WeatherResponse = {
      current: point(raw.current),
      hourly: times.map((_, index) => point(raw.hourly as unknown as Record<string, number | string>, index)),
      source: 'open-meteo',
    };
    cache.set(key, { expiresAt: Date.now() + CACHE_MS, data });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=600' } });
  } catch (error) {
    console.error('Weather lookup failed:', error);
    return NextResponse.json({ ...WEATHER_FALLBACK, current: { ...WEATHER_FALLBACK.current, time: new Date().toISOString() } });
  }
}
