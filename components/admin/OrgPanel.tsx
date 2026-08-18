'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, LoaderCircle, Plus, Trash2, UserCog } from 'lucide-react';
import {
  assignMemberOrg, deleteDepartment, deletePosition, EMPTY_ORG, fetchOrg,
  saveDepartment, savePosition, setDepartmentHead, UNASSIGNED, type Org,
} from '@/lib/org';

// 부서·직급을 만들고 구성원을 배정합니다.
//
// 직급의 '순서'는 화면에 늘어놓는 값일 뿐 권한이 아닙니다. 무엇을 보고 무엇을 승인할 수 있는지는
// 워크스페이스 권한(소유자/관리자/멤버)과 **부서장 지정**이 정합니다. 화면에도 그렇게 적어 둡니다 —
// 안 적어 두면 '부장으로 올려주면 남의 근태를 볼 수 있나?' 같은 오해가 반드시 생깁니다.
//
// 부서장도 직급에서 유도하지 않습니다. 여기서 사람을 골라 명시적으로 지정합니다.

const ROLE_LABEL: Record<string, string> = { owner: '소유자', admin: '관리자', member: '멤버' };

export default function OrgPanel({ workspaceId, onChanged }: {
  workspaceId: string;
  onChanged?: () => void;
}) {
  const [org, setOrg] = useState<Org>(EMPTY_ORG);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [deptDraft, setDeptDraft] = useState('');
  const [posDraft, setPosDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setOrg(await fetchOrg(workspaceId));
    } catch (cause) {
      setOrg(EMPTY_ORG);
      setError(cause instanceof Error ? cause.message : '조직 정보를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [workspaceId]);

  // 다른 관리자 패널들과 같은 방식으로 한 틱 미룹니다(effect 안에서 곧바로 setState 하지 않기).
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  // 어떤 동작이든 실패하면 이유를 그대로 띄우고, 성공하면 서버에서 다시 읽습니다.
  // 화면에서 낙관적으로 고쳐 두면 서버가 거절했을 때 화면과 DB가 갈라집니다.
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setError('');
    try {
      await action();
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '처리하지 못했습니다.');
    } finally { setBusy(''); }
  };

  const addDepartment = () => {
    if (!deptDraft.trim()) { setError('부서 이름을 입력해 주세요.'); return; }
    void run('dept-add', async () => {
      await saveDepartment(workspaceId, null, deptDraft.trim(), org.departments.length + 1);
      setDeptDraft('');
    });
  };

  const addPosition = () => {
    if (!posDraft.trim()) { setError('직급 이름을 입력해 주세요.'); return; }
    void run('pos-add', async () => {
      // 새 직급은 맨 아래로. 순서는 나중에 숫자를 고쳐 바꿉니다.
      await savePosition(workspaceId, null, posDraft.trim(), (org.positions.length + 1) * 10);
      setPosDraft('');
    });
  };

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-slate-200 px-5 py-4">
        <h2 className="flex items-center gap-2 font-black"><Building2 size={17} />조직 (부서·직급)</h2>
        <p className="mt-1 text-xs text-slate-500">
          근무시간 집계를 부서별로 볼 수 있게 됩니다. <strong>직급은 권한이 아닙니다</strong> —
          승인 권한은 워크스페이스 권한(소유자·관리자·멤버)과 아래에서 지정하는 <strong>부서장</strong>이 정합니다.
          부서장은 자기 부서원의 근태 정정·재택·휴가를 승인하고 근무시간을 볼 수 있습니다
          (자기 기록의 정정은 여전히 스스로 승인하지 못합니다).
        </p>
      </header>

      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}

      {loading ? (
        <div className="grid min-h-32 place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="불러오는 중" /></div>
      ) : (
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {/* ── 부서 ── */}
          <div className="min-w-0">
            <h3 className="text-xs font-black text-slate-600">부서</h3>
            <div className="mt-2 flex gap-2">
              <input value={deptDraft} onChange={(event) => setDeptDraft(event.target.value)} maxLength={40}
                placeholder="개발팀, 운영팀 …" aria-label="새 부서 이름"
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDepartment(); } }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
              <button type="button" onClick={addDepartment} disabled={!!busy}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">
                {busy === 'dept-add' ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}추가
              </button>
            </div>
            {org.departments.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                아직 부서가 없습니다. 하나 만들면 아래에서 배정할 수 있습니다.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {org.departments.map((item) => (
                  <li key={item.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input defaultValue={item.name} maxLength={40} aria-label={`${item.name} 이름`}
                        onBlur={(event) => {
                          const next = event.target.value.trim();
                          if (next && next !== item.name) void run(item.id, () => saveDepartment(workspaceId, item.id, next, item.sortOrder));
                        }}
                        className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-sm hover:border-slate-200 focus:border-slate-300" />
                      <span className="shrink-0 text-[11px] text-slate-400">{item.memberCount}명</span>
                      <button type="button" onClick={() => void run(item.id, () => deleteDepartment(workspaceId, item.id))}
                        disabled={!!busy} aria-label={`${item.name} 삭제`}
                        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                        {busy === item.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                    <label className="mt-1 flex items-center gap-1.5 pl-1.5 text-[11px] text-slate-500">
                      <UserCog size={13} className="shrink-0" />부서장
                      <select value={item.headUserId ?? ''} disabled={!!busy}
                        aria-label={`${item.name} 부서장`}
                        onChange={(event) => void run(item.id, () => setDepartmentHead(workspaceId, item.id, event.target.value || null))}
                        className="h-7 min-w-0 flex-1 rounded border border-slate-200 px-1 text-[11px] font-bold disabled:opacity-40">
                        <option value="">없음</option>
                        {org.members.map((m) => <option key={m.userId} value={m.userId}>{m.nickname}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-400">부서를 지워도 사람과 근태 기록은 그대로 남고 배정만 풀립니다.</p>
          </div>

          {/* ── 직급 ── */}
          <div className="min-w-0">
            <h3 className="text-xs font-black text-slate-600">직급</h3>
            <div className="mt-2 flex gap-2">
              <input value={posDraft} onChange={(event) => setPosDraft(event.target.value)} maxLength={40}
                placeholder="대표, 부장, 사원 …" aria-label="새 직급 이름"
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addPosition(); } }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm" />
              <button type="button" onClick={addPosition} disabled={!!busy}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">
                {busy === 'pos-add' ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}추가
              </button>
            </div>
            {org.positions.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                아직 직급이 없습니다.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {org.positions.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                    <input defaultValue={item.name} maxLength={40} aria-label={`${item.name} 이름`}
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next && next !== item.name) void run(item.id, () => savePosition(workspaceId, item.id, next, item.rank));
                      }}
                      className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-sm hover:border-slate-200 focus:border-slate-300" />
                    <input type="number" defaultValue={item.rank} aria-label={`${item.name} 순서`}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isInteger(next) && next !== item.rank) void run(item.id, () => savePosition(workspaceId, item.id, item.name, next));
                      }}
                      className="w-16 shrink-0 rounded border border-slate-200 px-1.5 py-1 text-right text-xs tabular-nums" />
                    <span className="shrink-0 text-[11px] text-slate-400">{item.memberCount}명</span>
                    <button type="button" onClick={() => void run(item.id, () => deletePosition(workspaceId, item.id))}
                      disabled={!!busy} aria-label={`${item.name} 삭제`}
                      className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                      {busy === item.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              숫자가 작을수록 위에 옵니다(대표 10, 부장 20 …). <strong>표시 순서일 뿐이고 권한과 무관합니다</strong> —
              승인은 왼쪽에서 지정한 부서장이 합니다.
            </p>
          </div>
        </div>
      )}

      {/* ── 배정 ── */}
      {!loading && (
        <div className="border-t border-slate-200">
          <h3 className="px-5 pt-4 text-xs font-black text-slate-600">구성원 배정</h3>
          <div className="overflow-x-auto p-5 pt-2">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3">이름</th>
                  <th className="py-2 pr-3">권한</th>
                  <th className="py-2 pr-3">부서</th>
                  <th className="py-2">직급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {org.members.map((member) => (
                  <tr key={member.userId}>
                    <td className="py-2 pr-3 font-bold text-slate-950">
                      {member.nickname}
                      {member.isDepartmentHead && (
                        <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">부서장</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{ROLE_LABEL[member.role] ?? member.role}</td>
                    <td className="py-2 pr-3">
                      <select value={member.departmentId ?? ''} disabled={!!busy}
                        aria-label={`${member.nickname} 부서`}
                        onChange={(event) => void run(`m-${member.userId}`, () =>
                          assignMemberOrg(workspaceId, member.userId, event.target.value || null, member.positionId))}
                        className="h-9 w-full min-w-28 rounded-lg border border-slate-300 px-2 text-xs font-bold disabled:opacity-40">
                        <option value="">{UNASSIGNED}</option>
                        {org.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </td>
                    <td className="py-2">
                      <select value={member.positionId ?? ''} disabled={!!busy}
                        aria-label={`${member.nickname} 직급`}
                        onChange={(event) => void run(`m-${member.userId}`, () =>
                          assignMemberOrg(workspaceId, member.userId, member.departmentId, event.target.value || null))}
                        className="h-9 w-full min-w-28 rounded-lg border border-slate-300 px-2 text-xs font-bold disabled:opacity-40">
                        <option value="">{UNASSIGNED}</option>
                        {org.positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
