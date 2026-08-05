import TopBar from '@/components/TopBar';
import CommunityBoard from '@/components/community/CommunityBoard';

export default function CommunityPage() {
  return <div className="flex min-h-screen flex-col"><TopBar title="커뮤니티" subtitle="출퇴근 이야기와 서비스 의견을 나눠보세요" /><main className="flex-1 p-4 md:p-8"><div className="shell-content"><CommunityBoard /></div></main></div>;
}
