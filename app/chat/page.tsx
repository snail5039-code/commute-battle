import TopBar from '@/components/TopBar';
import DepartmentChat from '@/components/chat/DepartmentChat';

export default function ChatPage() {
  return <div className="flex min-h-screen flex-col"><TopBar title="부서 채팅" subtitle="부서별 채널에서 동료들과 실시간으로 이야기해 보세요."/><main className="flex-1 p-3 md:p-6"><div className="shell-content"><DepartmentChat/></div></main></div>;
}
