import { NavLink } from 'react-router-dom'
import {
  Activity,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
  UserCircle,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Role } from '../lib/auth'
import bbhDashboardLogo from '../assets/bbh-logo-dashboard.png'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

const NAV: NavItem[] = [
  { to: '/bookings', label: 'การจอง', icon: ClipboardList, roles: ['cro', 'admin'] },
  { to: '/calendar', label: 'ปฏิทิน', icon: CalendarDays, roles: ['cro', 'admin'] },
  { to: '/schedule', label: 'ตารางงาน', icon: CalendarClock, roles: ['doctor', 'admin'] },
  { to: '/patients', label: 'คนไข้', icon: Users, roles: ['cro', 'doctor', 'admin'] },
  { to: '/reports', label: 'รายงาน', icon: FileText, roles: ['doctor', 'admin'] },
  { to: '/ai', label: 'AI Assistant', icon: MessageCircle, roles: ['cro', 'doctor', 'admin'] },
  { to: '/users', label: 'ผู้ใช้', icon: UserCog, roles: ['admin'] },
  { to: '/system-health', label: 'สถานะระบบ', icon: Activity, roles: ['admin'] },
  { to: '/account', label: 'บัญชี', icon: UserCircle, roles: ['cro', 'doctor', 'admin'] },
]

interface SidebarProps {
  role: Role
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({ role, open = false, onClose, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const items = NAV.filter((item) => item.roles.includes(role))

  return (
    <>
      <button
        type="button"
        aria-label="ปิดเมนู"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-bbh-ink/45 backdrop-blur-[2px] transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-bbh-line bg-white/95 shadow-2xl shadow-bbh-ink/20 backdrop-blur transition-[transform,width] duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:bg-white/90 lg:shadow-bbh-card ${collapsed ? 'lg:w-20' : 'lg:w-64'} ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className={`flex items-center border-b border-bbh-line py-5 ${collapsed ? 'lg:justify-center lg:px-2' : 'gap-3 px-5'}`}>
          {!collapsed ? (
            <>
              <img
                src={bbhDashboardLogo}
                alt="Better Being Hospital"
                className="h-10 w-10 shrink-0 object-contain"
              />
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base font-semibold leading-none text-bbh-ink">BBH</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-bbh-muted">Portal</p>
              </div>
            </>
          ) : (
            <img
              src={bbhDashboardLogo}
              alt="BBH"
              className="hidden h-10 w-10 shrink-0 object-contain lg:block"
            />
          )}

          {/* mobile close */}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-9 w-9 place-items-center rounded-xl border border-bbh-line text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green lg:hidden"
            aria-label="ปิดเมนู"
          >
            <X size={18} />
          </button>

          {/* desktop collapse toggle */}
          {onToggleCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={`hidden h-9 w-9 place-items-center rounded-xl border border-bbh-line text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green lg:grid ${collapsed ? 'ml-0' : 'ml-auto'}`}
              aria-label={collapsed ? 'กางเมนู' : 'พับเมนู'}
              title={collapsed ? 'กางเมนู' : 'พับเมนู'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          ) : null}
        </div>

        <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'lg:px-2' : 'px-3'}`}>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `mb-1 flex items-center rounded-xl text-sm font-semibold transition ${
                    collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-bbh-green text-white shadow-md shadow-bbh-green/20'
                      : 'text-bbh-muted hover:bg-bbh-green-soft hover:text-bbh-green-dark'
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                <span className={collapsed ? 'sr-only lg:hidden' : 'truncate'}>
                  {item.label}
                </span>
              </NavLink>
            )
          })}
        </nav>

        {/* footer */}
        <div className={`border-t border-bbh-line py-3 ${collapsed ? 'lg:px-2' : 'px-4'}`}>
          <div className={`flex items-center gap-2 text-[11px] text-bbh-muted ${collapsed ? 'lg:justify-center' : ''}`}>
            <Stethoscope size={14} className="text-bbh-green shrink-0" />
            <span className={collapsed ? 'sr-only lg:hidden' : ''}>
              Better Being Hospital
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
