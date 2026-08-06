'use client';

import AssistantPanel from '@/components/AssistantPanel';
import TopBar from '@/components/TopBar';
import { useAppData } from '@/lib/useAppData';

export default function AssistantPage() {
  const { user, records, loading } = useAppData();
  if (loading) return <div className="flex min-h-screen flex-col"><TopBar title="출퇴근 비서" subtitle="내 기록을 확인하고 있어요"/><main className="flex-1 p-4 md:p-8"><div className="mx-auto max-w-2xl space-y-4" aria-label="출퇴근 비서를 불러오는 중"><div className="h-28 animate-pulse rounded-2xl bg-blue-50"/><div className="h-32 animate-pulse rounded-2xl bg-neutral-100"/><p className="text-center text-xs text-neutral-500">최근 출퇴근 기록을 살펴보고 있어요.</p></div></main></div>;
  return <div className="flex min-h-screen flex-col"><TopBar title="출퇴근 비서" subtitle="내 기록을 바탕으로 쉽게 답해 드려요"/><main className="flex-1 p-4 pb-8 md:p-8"><div className="mx-auto max-w-2xl">{user ? <AssistantPanel user={user} records={records}/> : <div className="card p-8 text-sm text-neutral-600">먼저 게임을 시작해 주세요.</div>}</div></main></div>;
}
