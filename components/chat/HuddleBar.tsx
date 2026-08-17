'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, MicOff, MonitorUp, MonitorX, PhoneOff } from 'lucide-react';
import { joinHuddle, screenShareSupported, type HuddleSession, type HuddleStatus } from '@/lib/huddle';

const STATUS_LABEL: Record<HuddleStatus, string> = {
  connecting: '통화 준비 중',
  waiting: '상대를 기다리는 중',
  calling: '연결하는 중',
  connected: '통화 중',
  failed: '연결 실패',
  ended: '통화 종료',
};

export default function HuddleBar({ channelId, channelName, userId, userName, onClose }: { channelId: string; channelName: string; userId: string; userName: string; onClose: () => void }) {
  const [status, setStatus] = useState<HuddleStatus>('connecting');
  const [peerName, setPeerName] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [error, setError] = useState('');
  const sessionRef = useRef<HuddleSession | null>(null);
  const mediaRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    void joinHuddle({
      channelId,
      userId,
      userName,
      callbacks: {
        onStatus: (next) => { if (!cancelled) setStatus(next); },
        onRemoteStream: (stream) => { if (!cancelled && mediaRef.current) mediaRef.current.srcObject = stream; },
        onRemoteVideo: (active) => { if (!cancelled) setHasRemoteVideo(active); },
        onPeerName: (name) => { if (!cancelled) setPeerName(name); },
        onError: (message) => { if (!cancelled) setError(message); },
      },
    })
      .then((session) => {
        if (cancelled) { void session.leave(); return; }
        sessionRef.current = session;
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '통화를 시작하지 못했습니다.'); });
    return () => { cancelled = true; void sessionRef.current?.leave(); sessionRef.current = null; };
  }, [channelId, userId, userName]);

  const toggleShare = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    setError('');
    try {
      if (sharing) { await session.stopScreenShare(); setSharing(false); }
      else { await session.startScreenShare(); setSharing(true); }
    } catch (cause) {
      setSharing(false);
      const message = cause instanceof Error ? cause.message : '화면 공유를 시작하지 못했습니다.';
      setError(message.includes('Permission') || message.includes('denied') ? '화면 공유가 취소되었습니다.' : message);
    }
  }, [sharing]);

  const hangUp = useCallback(async () => { await sessionRef.current?.leave(); sessionRef.current = null; onClose(); }, [onClose]);

  return (
    <section className="border-b border-slate-200 bg-slate-50" aria-label={`${channelName} 허들`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs font-black text-slate-900">
          {status === 'connected' ? <span className="size-2 rounded-full bg-emerald-500" /> : <LoaderCircle size={13} className="animate-spin text-[#611f69]" />}
          허들 · #{channelName}
        </span>
        <span className="text-[11px] text-slate-500">{STATUS_LABEL[status]}{peerName && status === 'connected' ? ` · ${peerName}` : ''}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => { const next = sessionRef.current?.toggleMic(); setMicOn(Boolean(next)); }} aria-pressed={!micOn} aria-label={micOn ? '마이크 끄기' : '마이크 켜기'} className={`grid size-8 place-items-center ${micOn ? 'bg-slate-200 text-slate-700' : 'bg-red-600 text-white'}`}>
            {micOn ? <Mic size={15} /> : <MicOff size={15} />}
          </button>
          {screenShareSupported() && (
            <button type="button" onClick={() => void toggleShare()} aria-pressed={sharing} aria-label={sharing ? '화면 공유 중지' : '화면 공유'} className={`grid size-8 place-items-center ${sharing ? 'bg-[#007a5a] text-white' : 'bg-slate-200 text-slate-700'}`}>
              {sharing ? <MonitorX size={15} /> : <MonitorUp size={15} />}
            </button>
          )}
          <button type="button" onClick={() => void hangUp()} className="flex h-8 items-center gap-1.5 bg-red-600 px-3 text-xs font-bold text-white" aria-label="통화 종료">
            <PhoneOff size={14} />종료
          </button>
        </div>
      </div>
      {/* 소리는 항상 이 요소로 나오고, 화면 공유가 들어오면 같은 요소가 영상까지 보여줍니다. */}
      <video ref={mediaRef} autoPlay playsInline className={hasRemoteVideo ? 'mx-4 mb-3 max-h-72 w-[calc(100%-2rem)] bg-black object-contain' : 'sr-only'} />
      {error && <p role="alert" className="px-4 pb-2 text-[11px] font-bold text-red-600">{error}</p>}
      {status === 'waiting' && !error && <p className="px-4 pb-2 text-[11px] text-slate-500">같은 채널의 동료가 허들 버튼을 누르면 연결됩니다. 1:1 통화만 지원해요.</p>}
    </section>
  );
}
