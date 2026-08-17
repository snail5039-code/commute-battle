-- 워크스페이스 채널 메시지에 파일 첨부를 추가합니다.
-- 파일 본체는 Storage 비공개 버킷(chat-files)에 두고, 메시지 행에는 경로와 메타데이터만 남깁니다.

alter table public.chat_messages add column if not exists attachment_path text;
alter table public.chat_messages add column if not exists attachment_name text;
alter table public.chat_messages add column if not exists attachment_type text;
alter table public.chat_messages add column if not exists attachment_size bigint;

-- 파일만 보내는 메시지는 본문이 비어 있을 수 있어야 합니다.
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages add constraint chat_messages_content_check
  check (char_length(btrim(content)) <= 1000 and (char_length(btrim(content)) >= 1 or attachment_path is not null));

alter table public.chat_messages drop constraint if exists chat_messages_attachment_check;
alter table public.chat_messages add constraint chat_messages_attachment_check
  check (attachment_path is null or (attachment_name is not null and coalesce(attachment_size, 0) between 1 and 10485760));

-- 업로드 경로는 "<workspace_id>/<channel_id>/<파일키>" 규칙을 따릅니다.
-- 경로 첫 칸이 uuid가 아니면 정책 평가 중 캐스팅 오류가 나므로 함수 안에서 안전하게 막습니다.
create or replace function public.is_chat_file_member(object_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare workspace uuid;
begin
  begin
    workspace := split_part(object_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.is_chat_workspace_member(workspace);
end $$;

grant execute on function public.is_chat_file_member(text) to authenticated;

-- 메시지 행의 첨부 경로도 같은 워크스페이스 안에 있는지 확인합니다.
drop policy if exists "members send chat messages" on public.chat_messages;
create policy "members send chat messages" on public.chat_messages for insert to authenticated
with check (
  author_id = auth.uid()
  and public.is_chat_workspace_member((select workspace_id from public.chat_channels where id = channel_id))
  and (
    attachment_path is null
    or attachment_path like ((select workspace_id::text from public.chat_channels where id = channel_id) || '/' || channel_id::text || '/%')
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "workspace members read chat files" on storage.objects;
create policy "workspace members read chat files" on storage.objects for select to authenticated
using (bucket_id = 'chat-files' and public.is_chat_file_member(name));

-- 업로드 시점에는 owner 컬럼이 아직 채워지지 않을 수 있어, 소속 확인만으로 막습니다.
drop policy if exists "workspace members upload chat files" on storage.objects;
create policy "workspace members upload chat files" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-files' and public.is_chat_file_member(name));

drop policy if exists "uploaders delete own chat files" on storage.objects;
create policy "uploaders delete own chat files" on storage.objects for delete to authenticated
using (bucket_id = 'chat-files' and owner = auth.uid());
