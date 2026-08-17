'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Search, Trash2 } from 'lucide-react';
import { geocodeAddress, loadKakaoMapSdk } from '@/lib/kakaoMap';
import { captureLocation, formatDistance } from '@/lib/geofence';

// 관리자가 사업장 위치와 허용 반경을 지도에서 정합니다. 여기서 정한 값은 서버에만 저장되고,
// 출퇴근 판정도 서버에서만 합니다(이 화면은 좌표를 고르는 용도일 뿐입니다).

export interface OfficeLocation {
  lat: number | null;
  lng: number | null;
  label: string | null;
  radiusM: number;
  accuracyM: number;
}

const SEOUL = { lat: 37.5665, lng: 126.978 };

export default function OfficeLocationPicker({ value, onChange }: { value: OfficeLocation; onChange: (next: OfficeLocation) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markerRef = useRef<kakao.maps.Marker | null>(null);
  const circleRef = useRef<kakao.maps.Circle | null>(null);
  // 지도 클릭 핸들러가 최신 상태를 보게 합니다(핸들러는 한 번만 등록됩니다).
  const latest = useRef(value);
  useEffect(() => { latest.current = value; }, [value]);

  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const moveTo = useCallback((lat: number, lng: number, label?: string | null) => {
    onChange({ ...latest.current, lat, lng, label: label ?? latest.current.label });
    const map = mapRef.current;
    if (map && window.kakao?.maps) map.panTo(new window.kakao.maps.LatLng(lat, lng));
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void loadKakaoMapSdk().then((kakao) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const start = value.lat !== null && value.lng !== null ? { lat: value.lat, lng: value.lng } : SEOUL;
      const map = new kakao.maps.Map(containerRef.current, { center: new kakao.maps.LatLng(start.lat, start.lng), level: 4 });
      mapRef.current = map;
      kakao.maps.event.addListener(map, 'click', (event) => {
        moveTo(event.latLng.getLat(), event.latLng.getLng());
        setNotice('');
      });
    }).catch(() => setNotice('지도를 불러오지 못했습니다. 위도·경도를 직접 입력하거나 현재 위치 버튼을 써 주세요.'));
    return () => { cancelled = true; };
    // 지도는 한 번만 만들고 이후에는 마커/원만 갱신합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 좌표·반경이 바뀔 때마다 마커와 반경 원을 다시 그립니다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    if (value.lat === null || value.lng === null) {
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      return;
    }
    const center = new window.kakao.maps.LatLng(value.lat, value.lng);
    if (!markerRef.current) markerRef.current = new window.kakao.maps.Marker({ position: center });
    else markerRef.current.setPosition(center);
    markerRef.current.setMap(map);

    if (!circleRef.current) {
      circleRef.current = new window.kakao.maps.Circle({
        center, radius: value.radiusM,
        strokeWeight: 2, strokeColor: '#2563eb', strokeOpacity: 0.8,
        fillColor: '#3b82f6', fillOpacity: 0.15,
      });
    } else {
      circleRef.current.setPosition(center);
      circleRef.current.setRadius(value.radiusM);
    }
    circleRef.current.setMap(map);
  }, [value.lat, value.lng, value.radiusM]);

  const searchAddress = async () => {
    if (!query.trim()) return;
    setBusy('search'); setNotice('');
    try {
      const kakao = await loadKakaoMapSdk();
      const found = await geocodeAddress(kakao, query.trim());
      if (!found) { setNotice('주소를 찾지 못했습니다. 지도를 직접 눌러 지정할 수도 있습니다.'); return; }
      moveTo(found.lat, found.lng, query.trim());
    } catch {
      setNotice('주소 검색에 실패했습니다.');
    } finally { setBusy(''); }
  };

  const applyCurrentPosition = async () => {
    setBusy('gps'); setNotice('');
    const fix = await captureLocation();
    setBusy('');
    if (fix.lat === null || fix.lng === null) {
      setNotice(fix.denied ? '위치 권한이 꺼져 있습니다. 브라우저 설정에서 허용해 주세요.' : '현재 위치를 확인하지 못했습니다.');
      return;
    }
    moveTo(fix.lat, fix.lng);
    if (fix.accuracy !== null) setNotice(`현재 위치로 지정했습니다 (오차 약 ${formatDistance(fix.accuracy)}).`);
  };

  const configured = value.lat !== null && value.lng !== null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-600">사업장 위치 · 출근 인증 반경</span>
        {configured && (
          <button type="button" onClick={() => onChange({ ...value, lat: null, lng: null, label: null })}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-red-600">
            <Trash2 size={12} />위치 인증 끄기
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchAddress(); } }}
            placeholder="사업장 주소 검색" aria-label="사업장 주소 검색"
            className="h-10 w-full rounded-lg border border-slate-300 pl-8 pr-2 text-xs" />
        </div>
        <button type="button" onClick={() => void searchAddress()} disabled={busy === 'search'}
          className="h-10 shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-50">
          {busy === 'search' ? '검색 중…' : '검색'}
        </button>
        <button type="button" onClick={() => void applyCurrentPosition()} disabled={busy === 'gps'}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-50">
          <Crosshair size={14} />{busy === 'gps' ? '확인 중…' : '현재 위치'}
        </button>
      </div>

      <div ref={containerRef} className="h-56 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" />

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-[11px] font-bold text-slate-600">허용 반경(m)
          <input type="number" min={20} max={5000} value={value.radiusM}
            onChange={(event) => onChange({ ...value, radiusM: Number(event.target.value) })}
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
        </label>
        <label className="block text-[11px] font-bold text-slate-600">허용 GPS 오차(m)
          <input type="number" min={20} max={2000} value={value.accuracyM}
            onChange={(event) => onChange({ ...value, accuracyM: Number(event.target.value) })}
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
          <span className="mt-0.5 block text-[10px] font-normal text-slate-400">이보다 오차가 크면 인증하지 않고 미인증으로 남깁니다</span>
        </label>
        <div className="text-[11px] font-bold text-slate-600">지정된 좌표
          <p className="mt-1 flex h-9 items-center gap-1 rounded-lg bg-slate-100 px-2 text-[11px] font-normal text-slate-600">
            <MapPin size={12} className="shrink-0" />
            {configured ? `${value.lat!.toFixed(5)}, ${value.lng!.toFixed(5)}` : '미설정 — 위치 인증을 하지 않습니다'}
          </p>
        </div>
      </div>

      {notice && <p className="text-[11px] font-semibold text-slate-600">{notice}</p>}
      <p className="text-[11px] text-slate-400">
        지도를 눌러 사업장 위치를 지정합니다. 사무실 출근의 <strong>도착</strong>과 퇴근의 <strong>출발</strong>을 이 반경 안에서 눌렀는지 서버가 확인합니다.
        승인된 재택근무일은 위치를 확인하지 않습니다.
      </p>
    </div>
  );
}
