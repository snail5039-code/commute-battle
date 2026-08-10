'use client';

import { CloudSun, Droplets, MapPin, Wind } from 'lucide-react';
import { WeatherResponse, weatherLabel } from '@/lib/weather';
import StatusIcon from './StatusIcon';

export default function WeatherCard({ weather, loading }: { weather: WeatherResponse; loading: boolean }) {
  const current = weather.current;
  const location = weather.locationSource === 'current' ? '현재 위치' : weather.locationSource === 'saved-address' ? '저장된 집 주소' : '기본 정보';
  return (
    <section aria-label="현재 날씨" className="border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5"><StatusIcon icon={CloudSun} tone="sky" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{loading ? '날씨 확인 중…' : weatherLabel(current.weatherCode)}</p><p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500"><MapPin size={10} className="shrink-0" />{location}</p></div></div>
        <div className="text-right"><strong className="text-xl text-slate-900">{Math.round(current.temperature)}°</strong><p className="text-[10px] text-slate-500">체감 {Math.round(current.apparentTemperature)}°</p></div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-slate-600 min-[360px]:grid-cols-2"><span className="flex min-w-0 items-center gap-1.5 border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"><Droplets size={13} className="shrink-0 text-blue-500" /><span className="truncate">강수 {current.precipitation}mm · {current.precipitationProbability}%</span></span><span className="flex min-w-0 items-center gap-1.5 border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"><Wind size={13} className="shrink-0 text-cyan-600" /><span className="truncate">바람 {Math.round(current.windSpeed)}km/h</span></span></div>
      {weather.message && <p className="mt-2 text-[10px] text-amber-700">{weather.message}</p>}
    </section>
  );
}
