import { useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle, Clock, KeyRound, LogOut, ShieldCheck, XCircle } from 'lucide-react'

// import { TotpSection } from '../components/auth/TotpSection'  // 2FA disabled — uncomment when ready
import { useChangePassword } from '../hooks/useChangePassword'
import { useMyAuditLogs } from '../hooks/useMyAuditLogs'
import { useToast } from '../hooks/useToast'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  doctor: 'แพทย์',
  cro: 'เจ้าหน้าที่ CRO',
  nurse: 'พยาบาล',
  lab_staff: 'เจ้าหน้าที่แล็บ',
}

const EVENT_LABELS: Record<string, string> = {
  login_success: 'เข้าสู่ระบบสำเร็จ',
  login_fail: 'เข้าสู่ระบบไม่สำเร็จ',
  logout: 'ออกจากระบบ',
  password_change: 'เปลี่ยนรหัสผ่าน',
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function Account() {
  const { user, logout } = useAuth()
  const audit = useMyAuditLogs(15)
  const change = useChangePassword()
  const toast = useToast()

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)

  if (!user) return null

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPwError(null)
    if (newPw.length < 10) {
      setPwError('รหัสผ่านใหม่ต้องอย่างน้อย 10 ตัวอักษร')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('รหัสผ่านยืนยันไม่ตรงกัน')
      return
    }
    try {
      await change.mutateAsync({ old_password: oldPw, new_password: newPw })
      toast.show('success', 'เปลี่ยนรหัสผ่านสำเร็จ')
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
      void audit.refetch()
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-6">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_1.2fr]">

        {/* ── Profile ── */}
        <section className="space-y-6">
          <div className="rounded-3xl border border-bbh-line bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-bbh-green-soft text-xl font-semibold text-bbh-green-dark">
                {user.display_name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-xl font-semibold text-bbh-ink">
                  {user.display_name}
                </p>
                <p className="truncate text-sm text-bbh-muted">{user.email}</p>
              </div>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between border-t border-bbh-line pt-3">
                <dt className="text-bbh-muted">บทบาท</dt>
                <dd className="font-semibold text-bbh-ink">{ROLE_LABELS[user.role]}</dd>
              </div>
              {user.specialty ? (
                <div className="flex justify-between">
                  <dt className="text-bbh-muted">ความเชี่ยวชาญ</dt>
                  <dd className="font-semibold text-bbh-ink">{user.specialty}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-bbh-muted">เข้าใช้งานล่าสุด</dt>
                <dd className="font-semibold text-bbh-ink">
                  {formatDateTime(user.last_login_at)}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => void logout()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-bbh-line px-4 py-2.5 text-sm font-semibold text-bbh-muted transition hover:border-red-300 hover:text-red-600"
            >
              <LogOut size={16} />
              ออกจากระบบ
            </button>
          </div>

          {/* ── 2FA ── (disabled — uncomment when ready) */}
          {/* <TotpSection /> */}

          {/* ── Change password ── */}
          <div className="rounded-3xl border border-bbh-line bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound size={18} className="text-bbh-green" />
              <h2 className="font-serif text-lg font-semibold text-bbh-ink">เปลี่ยนรหัสผ่าน</h2>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <label className="block">
                <span className="text-sm text-bbh-muted">รหัสผ่านเดิม</span>
                <input
                  type="password"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  required
                  className="mt-1 h-12 w-full rounded-xl border border-bbh-line bg-white px-3 text-sm outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
                />
              </label>
              <label className="block">
                <span className="text-sm text-bbh-muted">รหัสผ่านใหม่ (อย่างน้อย 10 ตัว)</span>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  minLength={10}
                  className="mt-1 h-11 w-full rounded-xl border border-bbh-line bg-white px-3 text-sm outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
                />
              </label>
              <label className="block">
                <span className="text-sm text-bbh-muted">ยืนยันรหัสผ่านใหม่</span>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  minLength={10}
                  className="mt-1 h-11 w-full rounded-xl border border-bbh-line bg-white px-3 text-sm outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
                />
              </label>

              {pwError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {pwError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={change.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-bbh-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-bbh-green-dark disabled:opacity-60"
              >
                <ShieldCheck size={16} />
                {change.isPending ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
              </button>
            </form>
          </div>
        </section>

        {/* ── Activity log ── */}
        <section className="rounded-3xl border border-bbh-line bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} className="text-bbh-green" />
            <h2 className="font-serif text-lg font-semibold text-bbh-ink">กิจกรรมล่าสุด</h2>
          </div>

          {audit.isLoading ? (
            <p className="py-8 text-center text-sm text-bbh-muted">กำลังโหลด...</p>
          ) : audit.isError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              โหลดประวัติไม่สำเร็จ
            </p>
          ) : (audit.data?.data.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-bbh-muted">ยังไม่มีประวัติ</p>
          ) : (
            <ul className="divide-y divide-bbh-line">
              {audit.data?.data.map((log) => {
                const isFail = log.event_type === 'login_fail'
                return (
                  <li key={log.id} className="flex items-start gap-3 py-3 text-sm">
                    {isFail ? (
                      <XCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                    ) : (
                      <CheckCircle size={16} className="mt-0.5 shrink-0 text-bbh-green" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-bbh-ink">
                        {EVENT_LABELS[log.event_type] ?? log.event_type}
                        {log.fail_reason ? ` · ${log.fail_reason}` : ''}
                      </p>
                      <p className="text-xs text-bbh-muted">
                        {formatDateTime(log.created_at)}
                        {log.ip_address ? ` · IP ${log.ip_address}` : ''}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
