import { ArrowLeft, Menu } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  doctor: 'แพทย์',
  cro: 'เจ้าหน้าที่ CRO',
  nurse: 'พยาบาล',
  lab_staff: 'เจ้าหน้าที่แล็บ',
}

const VIEW_AS_SHORT: Record<Role, string> = {
  admin: 'Admin',
  cro: 'CRO',
  doctor: 'Doctor',
  nurse: 'Nurse',
  lab_staff: 'Lab',
}

interface TopbarProps {
  title: string
  subtitle?: string
  onMenuClick?: () => void
  viewAs?: Role | null
}

export function Topbar({ title, subtitle, onMenuClick, viewAs }: TopbarProps) {
  const { user, logout } = useAuth()
  const showBackToAdmin = Boolean(viewAs && user?.role === 'admin')

  return (
    <header className="border-b border-bbh-line bg-white px-3 py-2.5 md:px-5 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-bbh-line bg-white text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:hidden"
            aria-label="เปิดเมนู"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-bbh-green">
            Better Being Hospital
          </p>
          <h1 className="truncate font-serif text-lg font-semibold leading-tight text-bbh-ink md:text-xl lg:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 hidden truncate text-xs text-bbh-muted md:block">{subtitle}</p> : null}
          </div>
        </div>
        {user ? (
          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            {showBackToAdmin && viewAs ? (
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-xl border border-bbh-green/40 bg-white px-3 py-1.5 text-sm font-semibold text-bbh-green-dark transition-all duration-200 hover:border-bbh-green hover:bg-bbh-green-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                title="กลับหน้า Admin"
              >
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">กลับ Admin</span>
                <span className="hidden rounded-full bg-bbh-green-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bbh-green-dark md:inline">
                  ดูในมุม {VIEW_AS_SHORT[viewAs]}
                </span>
              </Link>
            ) : null}
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
              className="rounded-xl border border-bbh-line bg-white px-2.5 py-1.5 text-sm font-semibold text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:px-3"
            >
              ออก
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
