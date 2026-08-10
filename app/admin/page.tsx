import TopBar from '@/components/TopBar';
import WorkspaceAdminDashboard from '@/components/admin/WorkspaceAdminDashboard';

export default function AdminPage() {
  return <div className="flex min-h-screen flex-col"><TopBar title="관리자 현황" subtitle="승인 요청과 부서원의 오늘 출퇴근 상태를 확인합니다."/><main className="flex-1 p-4 md:p-8"><div className="shell-content"><WorkspaceAdminDashboard/></div></main></div>;
}
