import { createClient } from '@supabase/supabase-js';

export async function DELETE(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json({ error: '회원탈퇴 서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !user) return Response.json({ error: '로그인 정보가 유효하지 않습니다.' }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { data: owned, error: ownedError } = await admin.from('chat_workspaces').select('id').eq('owner_id', user.id);
    if (ownedError) throw ownedError;

    for (const workspace of owned ?? []) {
      const { data: members, error: memberError } = await admin.from('chat_workspace_members')
        .select('user_id, role, joined_at').eq('workspace_id', workspace.id).neq('user_id', user.id)
        .order('joined_at', { ascending: true });
      if (memberError) throw memberError;

      const successor = [...(members ?? [])].sort((a, b) => {
        const priority = (role: string) => role === 'admin' ? 0 : 1;
        return priority(a.role) - priority(b.role) || Date.parse(a.joined_at) - Date.parse(b.joined_at);
      })[0];

      if (!successor) {
        const { error } = await admin.from('chat_workspaces').delete().eq('id', workspace.id);
        if (error) throw error;
        continue;
      }

      const { error: roleError } = await admin.from('chat_workspace_members').update({ role: 'owner' })
        .eq('workspace_id', workspace.id).eq('user_id', successor.user_id);
      if (roleError) throw roleError;
      const { error: ownerError } = await admin.from('chat_workspaces').update({ owner_id: successor.user_id }).eq('id', workspace.id);
      if (ownerError) throw ownerError;
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteAuthError) throw deleteAuthError;
    const { error: deleteProfileError } = await admin.from('users').delete().eq('id', user.id);
    if (deleteProfileError) throw deleteProfileError;
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Account deletion failed:', error);
    return Response.json({ error: '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }
}
