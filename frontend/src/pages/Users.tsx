import { useEffect, useState } from 'react'
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
import { useAuth } from '../lib/auth'
import { useCreateUser } from '../hooks/useCreateUser'
import { useResetUserPassword } from '../hooks/useResetUserPassword'
import { useUpdateUser } from '../hooks/useUpdateUser'
import { useUsers, type UserOut } from '../hooks/useUsers'

const ROLES = ['admin', 'doctor', 'cro', 'nurse', 'lab_staff'] as const
const ROLE_LABELS: Record<string, string> = {
  admin: 'ผู้ดูแล',
  doctor: 'แพทย์',
  cro: 'CRO',
  nurse: 'พยาบาล',
  lab_staff: 'เจ้าหน้าที่แล็บ',
}

function RoleBadge({ role }: { role: string }) {
  const tone: Record<string, string> = {
    admin: 'border-red-200 bg-red-50 text-red-700',
    doctor: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
    cro: 'border-blue-200 bg-blue-50 text-blue-700',
    nurse: 'border-pink-200 bg-pink-50 text-pink-700',
    lab_staff: 'border-amber-200 bg-amber-50 text-amber-700',
  }
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tone[role] ?? 'border-bbh-line bg-bbh-surface text-bbh-muted'}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

export function Users() {
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

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-[20px] border border-bbh-line bg-white/90 p-4 shadow-bbh-card backdrop-blur md:rounded-[28px] md:p-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-green">User Management</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-bbh-ink md:text-3xl">ผู้ใช้ระบบ</h1>
          <p className="mt-1 text-sm text-bbh-muted">จัดการ admin / doctor / nurse / cro / lab_staff — เพิ่ม / แก้ไข / disable / reset password</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink hover:border-bbh-green"
          >
            <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-3 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark"
          >
            <UserPlus size={15} /> เพิ่ม user
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
        >
          <option value="">ทุก role</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value as typeof activeFilter); setPage(1) }}
          className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
        >
          <option value="all">Active + Disabled</option>
          <option value="active">Active เท่านั้น</option>
          <option value="inactive">Disabled เท่านั้น</option>
        </select>
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1) }}
          className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2"
        >
          <Search size={15} className="shrink-0 text-bbh-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้น email / display name"
            className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
          />
          {search ? (
            <button type="button" onClick={() => { setSearch(''); setSearchInput('') }} className="text-xs text-bbh-muted hover:text-bbh-ink">ล้าง</button>
          ) : null}
        </form>
      </div>

      {/* Table */}
      {q.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลด
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ</div>
      ) : !q.data || q.data.data.length === 0 ? (
        <div className="rounded-2xl border border-bbh-line bg-white p-10 text-center text-sm text-bbh-muted">ไม่พบผู้ใช้</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-sm">
          <div className="hidden grid-cols-[60px_1fr_2fr_120px_160px_120px_140px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-bbh-muted lg:grid">
            <span>ID</span>
            <span>ชื่อ</span>
            <span>Email</span>
            <span>Role</span>
            <span>Specialty</span>
            <span>สถานะ</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-bbh-line">
            {q.data.data.map((u) => {
              const isMe = me && me.id === u.id
              return (
                <div key={u.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 lg:grid-cols-[60px_1fr_2fr_120px_160px_120px_140px]">
                  <span className="hidden font-mono text-xs text-bbh-muted lg:block">{u.id}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-bbh-ink">
                      {u.display_name}
                      {isMe ? <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-bbh-green-dark">คุณ</span> : null}
                    </p>
                    <p className="truncate font-mono text-xs text-bbh-muted lg:hidden">{u.email}</p>
                  </div>
                  <span className="hidden truncate font-mono text-xs text-bbh-muted lg:block">{u.email}</span>
                  <span className="hidden lg:flex"><RoleBadge role={u.role} /></span>
                  <span className="hidden truncate text-xs text-bbh-muted lg:block">{u.specialty ?? '—'}</span>
                  <span className="hidden lg:flex">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-bbh-green/30 bg-bbh-green-soft px-2 py-0.5 text-xs font-semibold text-bbh-green-dark">
                        <CheckCircle2 size={11} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        <Ban size={11} /> Disabled
                      </span>
                    )}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditTarget(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
                      title="แก้ไข"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPwTarget(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
                      title="reset password"
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
        <div className="mt-4 flex items-center justify-between text-xs text-bbh-muted">
          <span>หน้า {q.data.pagination.page} / {q.data.pagination.total_pages} · {q.data.pagination.total} users</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-lg border border-bbh-line bg-white px-2 py-1 disabled:opacity-50">ก่อน</button>
            <button type="button" disabled={page >= q.data.pagination.total_pages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-bbh-line bg-white px-2 py-1 disabled:opacity-50">ถัดไป</button>
          </div>
        </div>
      ) : null}

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserModal target={editTarget} onClose={() => setEditTarget(null)} isSelf={Boolean(me && editTarget && me.id === editTarget.id)} />
      <ResetPasswordModal target={pwTarget} onClose={() => setPwTarget(null)} />
    </div>
  )
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <Modal open={open} title="เพิ่ม user ใหม่" onClose={() => { reset(); onClose() }} size="md">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-bbh-muted">Email *</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-semibold text-bbh-muted">ชื่อ-นามสกุล *</label>
          <input type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-bbh-muted">Role *</label>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof ROLES[number])} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-bbh-muted">Specialty</label>
            <input type="text" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="ถ้าเป็นแพทย์" className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-bbh-muted">Password *</label>
          <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none" />
          <p className="mt-1 text-[11px] text-bbh-muted">อย่างน้อย 10 ตัว + มี 3 ประเภทขึ้นไป (a-z, A-Z, 0-9, !@#) — บอก user ให้เปลี่ยนเองหลัง login</p>
        </div>
        {m.error ? <p className="text-xs text-red-600">สร้างไม่สำเร็จ — อาจเป็น email ซ้ำ</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => { reset(); onClose() }} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} สร้าง
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({ target, onClose, isSelf }: { target: UserOut | null; onClose: () => void; isSelf: boolean }) {
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
    <Modal open={Boolean(target)} title={`แก้ไข: ${target.display_name}`} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-lg bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">
          <span className="font-mono">{target.email}</span>
        </div>
        <div>
          <label className="text-xs font-semibold text-bbh-muted">ชื่อ-นามสกุล</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-bbh-muted">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof ROLES[number])} disabled={isSelf} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm disabled:bg-bbh-surface">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            {isSelf ? <p className="mt-1 text-[10px] text-bbh-muted">ห้ามเปลี่ยน role ตัวเอง</p> : null}
          </div>
          <div>
            <label className="text-xs font-semibold text-bbh-muted">Specialty</label>
            <input type="text" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none" />
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSelf} className="h-4 w-4 accent-bbh-green" />
          Active (ยังเข้าระบบได้)
          {isSelf ? <span className="ml-auto text-[10px] text-bbh-muted">ห้าม disable ตัวเอง</span> : null}
        </label>
        {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} บันทึก
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ target, onClose }: { target: UserOut | null; onClose: () => void }) {
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
    <Modal open={Boolean(target)} title={`Reset password: ${target.display_name}`} onClose={close} size="md">
      {done ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-bbh-green/30 bg-bbh-green-soft p-3 text-sm text-bbh-green-dark">
            <CheckCircle2 size={16} className="mr-1 inline" /> เปลี่ยน password เรียบร้อย — แจ้ง user ให้ใช้ password ใหม่
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={close} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ปิด</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-lg bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">
            <span className="font-mono">{target.email}</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-bbh-muted">Password ใหม่ *</label>
            <input type="text" required minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm font-mono focus:border-bbh-green focus:outline-none" placeholder="≥ 10 ตัว, 3 ประเภท" />
            <p className="mt-1 text-[11px] text-bbh-muted">แสดงเป็น plain เพื่อให้ admin copy ส่งให้ user — บอก user เปลี่ยนเองหลัง login</p>
          </div>
          {m.error ? <p className="text-xs text-red-600">เปลี่ยนไม่สำเร็จ</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
            <button type="submit" disabled={m.isPending} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
              {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} ตั้งค่า
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
