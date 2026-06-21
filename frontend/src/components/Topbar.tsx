import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  doctor: 'แพทย์',
  cro: 'เจ้าหน้าที่ CRO',
}

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { user, logout } = useAuth()

  return (
    <header className="border-b border-bbh-line bg-gradient-to-br from-white via-bbh-green-soft/80 to-bbh-green-soft px-8 py-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bbh-green">
            Better Being Hospital
          </p>
          <h1 className="auth-heading text-xl font-semibold leading-tight text-bbh-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-xs text-bbh-muted">{subtitle}</p> : null}
        </div>
        {user ? (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-bbh-ink">{user.display_name}</p>
              <p className="text-xs text-bbh-muted">{ROLE_LABELS[user.role]}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-bbh-green-soft text-sm font-semibold text-bbh-green-dark">
              {user.display_name.slice(0, 1)}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-bbh-line bg-white px-3 py-1.5 text-sm font-semibold text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green"
            >
              ออก
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
