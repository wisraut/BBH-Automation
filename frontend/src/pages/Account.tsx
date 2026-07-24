import { useEffect, useState } from 'react'
import { dateLocale } from '../i18n/datetime'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CheckCircle, Clock, Copy, KeyRound, Link2, LogOut, ShieldCheck, XCircle } from 'lucide-react'

import { Eyebrow } from '../components/ui/Eyebrow'
import { useAccountSettings, useSaveAccountSettings } from '../hooks/useAccountSettings'
import { useChangePassword } from '../hooks/useChangePassword'
import { useMyAuditLogs } from '../hooks/useMyAuditLogs'
import { useToast } from '../hooks/useToast'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

// Shared input treatment — hairline field, green focus ring.
const FIELD_CLASS =
  'mt-1.5 h-11 w-full rounded-lg border border-bbh-line bg-white px-3 text-sm outline-none transition-colors duration-200 focus:border-bbh-green focus:ring-2 focus:ring-bbh-green/30'

// จัดรูปแบบ ISO timestamp เป็นวัน-เวลาแบบย่อ ตาม locale ที่ผู้ใช้เลือก (ไทย/อังกฤษ)
function formatDateTime(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(dateLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// หน้าตั้งค่าบัญชีของผู้ใช้ที่ login อยู่ (ทุก role) — เปลี่ยนรหัสผ่าน, ดูข้อมูลบัญชี,
// ดู audit log ของตัวเอง และปุ่ม logout
export function Account() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const audit = useMyAuditLogs(15)
  const change = useChangePassword()
  const toast = useToast()

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)

  const settingsQ = useAccountSettings()
  const saveSettings = useSaveAccountSettings()
  const [notebookUrl, setNotebookUrl] = useState('')
  const [summaryEmail, setSummaryEmail] = useState('')
  const [calendarId, setCalendarId] = useState('')
  const [copiedEmail, setCopiedEmail] = useState(false)
  useEffect(() => {
    if (settingsQ.data) {
      setNotebookUrl(settingsQ.data.notebooklm_url ?? '')
      setSummaryEmail(settingsQ.data.summary_email ?? '')
      setCalendarId(settingsQ.data.google_calendar_id ?? '')
    }
  }, [settingsQ.data])

  if (!user) return null

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveSettings.mutateAsync({
        notebooklm_url: notebookUrl.trim() || null,
        summary_email: summaryEmail.trim() || null,
        google_calendar_id: calendarId.trim() || null,
      })
      toast.show('success', t('account.integrationsSaved'))
    } catch (err) {
      toast.show('error', err instanceof ApiError ? err.message : t('account.saveFailed'))
    }
  }

  function copyServiceEmail(email: string) {
    void navigator.clipboard.writeText(email).then(
      () => { setCopiedEmail(true); window.setTimeout(() => setCopiedEmail(false), 1800) },
      () => toast.show('error', t('account.copyFailed')),
    )
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPwError(null)
    if (newPw.length < 10) {
      setPwError(t('account.pwTooShort'))
      return
    }
    if (newPw !== confirmPw) {
      setPwError(t('account.pwMismatch'))
      return
    }
    try {
      await change.mutateAsync({ old_password: oldPw, new_password: newPw })
      toast.show('success', t('account.pwChanged'))
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
      void audit.refetch()
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : t('account.pwChangeFailed'))
    }
  }

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label + serif heading */}
        <div className="animate-rise mb-10">
          <Eyebrow>Account</Eyebrow>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('account.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
            {t('account.subtitle')}
          </p>
        </div>

        <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* ── Profile + Change password ── */}
          <div className="space-y-6">
            {/* Profile */}
            <section className="animate-rise rounded-xl border border-bbh-line bg-white p-6" style={{ animationDelay: '70ms' }}>
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-bbh-green-soft font-serif text-xl font-semibold text-bbh-green-dark">
                  {user.display_name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-xl font-semibold text-bbh-ink">
                    {user.display_name}
                  </p>
                  <p className="truncate text-sm text-bbh-muted">{user.email}</p>
                </div>
              </div>
              <dl className="mt-6 divide-y divide-bbh-line text-sm">
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-bbh-muted">{t('account.role')}</dt>
                  <dd className="font-semibold text-bbh-ink">{t(`roles.${user.role}`, user.role)}</dd>
                </div>
                {user.specialty ? (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-bbh-muted">{t('account.specialty')}</dt>
                    <dd className="font-semibold text-bbh-ink">{user.specialty}</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="text-bbh-muted">{t('account.lastLogin')}</dt>
                  <dd className="font-mono text-sm tabular-nums text-bbh-ink">
                    {formatDateTime(user.last_login_at)}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => void logout()}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-4 py-2.5 text-sm font-semibold text-bbh-muted transition-colors duration-200 hover:border-red-300 hover:text-red-600 ${FOCUS_RING}`}
              >
                <LogOut size={16} />
                {t('account.logout')}
              </button>
            </section>

            {/* Change password */}
            <section className="animate-rise rounded-xl border border-bbh-line bg-white p-6" style={{ animationDelay: '140ms' }}>
              <div className="mb-4 flex items-center gap-2">
                <KeyRound size={18} className="text-bbh-green" />
                <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('account.changePassword')}</h2>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <label className="block">
                  <span className="text-sm text-bbh-muted">{t('account.currentPassword')}</span>
                  <input
                    type="password"
                    value={oldPw}
                    onChange={(e) => setOldPw(e.target.value)}
                    required
                    className={`${FIELD_CLASS} ${FOCUS_RING}`}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-bbh-muted">{t('account.newPassword')}</span>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    minLength={10}
                    className={`${FIELD_CLASS} ${FOCUS_RING}`}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-bbh-muted">{t('account.confirmNewPassword')}</span>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                    minLength={10}
                    className={`${FIELD_CLASS} ${FOCUS_RING}`}
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
                  className={`flex w-full items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
                >
                  <ShieldCheck size={16} />
                  {change.isPending ? t('common.saving') : t('account.savePassword')}
                </button>
              </form>
            </section>

            {/* Personal integrations — per-user unique links (NotebookLM, ...) */}
            <section className="animate-rise rounded-xl border border-bbh-line bg-white p-6" style={{ animationDelay: '210ms' }}>
              <div className="mb-2 flex items-center gap-2">
                <Link2 size={18} className="text-bbh-green" />
                <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('account.personalIntegrations')}</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-bbh-muted">
                {t('account.integrationsDesc')}
              </p>
              <form onSubmit={handleSaveSettings} className="space-y-3">
                <label className="block">
                  <span className="text-sm text-bbh-muted">{t('account.notebookUrl')}</span>
                  <input
                    type="url"
                    value={notebookUrl}
                    onChange={(e) => setNotebookUrl(e.target.value)}
                    placeholder="https://notebooklm.google.com/notebook/..."
                    className={`${FIELD_CLASS} ${FOCUS_RING}`}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-bbh-muted">{t('account.summaryEmail')}</span>
                  <input
                    type="email"
                    value={summaryEmail}
                    onChange={(e) => setSummaryEmail(e.target.value)}
                    placeholder="soap-inbox@gmail.com"
                    className={`${FIELD_CLASS} ${FOCUS_RING}`}
                  />
                  <span className="mt-1 block text-xs text-bbh-muted">{t('account.summaryEmailHint')}</span>
                </label>
                <label className="block">
                  <span className="text-sm text-bbh-muted">{t('account.calendarId')}</span>
                  <input
                    type="text"
                    value={calendarId}
                    onChange={(e) => setCalendarId(e.target.value)}
                    placeholder="you@gmail.com"
                    className={`${FIELD_CLASS} ${FOCUS_RING}`}
                  />
                </label>
                {settingsQ.data?.service_account_email ? (
                  <div className="rounded-lg border border-bbh-line bg-bbh-surface px-3 py-2.5">
                    <p className="text-xs leading-relaxed text-bbh-muted">
                      {t('account.calendarShareHint')}
                    </p>
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-bbh-line bg-white px-2.5 py-1.5">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-bbh-ink">{settingsQ.data.service_account_email}</span>
                      <button
                        type="button"
                        onClick={() => copyServiceEmail(settingsQ.data!.service_account_email!)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors duration-200 ${copiedEmail ? 'bg-bbh-green-soft text-bbh-green-dark' : 'bg-bbh-green text-white hover:bg-bbh-green-dark'} ${FOCUS_RING}`}
                      >
                        {copiedEmail ? <><Check size={13} /> {t('account.copied')}</> : <><Copy size={13} /> {t('account.copy')}</>}
                      </button>
                    </div>
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={saveSettings.isPending || settingsQ.isLoading}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
                >
                  {saveSettings.isPending ? t('common.saving') : t('common.save')}
                </button>
              </form>
            </section>
          </div>

          {/* ── Activity log ── */}
          <section className="animate-rise rounded-xl border border-bbh-line bg-white p-6" style={{ animationDelay: '210ms' }}>
            <div className="mb-4 flex items-center gap-2">
              <Clock size={18} className="text-bbh-green" />
              <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('account.recentActivity')}</h2>
            </div>

            {audit.isLoading ? (
              <p className="py-8 text-center text-sm text-bbh-muted">{t('common.loading')}</p>
            ) : audit.isError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {t('account.historyLoadFailed')}
              </p>
            ) : (audit.data?.data.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-bbh-muted">{t('account.noHistory')}</p>
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
                          {t(`account.event.${log.event_type}`, log.event_type)}
                          {log.fail_reason ? ` · ${log.fail_reason}` : ''}
                        </p>
                        <p className="mt-0.5 font-mono text-xs tabular-nums text-bbh-muted">
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
      </section>
    </div>
  )
}
