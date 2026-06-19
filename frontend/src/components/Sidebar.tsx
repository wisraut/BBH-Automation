import type { Role } from '../lib/auth'

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
  { key: 'new-booking', label: 'จองใหม่', roles: ['cro', 'admin'] },
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
    <aside className="flex h-full w-60 flex-col border-r border-bbh-line bg-white">
      <div className="flex items-center gap-3 border-b border-bbh-line px-6 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-bbh-green text-white">
          <span className="font-serif text-base font-semibold">B</span>
        </div>
        <div>
          <p className="font-serif text-lg font-semibold leading-none text-bbh-ink">BBH</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-bbh-muted">Portal</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = item.key === current
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`mb-1 flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                active
                  ? 'bg-bbh-green-soft text-bbh-green-dark'
                  : 'text-bbh-muted hover:bg-bbh-surface hover:text-bbh-ink'
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
