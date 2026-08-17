'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchChatProfiles, fetchChatWorkspaces, fetchWorkspaceChannels } from '@/lib/departmentChat';
import { fetchDirectThreads } from '@/lib/directMessages';
import { showChatNotification } from '@/lib/notifications';

interface ChannelMessageRow { channel_id: string; author_id: string; content: string; attachment_name?: string | null }
interface DirectMessageRow { thread_id: string; author_id: string; content: string }

function preview(content: string, attachmentName?: string | null) {
  const clean = content.replace(/\s+/g, ' ').trim();
  // 파일만 보낸 메시지는 본문이 비어 있어서 알림이 빈칸으로 뜨지 않도록 파일 이름을 대신 보여줍니다.
  const text = clean || (attachmentName ? `📎 ${attachmentName}` : '새 메시지');
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

export default function ChatNotifications({ userId }: { userId: string }) {
  useEffect(() => {
    let active = true;
    const channelNames = new Map<string, string>();
    const directNames = new Map<string, string>();

    void fetchChatWorkspaces().then(async (workspaces) => {
      const channelGroups = await Promise.all(workspaces.map((workspace) => fetchWorkspaceChannels(workspace.id)));
      channelGroups.flat().forEach((channel) => channelNames.set(channel.id, channel.name));
      const threadGroups = await Promise.all(workspaces.map((workspace) => fetchDirectThreads(workspace.id)));
      threadGroups.flat().forEach((thread) => directNames.set(thread.id, thread.otherName));
    }).catch(() => undefined);

    const groupChannel = supabase.channel(`notifications:group:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const row = payload.new as ChannelMessageRow;
        if (!active || row.author_id === userId) return;
        void fetchChatProfiles([row.author_id]).then((profiles) => {
          if (!active) return;
          const author = profiles.get(row.author_id) ?? '동료';
          const channel = channelNames.get(row.channel_id);
          showChatNotification(channel ? `#${channel} · ${author}` : `부서 채팅 · ${author}`, preview(row.content, row.attachment_name), '/chat');
        }).catch(() => showChatNotification('새 부서 채팅', preview(row.content, row.attachment_name), '/chat'));
      }).subscribe();

    const directChannel = supabase.channel(`notifications:direct:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_direct_messages' }, (payload) => {
        const row = payload.new as DirectMessageRow;
        if (!active || row.author_id === userId) return;
        const otherName = directNames.get(row.thread_id);
        showChatNotification(otherName ? `개인 채팅 · ${otherName}` : '새 개인 채팅', preview(row.content), '/messages');
      }).subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(groupChannel);
      void supabase.removeChannel(directChannel);
    };
  }, [userId]);

  return null;
}
