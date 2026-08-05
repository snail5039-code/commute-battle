'use client';

import { CloudSun, Droplets, MapPin, Wind } from 'lucide-react';
import { WeatherResponse, weatherLabel } from '@/lib/weather';

export default function WeatherCard({ weather, loading }: { weather: WeatherResponse; loading: boolean }) {
  const current = weather.current;
  const location = weather.locationSource === 'current' ? '현재 위치' : weather.locationSource === 'saved-address' ? '저장된 집 주소' : '기본 정보';
  return (
    <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm"><CloudSun size={19} /></span><div><p className="text-xs font-bold text-slate-800">{loading ? '날씨 확인 중…' : weatherLabel(current.weatherCode)}</p><p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500"><MapPin size={10} />{location}</p></div></div>
        <div className="text-right"><strong className="text-xl text-slate-900">{Math.round(current.temperature)}°</strong><p className="text-[10px] text-slate-500">체감 {Math.round(current.apparentTemperature)}°</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600"><span className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1.5"><Droplets size={13} className="text-blue-500" />강수 {current.precipitation}mm · {current.precipitationProbability}%</span><span className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1.5"><Wind size={13} className="text-cyan-600" />바람 {Math.round(current.windSpeed)}km/h</span></div>
      {weather.message && <p className="mt-2 text-[10px] text-amber-700">{weather.message}</p>}
    </div>
  );
}
