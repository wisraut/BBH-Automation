import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
} from 'lucide-react'

import { Modal } from '../components/Modal'
import { SkeletonList } from '../components/ui/Skeleton'
import { staggerStyle } from '../lib/motion'
import { Eyebrow } from '../components/ui/Eyebrow'
import { useAuth } from '../lib/auth'
import { useCreateUser } from '../hooks/useCreateUser'
import { useResetUserPassword } from '../hooks/useResetUserPassword'
import { useUpdateUser } from '../hooks/useUpdateUser'
import { useUsers, type UserOut } from '../hooks/useUsers'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const ROLES = ['admin', 'doctor', 'cro', 'nurse', 'lab_staff'] as const

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation()
  // admin = highest privilege (red = attention), doctor = clinical/brand (green);
  // the rest are neutral and identified by their text label (palette discipline —
  // BBH tokens don't carry 5 distinct hues, and role text already disambiguates).
  const tone: Record<string, string> = {
    admin: 'border-red-200 bg-red-50 text-red-700',
    doctor: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
    cro: 'border-bbh-line bg-bbh-surface text-bbh-muted',
    nurse: 'border-bbh-line bg-bbh-surface text-bbh-muted',
    lab_staff: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  }
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tone[role] ?? 'border-bbh-line bg-bbh-surface text-bbh-muted'}`}>
      {t(`roleShort.${role}`, role)}
    </span>
  )
}

// หน้าจัดการผู้ใช้ระบบ (admin เท่านั้น) — สร้าง/แก้ไข staff account และกำหนด role
// (admin/doctor/nurse/cro/lab_staff) ที่คุมสิทธิ์การเข้าถึงแต่ละหน้า
export function Users() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const q = useUsers({
    role: roleFilter || undefined,
    isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
    search: search || undefined,
    page,
    limit: 30,
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserOut | null>(null)
  const [pwTarget, setPwTarget] = useState<UserOut | null>(null)

  const fieldClass = `rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 ${FOCUS_RING}`

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label + serif heading, primary actions on the right */}
        <div className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>User Management</Eyebrow>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('users.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('users.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => q.refetch()}
              className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
              {t('users.refresh')}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className={`inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
            >
              <UserPlus size={15} /> {t('users.addUser')}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="animate-rise mb-6 flex flex-wrap items-center gap-2" style={{ animationDelay: '70ms' }}>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
            className={fieldClass}
          >
            <option value="">{t('users.allRoles')}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`roleShort.${r}`, r)}</option>)}
          </select>
          <select
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value as typeof activeFilter); setPage(1) }}
            className={fieldClass}
          >
            <option value="all">{t('users.filterAll')}</option>
            <option value="active">{t('users.filterActiveOnly')}</option>
            <option value="inactive">{t('users.filterDisabledOnly')}</option>
          </select>
          <form
            onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1) }}
            className={`flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 transition-colors duration-200 focus-within:border-bbh-green focus-within:ring-2 focus-within:ring-bbh-green/30`}
          >
            <Search size={15} className="shrink-0 text-bbh-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-sm text-bbh-ink focus:outline-none"
            />
            {search ? (
              <button type="button" onClick={() => { setSearch(''); setSearchInput('') }} className={`rounded text-xs text-bbh-muted transition-colors hover:text-bbh-ink ${FOCUS_RING}`}>{t('users.clear')}</button>
            ) : null}
          </form>
        </div>

        {/* Table */}
        <div className="animate-rise" style={{ animationDelay: '140ms' }}>
          {q.isLoading ? (
            <SkeletonList rows={6} rowClassName="h-12 rounded-lg" className="space-y-2" />
          ) : q.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t('common.loadFailed')}</div>
          ) : !q.data || q.data.data.length === 0 ? (
            <div className="rounded-xl border border-bbh-line bg-white p-10 text-center text-sm text-bbh-muted">{t('users.notFound')}</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
              <div className="hidden grid-cols-[60px_1fr_2fr_120px_160px_120px_140px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.22em] text-bbh-muted lg:grid">
                <span>{t('users.colId')}</span>
                <span>{t('users.colName')}</span>
                <span>{t('users.colEmail')}</span>
                <span>{t('users.colRole')}</span>
                <span>{t('users.colSpecialty')}</span>
                <span>{t('users.colStatus')}</span>
                <span className="text-right">{t('users.colActions')}</span>
              </div>
              <div className="divide-y divide-bbh-line">
                {q.data.data.map((u, i) => {
                  const isMe = me && me.id === u.id
                  return (
                    <div
                      key={u.id}
                      style={staggerStyle(i)}
                      className="animate-rise grid grid-cols-[1fr_auto] gap-3 bg-white px-4 py-3 transition-colors duration-200 hover:bg-bbh-surface lg:grid-cols-[60px_1fr_2fr_120px_160px_120px_140px]"
                    >
                      <span className="hidden font-mono text-xs tabular-nums text-bbh-muted lg:block">{u.id}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-bbh-ink">
                          {u.display_name}
                          {isMe ? <span className="ml-2 text-xs font-bold uppercase tracking-wider text-bbh-green-dark">{t('users.you')}</span> : null}
                        </p>
                        <p className="truncate font-mono text-xs text-bbh-muted lg:hidden">{u.email}</p>
                      </div>
                      <span className="hidden truncate font-mono text-xs text-bbh-muted lg:block">{u.email}</span>
                      <span className="hidden lg:flex"><RoleBadge role={u.role} /></span>
                      <span className="hidden truncate text-xs text-bbh-muted lg:block">{u.specialty ?? '—'}</span>
                      <span className="hidden lg:flex">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-bbh-green/30 bg-bbh-green-soft px-2 py-0.5 text-xs font-semibold text-bbh-green-dark">
                            <CheckCircle2 size={11} /> {t('users.statusActive')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            <Ban size={11} /> {t('users.statusDisabled')}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditTarget(u)}
                          className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          title={t('common.edit')}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPwTarget(u)}
                          className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          title={t('users.resetPassword')}
                        >
                          <KeyRound size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pagination */}
          {q.data && q.data.pagination.total_pages > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-sm tabular-nums text-bbh-muted">{t('users.pageInfo', { page: q.data.pagination.page, totalPages: q.data.pagination.total_pages, total: q.data.pagination.total })}</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}>{t('users.prev')}</button>
                <button type="button" disabled={page >= q.data.pagination.total_pages} onClick={() => setPage(p => p + 1)} className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}>{t('users.next')}</button>
              </div>
            </div>
          ) : null}
        </div>

        <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
        <EditUserModal target={editTarget} onClose={() => setEditTarget(null)} isSelf={Boolean(me && editTarget && me.id === editTarget.id)} />
        <ResetPasswordModal target={pwTarget} onClose={() => setPwTarget(null)} />
      </section>
    </div>
  )
}

const MODAL_FIELD =
  'mt-1 w-full rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

const MODAL_CANCEL =
  'rounded-lg border border-bbh-line bg-white px-4 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const MODAL_SUBMIT =
  'inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const m = useCreateUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<typeof ROLES[number]>('doctor')
  const [specialty, setSpecialty] = useState('')

  const reset = () => { setEmail(''); setPassword(''); setDisplayName(''); setRole('doctor'); setSpecialty(''); m.reset() }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    m.mutate(
      { email, password, display_name: displayName, role, specialty: specialty || null },
      { onSuccess: () => { reset(); onClose() } },
    )
  }

  return (
    <Modal open={open} title={t('users.createTitle')} onClose={() => { reset(); onClose() }} size="md">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-bbh-muted">{t('users.emailRequired')}</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={MODAL_FIELD} />
        </div>
        <div>
          <label className="text-xs font-semibold text-bbh-muted">{t('users.fullNameRequired')}</label>
          <input type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={MODAL_FIELD} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-bbh-muted">{t('users.roleRequired')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof ROLES[number])} className={MODAL_FIELD}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roleShort.${r}`, r)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-bbh-muted">{t('users.specialty')}</label>
            <input type="text" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder={t('users.specialtyPlaceholder')} className={MODAL_FIELD} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-bbh-muted">{t('users.passwordRequired')}</label>
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className={MODAL_FIELD} />
          <p className="mt-1 text-xs text-bbh-muted">{t('users.passwordHint')}</p>
        </div>
        {m.error ? <p className="text-xs text-red-600">{t('users.createFailed')}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => { reset(); onClose() }} className={MODAL_CANCEL}>{t('common.cancel')}</button>
          <button type="submit" disabled={m.isPending} className={MODAL_SUBMIT}>
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('users.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({ target, onClose, isSelf }: { target: UserOut | null; onClose: () => void; isSelf: boolean }) {
  const { t } = useTranslation()
  const m = useUpdateUser()
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<typeof ROLES[number]>('doctor')
  const [specialty, setSpecialty] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Sync local form state when a new target is selected.
  useEffect(() => {
    if (!target) return
    setDisplayName(target.display_name)
    setRole(target.role as typeof ROLES[number])
    setSpecialty(target.specialty ?? '')
    setIsActive(target.is_active)
  }, [target])

  if (!target) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    m.mutate(
      { id: target.id, body: { display_name: displayName, role, specialty: specialty || null, is_active: isActive } },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal open={Boolean(target)} title={t('users.editTitle', { name: target.display_name })} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-lg bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">
          <span className="font-mono">{target.email}</span>
        </div>
        <div>
          <label className="text-xs font-semibold text-bbh-muted">{t('users.fullName')}</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={MODAL_FIELD} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-bbh-muted">{t('users.role')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof ROLES[number])} disabled={isSelf} className={`${MODAL_FIELD} disabled:bg-bbh-surface`}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roleShort.${r}`, r)}</option>)}
            </select>
            {isSelf ? <p className="mt-1 text-xs text-bbh-muted">{t('users.cannotChangeOwnRole')}</p> : null}
          </div>
          <div>
            <label className="text-xs font-semibold text-bbh-muted">{t('users.specialty')}</label>
            <input type="text" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={MODAL_FIELD} />
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSelf} className="h-4 w-4 accent-bbh-green" />
          {t('users.activeCanLogin')}
          {isSelf ? <span className="ml-auto text-xs text-bbh-muted">{t('users.cannotDisableSelf')}</span> : null}
        </label>
        {m.error ? <p className="text-xs text-red-600">{t('users.saveFailed')}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={MODAL_CANCEL}>{t('common.cancel')}</button>
          <button type="submit" disabled={m.isPending} className={MODAL_SUBMIT}>
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ target, onClose }: { target: UserOut | null; onClose: () => void }) {
  const { t } = useTranslation()
  const m = useResetUserPassword()
  const [pw, setPw] = useState('')
  const [done, setDone] = useState(false)

  if (!target) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    m.mutate({ id: target.id, newPassword: pw }, { onSuccess: () => { setDone(true) } })
  }

  const close = () => { setPw(''); setDone(false); m.reset(); onClose() }

  return (
    <Modal open={Boolean(target)} title={t('users.resetTitle', { name: target.display_name })} onClose={close} size="md">
      {done ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-bbh-green/30 bg-bbh-green-soft p-3 text-sm text-bbh-green-dark">
            <CheckCircle2 size={16} className="mr-1 inline" /> {t('users.resetDone')}
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={close} className={MODAL_CANCEL}>{t('common.close')}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-lg bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">
            <span className="font-mono">{target.email}</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-bbh-muted">{t('users.newPasswordRequired')}</label>
            <input type="text" required minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} className={`${MODAL_FIELD} font-mono`} placeholder={t('users.newPasswordPlaceholder')} />
            <p className="mt-1 text-xs text-bbh-muted">{t('users.resetHint')}</p>
          </div>
          {m.error ? <p className="text-xs text-red-600">{t('users.resetFailed')}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} className={MODAL_CANCEL}>{t('common.cancel')}</button>
            <button type="submit" disabled={m.isPending} className={MODAL_SUBMIT}>
              {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} {t('users.setPassword')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
