'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, LoaderCircle, RefreshCw, Settings2, ShieldAlert } from 'lucide-react';
import {
  attendanceCsv, downloadCsv, fetchAttendanceSummary, formatClock, formatHours, formatMinutes, monthRange,
  saveWorkPolicy, STATUS_LABEL, type AttendanceSummary, type WorkPolicy,
} from '@/lib/workTime';
import { formatDistance } from '@/lib/geofence';
import OfficeLocationPicker from './admin/OfficeLocationPicker';
import { EMPTY_ORG, fetchOrg, orgByUserId, UNASSIGNED, type Org } from '@/lib/org';

// 부서 필터의 '미지정' 값. 빈 문자열은 '전체'라서 따로 둡니다.
const NO_DEPARTMENT = '__none__';

const STATUS_STYLE: Record<string, string> = {
  complete: 'bg-slate-100 text-slate-600',
  incomplete: 'bg-amber-50 text-amber-800',
  vacation: 'bg-blue-50 text-blue-700',
  sick: 'bg-violet-50 text-violet-700',
  absence: 'bg-rose-50 text-rose-700',
  early_leave: 'bg-orange-50 text-orange-800',
};

// onlyUserId: 개인 화면(/stats)에서 쓰는 '본인 것만' 잠금.
// 부서장은 서버가 부서원까지 돌려주므로, 이 잠금이 없으면 '내 근무시간' 카드에 부서원이 섞인다.
export default function AttendanceReport({ workspaceId, adminMode, onlyUserId }: {
  workspaceId: string;
  adminMode: boolean;
  onlyUserId?: string | null;
}) {
  const initial = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [member, setMember] = useState('');
  const [department, setDepartment] = useState('');
  const [org, setOrg] = useState<Org>(EMPTY_ORG);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [draft, setDraft] = useState<WorkPolicy | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // target_user_id는 넘기지 않습니다. 서버가 관리자에게만 적용해서, 부서장이 구성원을
      // 골라도 아무 일이 안 일어났습니다. 고르는 일은 아래 view에서 화면이 합니다.
      const next = await fetchAttendanceSummary(workspaceId, from, to);
      setSummary(next); setDraft(next.policy);
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : '근태 집계를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [workspaceId, from, to]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  // 부서·직급은 집계 함수가 모릅니다. 임금이 걸린 get_attendance_summary를 부서 표시 때문에
  // 고치지 않으려고 따로 받아 userId로 맞춰 붙입니다. 조직이 없으면 필터가 안 보일 뿐입니다.
  useEffect(() => {
    let active = true;
    void fetchOrg(workspaceId).then((next) => { if (active) setOrg(next); }).catch(() => {});
    return () => { active = false; };
  }, [workspaceId]);

  const orgMap = useMemo(() => orgByUserId(org), [org]);

  // 부서로 거른 결과. 아래 계산·표·CSV는 전부 이걸 봅니다 — summary를 직접 보면
  // 필터가 걸린 화면에서 합계만 전체 값으로 남습니다.
  const view = useMemo(() => {
    if (!summary) return summary;
    const keep = (userId: string) => {
      if (onlyUserId && userId !== onlyUserId) return false;
      if (member && userId !== member) return false;
      if (!department) return true;
      const assigned = orgMap.get(userId)?.departmentId ?? null;
      return department === NO_DEPARTMENT ? assigned === null : assigned === department;
    };
    return {
      ...summary,
      days: summary.days.filter((day) => keep(day.userId)),
      weeks: summary.weeks.filter((week) => keep(week.userId)),
    };
  }, [summary, department, member, onlyUserId, orgMap]);

  const members = useMemo(() => {
    const map = new Map<string, string>();
    // view가 아니라 summary에서 뽑습니다. view는 이미 걸러진 값이라, 한 명을 고르고 나면
    // 목록에 그 한 명만 남아 다른 사람으로 바꿀 수 없게 됩니다.
    summary?.days.forEach((day) => map.set(day.userId, day.nickname));
    return [...map]
      .filter(([userId]) => !onlyUserId || userId === onlyUserId)
      .map(([userId, nickname]) => ({ userId, nickname }));
  }, [summary, onlyUserId]);

  const totals = useMemo(() => {
    const days = view?.days ?? [];
    return {
      worked: days.reduce((sum, day) => sum + day.workedMinutes, 0),
      overtime: days.reduce((sum, day) => sum + day.overtimeMinutes, 0),
      night: days.reduce((sum, day) => sum + day.nightMinutes, 0),
      holiday: days.reduce((sum, day) => sum + day.holidayMinutes, 0),
      late: days.filter((day) => day.lateMinutes > 0).length,
      incomplete: days.filter((day) => day.status === 'incomplete').length,
      unverified: days.filter((day) => day.locationUnverified > 0).length,
    };
  }, [view]);

  const overLimitWeeks = view?.weeks.filter((week) => week.overLimit) ?? [];
  const unverifiedDays = view?.days.filter((day) => day.locationUnverified > 0) ?? [];
  const geofenceOn = summary?.policy.officeLat !== null && summary?.policy.officeLat !== undefined;

  const savePolicy = async () => {
    if (!draft) return;
    setSaving(true); setError('');
    try { await saveWorkPolicy(workspaceId, draft); setPolicyOpen(false); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '근무 정책을 저장하지 못했습니다.'); }
    finally { setSaving(false); }
  };

  const numberField = (label: string, key: keyof WorkPolicy, hint?: string) => (
    <label className="block text-xs font-bold text-slate-600">{label}
      <input type="number" min={0} value={Number(draft?.[key] ?? 0)}
        onChange={(event) => setDraft((current) => current && { ...current, [key]: Number(event.target.value) })}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" />
      {hint && <span className="mt-0.5 block text-[10px] font-normal text-slate-400">{hint}</span>}
    </label>
  );

  const timeField = (label: string, key: keyof WorkPolicy) => (
    <label className="block text-xs font-bold text-slate-600">{label}
      <input type="time" value={String(draft?.[key] ?? '').slice(0, 5)}
        onChange={(event) => setDraft((current) => current && { ...current, [key]: event.target.value })}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" />
    </label>
  );

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-black">근무시간 집계</h2>
          <p className="mt-1 text-xs text-slate-500">
            출근 기록의 <strong>도착 시각</strong>부터 퇴근 기록의 <strong>출발 시각</strong>까지를 근무시간으로 봅니다. 휴게는 정책값으로 자동 차감됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="시작일" className="h-10 rounded-lg border border-slate-300 px-2 text-xs" />
          <span className="text-xs text-slate-400">~</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="종료일" className="h-10 rounded-lg border border-slate-300 px-2 text-xs" />
          {members.length > 1 && org.departments.length > 0 && (
            <select value={department} onChange={(event) => { setDepartment(event.target.value); setMember(''); }}
              aria-label="부서" className="h-10 rounded-lg border border-slate-300 px-2 text-xs font-bold">
              <option value="">전체 부서</option>
              {org.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              <option value={NO_DEPARTMENT}>{UNASSIGNED}</option>
            </select>
          )}
          {members.length > 1 && (
            <select value={member} onChange={(event) => setMember(event.target.value)} aria-label="구성원" className="h-10 rounded-lg border border-slate-300 px-2 text-xs font-bold">
              <option value="">전체 구성원</option>
              {members.map((item) => <option key={item.userId} value={item.userId}>{item.nickname}</option>)}
            </select>
          )}
          <button type="button" onClick={() => void load()} aria-label="새로고침" className="grid size-10 place-items-center rounded-lg border border-slate-300"><RefreshCw size={16} /></button>
          {adminMode && (
            <button type="button" onClick={() => setPolicyOpen((open) => !open)} aria-expanded={policyOpen} className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold"><Settings2 size={15} />근무 정책</button>
          )}
          <button type="button" onClick={() => view && downloadCsv(`근태_${from}_${to}.csv`, attendanceCsv(view.days))} disabled={!view?.days.length} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#611f69] px-3 text-xs font-bold text-white disabled:opacity-40"><Download size={15} />CSV</button>
        </div>
      </header>

      {policyOpen && draft && (
        <div className="space-y-4 border-b border-slate-200 bg-slate-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {timeField('소정근로 시작', 'workStart')}
            {timeField('소정근로 종료', 'workEnd')}
            {numberField('1일 소정근로(분)', 'dailyRegularMinutes', '초과분은 연장근로로 계산됩니다')}
            {numberField('1주 소정근로(분)', 'weeklyRegularMinutes', '기본 2400분 = 40시간')}
            {numberField('1주 한도(분)', 'weeklyLimitMinutes', '기본 3120분 = 52시간, 넘으면 경고')}
            {numberField('휴게(분)', 'breakMinutes', '8시간 이상 근무 시 차감, 4시간 이상은 최대 30분')}
            {timeField('야간 시작', 'nightStart')}
            {timeField('야간 종료', 'nightEnd')}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <OfficeLocationPicker
              value={{ lat: draft.officeLat, lng: draft.officeLng, label: draft.officeLabel, radiusM: draft.officeRadiusM, accuracyM: draft.locationAccuracyM }}
              onChange={(next) => setDraft((current) => current && {
                ...current,
                officeLat: next.lat, officeLng: next.lng, officeLabel: next.label,
                officeRadiusM: next.radiusM, locationAccuracyM: next.accuracyM,
              })}
            />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => void savePolicy()} disabled={saving} className="h-10 flex-1 rounded-lg bg-blue-600 text-xs font-bold text-white disabled:opacity-50">{saving ? '저장 중…' : '정책 저장'}</button>
            <button type="button" onClick={() => { setPolicyOpen(false); setDraft(summary?.policy ?? null); }} className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold">취소</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}

      {loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="불러오는 중" /></div> : !summary ? null : (
        <>
          <div className={`grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-3 ${geofenceOn ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
            {[
              ['총 근무', formatMinutes(totals.worked)],
              ['연장', formatMinutes(totals.overtime)],
              ['야간', formatMinutes(totals.night)],
              ['휴일', formatMinutes(totals.holiday)],
              ['지각 일수', `${totals.late}일`],
              ['기록 미완료', `${totals.incomplete}일`],
              ...(geofenceOn ? [['위치 미인증', `${totals.unverified}일`]] : []),
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {unverifiedDays.length > 0 && (
            <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
              <ShieldAlert size={15} className="mt-px shrink-0" />
              <div className="min-w-0">
                <strong className="block">위치가 확인되지 않은 출퇴근이 {unverifiedDays.reduce((sum, day) => sum + day.locationUnverified, 0)}건 있습니다.</strong>
                <span className="block">사업장 반경 밖이거나 GPS를 잡지 못한 기록입니다. 기록 자체는 남아 있으니 확인 후 필요하면 근태 정정으로 바로잡아 주세요.</span>
                <span className="mt-1 block">
                  {unverifiedDays.slice(0, 8).map((day) => (
                    <span key={`${day.userId}-${day.date}`} className="mr-3 inline-block">
                      {day.nickname} · {day.date}
                      {day.locationMaxDistanceM !== null && ` (최대 ${formatDistance(day.locationMaxDistanceM)})`}
                    </span>
                  ))}
                  {unverifiedDays.length > 8 && <span className="text-amber-700">외 {unverifiedDays.length - 8}일</span>}
                </span>
              </div>
            </div>
          )}

          {overLimitWeeks.length > 0 && (
            <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
              <AlertTriangle size={15} className="mt-px shrink-0" />
              <div>
                <strong className="block">주 {formatHours(summary.policy.weeklyLimitMinutes)} 한도를 넘긴 주가 {overLimitWeeks.length}건 있습니다.</strong>
                {overLimitWeeks.map((week) => <span key={`${week.userId}-${week.weekStart}`} className="mr-3">{week.nickname} · {week.weekStart} 주 {formatHours(week.workedMinutes)}</span>)}
              </div>
            </div>
          )}

          {summary.weeks.length > 0 && (
            <div className="overflow-x-auto border-b border-slate-200">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="px-5 pt-4 text-left text-xs font-bold text-slate-500">주간 합계 (월요일 시작)</caption>
                <thead className="text-xs text-slate-500"><tr><th className="px-5 py-2">구성원</th><th className="px-4 py-2">주 시작</th><th className="px-4 py-2">근무</th><th className="px-4 py-2">연장</th><th className="px-4 py-2">한도</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.weeks.map((week) => (
                    <tr key={`${week.userId}-${week.weekStart}`} className={week.overLimit ? 'bg-amber-50/60' : ''}>
                      <td className="px-5 py-2 font-bold">{week.nickname}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{week.weekStart}</td>
                      <td className="px-4 py-2">{formatMinutes(week.workedMinutes)}</td>
                      <td className="px-4 py-2">{formatMinutes(week.overtimeMinutes)}</td>
                      <td className="px-4 py-2 text-xs font-bold">{week.overLimit ? <span className="text-red-700">초과</span> : <span className="text-slate-400">이내</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!view || view.days.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              {department ? '이 부서에는 해당 기간의 근태 기록이 없습니다.' : '이 기간에는 워크스페이스에 연결된 근태 기록이 없습니다.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <caption className="px-5 pt-4 text-left text-xs font-bold text-slate-500">일별 상세</caption>
                <thead className="text-xs text-slate-500"><tr>
                  <th className="px-5 py-2">날짜</th><th className="px-4 py-2">구성원</th>
                  {members.length > 1 && org.departments.length > 0 && <th className="px-4 py-2">부서</th>}
                  <th className="px-4 py-2">출근</th><th className="px-4 py-2">퇴근</th>
                  <th className="px-4 py-2">근무</th><th className="px-4 py-2">연장</th><th className="px-4 py-2">야간</th><th className="px-4 py-2">지각</th><th className="px-4 py-2">상태</th>
                  {geofenceOn && <th className="px-4 py-2">위치</th>}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {view.days.map((day) => (
                    <tr key={`${day.userId}-${day.date}`} className={day.isHoliday ? 'bg-slate-50/70' : ''}>
                      <td className="px-5 py-2 text-xs font-bold">{day.date}{day.isHoliday && <span className="ml-1 text-[10px] font-normal text-rose-600">{day.holidayName ?? '휴일'}</span>}</td>
                      <td className="px-4 py-2 text-xs">{day.nickname}{day.isRemote && <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">재택</span>}</td>
                      {members.length > 1 && org.departments.length > 0 && (
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {orgMap.get(day.userId)?.departmentName ?? <span className="text-slate-300">{UNASSIGNED}</span>}
                        </td>
                      )}
                      <td className="px-4 py-2 text-xs">{formatClock(day.workIn)}</td>
                      <td className="px-4 py-2 text-xs">{formatClock(day.workOut)}</td>
                      <td className="px-4 py-2 font-bold">{formatMinutes(day.workedMinutes)}</td>
                      <td className="px-4 py-2 text-xs">{day.overtimeMinutes ? formatMinutes(day.overtimeMinutes) : '-'}</td>
                      <td className="px-4 py-2 text-xs">{day.nightMinutes ? formatMinutes(day.nightMinutes) : '-'}</td>
                      <td className="px-4 py-2 text-xs">{day.lateMinutes ? `${day.lateMinutes}분` : '-'}</td>
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[day.status]}`}>{STATUS_LABEL[day.status]}</span></td>
                      {geofenceOn && (
                        <td className="px-4 py-2 text-xs">
                          {day.isRemote ? <span className="text-slate-400">재택</span>
                            : day.locationUnverified > 0
                              ? <span className="font-bold text-amber-800">미인증 {day.locationUnverified}건{day.locationMaxDistanceM !== null && ` · ${formatDistance(day.locationMaxDistanceM)}`}</span>
                              : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="px-5 py-3 text-[11px] text-slate-400">
            {adminMode && !geofenceOn && <span className="block font-bold text-amber-700">사업장 위치가 지정되지 않아 출근 위치 인증이 꺼져 있습니다 — &apos;근무 정책&apos;에서 지정하면 사무실 출퇴근을 반경 안에서만 인증합니다.</span>}
            등록된 공휴일은 휴일근로로 잡히고, 자정을 넘겨 퇴근한 날은 출근한 날의 근무로 귀속됩니다. 교대·유연근무제는 아직 반영되지 않습니다.
          </p>
        </>
      )}
    </section>
  );
}
