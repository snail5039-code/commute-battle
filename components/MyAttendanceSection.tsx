'use client';

import { useEffect, useState } from 'react';
import { attendanceWorkspaceId } from '@/lib/attendance';
import AttendanceReport from './AttendanceReport';

// 직원 본인용 근무시간 요약. 서버 RPC가 관리자가 아닌 요청은 본인 기록으로만 좁혀 줍니다.
export default function MyAttendanceSection() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      void attendanceWorkspaceId().then((id) => { setWorkspaceId(id); setResolved(true); });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!resolved) return null;
  if (!workspaceId) {
    return <section className="card p-5 text-sm text-slate-500">
      <strong className="block text-slate-900">근무시간 집계</strong>
      워크스페이스에 참여하면 회사 기준(소정근로·휴게·연장)으로 계산한 내 근무시간을 볼 수 있어요.
    </section>;
  }
  return <AttendanceReport workspaceId={workspaceId} adminMode={false} />;
}
