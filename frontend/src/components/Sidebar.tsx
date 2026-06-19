import type { Role } from '../lib/auth'
import bbhDashboardLogo from '../assets/bbh-logo-dashboard.png'

export type PageKey =
  | 'bookings'
  | 'new-booking'
  | 'calendar'
  | 'schedule'
  | 'patients'
  | 'reports'
  | 'ai'
  | 'users'
  | 'system-health'
  | 'account'

interface NavItem {
  key: PageKey
  label: string
  roles: Role[]
}

const NAV: NavItem[] = [
  { key: 'bookings', label: 'การจอง', roles: ['cro', 'admin'] },
  { key: 'calendar', label: 'ปฏิทิน', roles: ['cro', 'admin'] },
  { key: 'schedule', label: 'ตารางงาน', roles: ['doctor', 'admin'] },
  { key: 'patients', label: 'คนไข้', roles: ['cro', 'doctor', 'admin'] },
  { key: 'reports', label: 'รายงาน', roles: ['doctor', 'admin'] },
  { key: 'ai', label: 'AI Assistant', roles: ['cro', 'doctor', 'admin'] },
  { key: 'users', label: 'ผู้ใช้', roles: ['admin'] },
  { key: 'system-health', label: 'สถานะระบบ', roles: ['admin'] },
  { key: 'account', label: 'บัญชี', roles: ['cro', 'doctor', 'admin'] },
]

interface SidebarProps {
  role: Role
  current: PageKey
  onNavigate: (page: PageKey) => void
}

export function Sidebar({ role, current, onNavigate }: SidebarProps) {
  const items = NAV.filter((item) => item.roles.includes(role))

  return (
    <aside className="flex h-full w-64 flex-col border-r border-bbh-line bg-white/90 shadow-bbh-card backdrop-blur">
      <div className="border-b border-bbh-line px-6 py-6">
        <div className="flex items-center gap-3">
          <img
            src={bbhDashboardLogo}
            alt="Better Being Hospital"
            className="h-11 w-11 object-contain"
          />
          <div>
            <p className="font-serif text-lg font-semibold leading-none text-bbh-ink">BBH</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-bbh-muted">Portal</p>
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-bbh-green-soft">
          <div className="h-full w-2/3 rounded-full bg-bbh-green" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        {items.map((item) => {
          const active = item.key === current
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`mb-1.5 flex w-full items-center rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                active
                  ? 'bg-bbh-green text-white shadow-lg shadow-bbh-green/20'
                  : 'text-bbh-muted hover:bg-bbh-green-soft hover:text-bbh-green-dark'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
