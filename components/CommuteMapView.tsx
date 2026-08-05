'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Navigation } from 'lucide-react';
import { User, CommuteRecord } from '@/lib/types';
import { loadKakaoMapSdk, geocodeAddress } from '@/lib/kakaoMap';

interface CommuteMapViewProps {
  user: User;
  activeRecord: CommuteRecord;
  onArrive: () => Promise<void>;
  onClose: () => void;
}

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function createPulseMarkerEl() {
  const wrapper = document.createElement('div');
  wrapper.className = 'relative w-5 h-5';
  wrapper.innerHTML = `
    <span class="absolute inset-0 rounded-full bg-blue-400 opacity-60 animate-ping"></span>
    <span class="absolute inset-0 rounded-full bg-blue-500 border-2 border-white shadow-md"></span>
  `;
  return wrapper;
}

export default function CommuteMapView({
  user,
  activeRecord,
  onArrive,
  onClose,
}: CommuteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const myMarkerRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const pathLineRef = useRef<kakao.maps.Polyline | null>(null);
  const pathRef = useRef<kakao.maps.LatLng[]>([]);
  const watchIdRef = useRef<number | null>(null);

  const [now, setNow] = useState(() => new Date());
  const [arriving, setArriving] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadKakaoMapSdk()
      .then(async (kakao) => {
        if (cancelled || !containerRef.current) return;

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng),
          level: 5,
        });
        mapRef.current = map;

        const homeCoord = user.home_address
          ? await geocodeAddress(kakao, user.home_address)
          : null;
        const workCoord = user.work_address
          ? await geocodeAddress(kakao, user.work_address)
          : null;

        if (cancelled) return;

        const startCoord = activeRecord.type === 'commute' ? homeCoord : workCoord;
        const destCoord = activeRecord.type === 'commute' ? workCoord : homeCoord;

        if (startCoord) {
          new kakao.maps.Marker({
            position: new kakao.maps.LatLng(startCoord.lat, startCoord.lng),
            map,
          });
        }
        if (destCoord) {
          new kakao.maps.Marker({
            position: new kakao.maps.LatLng(destCoord.lat, destCoord.lng),
            map,
          });
        }
        if (startCoord && destCoord) {
          const routeLine = new kakao.maps.Polyline({
            path: [
              new kakao.maps.LatLng(startCoord.lat, startCoord.lng),
              new kakao.maps.LatLng(destCoord.lat, destCoord.lng),
            ],
            strokeWeight: 3,
            strokeColor: '#94a3b8',
            strokeOpacity: 0.8,
            strokeStyle: 'shortdash',
          });
          routeLine.setMap(map);
          map.setCenter(
            new kakao.maps.LatLng(
              (startCoord.lat + destCoord.lat) / 2,
              (startCoord.lng + destCoord.lng) / 2
            )
          );
        } else if (startCoord) {
          map.setCenter(new kakao.maps.LatLng(startCoord.lat, startCoord.lng));
        }

        pathLineRef.current = new kakao.maps.Polyline({
          path: [],
          strokeWeight: 5,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.9,
        });
        pathLineRef.current.setMap(map);

        if (!navigator.geolocation) {
          setGpsError('이 기기에서는 위치 정보를 사용할 수 없습니다');
          setReady(true);
          return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelled || !mapRef.current) return;
            const { latitude, longitude } = pos.coords;
            const point = new kakao.maps.LatLng(latitude, longitude);

            if (!myMarkerRef.current) {
              myMarkerRef.current = new kakao.maps.CustomOverlay({
                position: point,
                content: createPulseMarkerEl(),
                zIndex: 10,
              });
              myMarkerRef.current.setMap(mapRef.current);
              mapRef.current.setCenter(point);
              mapRef.current.setLevel(4);
            } else {
              myMarkerRef.current.setPosition(point);
              mapRef.current.panTo(point);
            }

            pathRef.current = [...pathRef.current, point];
            pathLineRef.current?.setPath(pathRef.current);
            setGpsError(null);
            setReady(true);
          },
          (err) => {
            setGpsError(
              err.code === err.PERMISSION_DENIED
                ? '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요'
                : '위치를 가져올 수 없습니다'
            );
            setReady(true);
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
      })
      .catch(() => {
        setGpsError('지도를 불러오지 못했습니다');
        setReady(true);
      });

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [user.home_address, user.work_address, activeRecord.type]);

  const elapsedMs = now.getTime() - new Date(activeRecord.start_time!).getTime();

  const handleArrive = async () => {
    setArriving(true);
    try {
      await onArrive();
    } finally {
      setArriving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div>
          <p className="text-[13px] font-semibold text-neutral-900">
            {activeRecord.type === 'commute' ? '출근 이동 중' : '퇴근 이동 중'}
          </p>
          <p className="text-[11px] text-neutral-400">실시간 위치를 추적하고 있어요</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[13px] text-neutral-400">
            지도를 불러오는 중...
          </div>
        )}
        {gpsError && (
          <div className="absolute top-3 left-3 right-3 flex items-center gap-2 bg-red-50 text-red-600 text-[12px] font-medium px-3 py-2 rounded-[10px]">
            <Navigation size={14} />
            {gpsError}
          </div>
        )}
      </div>

      <div className="border-t border-neutral-100 p-4 space-y-3">
        <p className="text-center text-[20px] font-mono font-semibold text-neutral-900 tabular-nums">
          {formatElapsed(elapsedMs)}
        </p>
        <button
          onClick={handleArrive}
          disabled={arriving}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[14px] text-[14px] font-semibold disabled:opacity-50 transition-colors"
        >
          {arriving ? '기록 중...' : '도착'}
        </button>
      </div>
    </div>
  );
}
