'use client';

import { useEffect, useState } from 'react';
import { attendanceWorkspaceId } from '@/lib/attendance';
import { supabase } from '@/lib/supabase';
import AttendanceReport from './AttendanceReport';

// 직원 본인용 근무시간 요약.
//
// 예전에는 "서버가 관리자가 아닌 요청을 본인 기록으로 좁혀 준다"에 기대고 있었는데,
// 부서장이 생기면서(202608180005) 그 말이 더는 맞지 않습니다 — 부서장에게는 서버가 부서원까지
// 돌려줍니다. 여기는 '내 근무시간' 카드이므로 본인 것만 보이도록 화면에서 못을 박습니다.
export default function MyAttendanceSection() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      void Promise.all([
        attendanceWorkspaceId(),
        supabase.auth.getUser().then(({ data }) => data.user?.id ?? null).catch(() => null),
      ]).then(([id, uid]) => { setWorkspaceId(id); setUserId(uid); setResolved(true); });
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
  return <AttendanceReport workspaceId={workspaceId} adminMode={false} onlyUserId={userId} />;
}
