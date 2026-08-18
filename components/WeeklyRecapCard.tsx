'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { drawWeeklyRecapCard, WeeklyRecapData } from '@/lib/weeklyRecapCard';

interface WeeklyRecapCardProps {
  data: WeeklyRecapData;
  onClose: () => void;
}

export default function WeeklyRecapCard({ data, onClose }: WeeklyRecapCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sharing, setSharing] = useState(false);
  const [canShare] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function');

  useEffect(() => {
    if (canvasRef.current) drawWeeklyRecapCard(canvasRef.current, data);
  }, [data]);

  const getBlob = () =>
    new Promise<Blob | null>((resolve) => {
      canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png');
    });

  const handleDownload = async () => {
    const blob = await getBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `commute-battle-recap-${data.rangeLabel.replace(/[.\s~]/g, '')}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    const blob = await getBlob();
    if (!blob) return;
    const file = new File([blob], 'commute-battle-recap.png', { type: 'image/png' });
    setSharing(true);
    try {
      await navigator.share({ files: [file], title: '출퇴근 생존일지 주간 리캡', text: `이번 주(${data.rangeLabel}) 출퇴근 리캡!` });
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') console.error('공유 실패:', error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-950">주간 리캡 공유</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <canvas ref={canvasRef} className="h-auto w-full rounded-xl border border-slate-100" />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download size={16} />
            이미지 저장
          </button>
          {canShare && (
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Share2 size={16} />
              {sharing ? '공유 중...' : '공유하기'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
