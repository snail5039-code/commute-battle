'use client';

import { useEffect } from 'react';
import { attendanceWorkspaceId } from '@/lib/attendance';
import { syncHolidaysIfDue } from '@/lib/holidays';

// 관리자가 앱을 열면 공휴일을 조용히 채웁니다. 화면에는 아무것도 그리지 않습니다.
//
// 관리자가 아닌 사람이 열어도 안전합니다 — 서버(holiday_sync_due)가 빈 배열을 돌려주므로
// 네트워크 호출 한 번으로 끝나고 아무 일도 일어나지 않습니다.
//
// 결과와 실패 사유는 /admin 공휴일 카드에 나옵니다. 여기서 화면에 알리지 않는 이유는,
// 사용자가 요청한 적 없는 작업이라 성공하든 실패하든 방해가 되기 때문입니다.

// 페이지 이동으로 다시 마운트돼도 앱을 켜 있는 동안 한 번만 돕니다.
let ranThisLoad = false;

export default function HolidayAutoSync() {
  useEffect(() => {
    // 첫 화면 그리기와 경쟁하지 않도록 조금 미룹니다. 급한 일이 아닙니다.
    const timer = setTimeout(() => {
      if (ranThisLoad) return;
      ranThisLoad = true;
      void (async () => {
        const workspaceId = await attendanceWorkspaceId().catch(() => null);
        if (!workspaceId) return;
        await syncHolidaysIfDue(workspaceId).catch(() => {});
      })();
    }, 3_000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
