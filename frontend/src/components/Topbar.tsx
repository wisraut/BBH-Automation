import { Menu } from 'lucide-react'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  doctor: 'แพทย์',
  cro: 'เจ้าหน้าที่ CRO',
  nurse: 'พยาบาล',
  lab_staff: 'เจ้าหน้าที่แล็บ',
}

interface TopbarProps {
  title: string
  subtitle?: string
  onMenuClick?: () => void
}

export function Topbar({ title, subtitle, onMenuClick }: TopbarProps) {
  const { user, logout } = useAuth()

  return (
    <header className="border-b border-bbh-line bg-gradient-to-br from-white via-bbh-green-soft/80 to-bbh-green-soft px-3 py-2.5 shadow-sm md:px-5 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-bbh-line bg-white/80 text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green lg:hidden"
            aria-label="เปิดเมนู"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bbh-green">
            Better Being Hospital
          </p>
          <h1 className="auth-heading truncate text-lg font-semibold leading-tight text-bbh-ink md:text-xl lg:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 hidden truncate text-xs text-bbh-muted md:block">{subtitle}</p> : null}
          </div>
        </div>
        {user ? (
          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-bbh-ink">{user.display_name}</p>
              <p className="hidden text-xs text-bbh-muted md:block">{ROLE_LABELS[user.role]}</p>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bbh-green-soft text-sm font-semibold text-bbh-green-dark">
              {user.display_name.slice(0, 1)}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-bbh-line bg-white px-2.5 py-1.5 text-sm font-semibold text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green sm:px-3"
            >
              ออก
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
