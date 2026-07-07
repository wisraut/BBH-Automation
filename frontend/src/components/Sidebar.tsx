import { Link, NavLink } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  BellRing,
  Bot,
  Calendar,
  CalendarPlus,
  FlaskConical,
  History,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Stethoscope,
  UserCircle,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Role } from '../lib/auth'
import bbhDashboardLogo from '../assets/bbh-logo-dashboard.png'

const VIEW_AS_LABEL: Record<Role, string> = {
  admin: 'Admin',
  cro: 'CRO',
  doctor: 'Doctor',
  nurse: 'Nurse',
  lab_staff: 'Lab',
}

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

// Admin sidebar shows only admin-scoped items. To enter another role's workspace
// (CRO bookings, doctor schedule, etc.) admin uses the "Go as X" cards on the
// /admin dashboard — route gates still allow admin in those pages.
const NAV: NavItem[] = [
  { to: '/admin', label: 'Admin', icon: ShieldCheck, roles: ['admin'] },
  { to: '/bookings', label: 'การจอง', icon: ClipboardList, roles: ['cro'] },
  { to: '/calendar', label: 'ปฏิทิน', icon: CalendarDays, roles: ['cro'] },
  { to: '/schedule', label: 'ตารางงาน', icon: CalendarClock, roles: ['doctor', 'nurse'] },
  { to: '/patients', label: 'คนไข้', icon: Users, roles: ['cro', 'doctor', 'nurse'] },
  { to: '/reports', label: 'รายงาน', icon: FileText, roles: ['doctor', 'nurse', 'lab_staff'] },
  { to: '/ai', label: 'AI Assistant', icon: MessageCircle, roles: ['cro', 'doctor', 'admin', 'nurse', 'lab_staff'] },
  { to: '/users', label: 'ผู้ใช้', icon: UserCog, roles: ['admin'] },
  { to: '/alert-rules', label: 'Alert Rules', icon: BellRing, roles: ['admin'] },
  { to: '/audit', label: 'Audit Log', icon: History, roles: ['admin'] },
  { to: '/system-health', label: 'สถานะระบบ', icon: Activity, roles: ['admin'] },
  { to: '/account', label: 'บัญชี', icon: UserCircle, roles: ['cro', 'doctor', 'admin', 'nurse', 'lab_staff'] },
]

// Doctor Workspace has its own ordered nav (spec §2) with doctor-specific labels
// ("คนไข้ของฉัน", "ผลแล็บ") that differ from the shared NAV. Kept separate so the
// CRO/admin/nurse/lab nav above is untouched. Used when the effective role is doctor
// (including admin viewing-as-doctor).
const DOCTOR_NAV: NavItem[] = [
  { to: '/today', label: 'วันนี้', icon: LayoutDashboard, roles: ['doctor'] },
  { to: '/patients', label: 'คนไข้ของฉัน', icon: Users, roles: ['doctor'] },
  { to: '/schedule', label: 'ตารางนัด', icon: Calendar, roles: ['doctor'] },
  { to: '/book', label: 'ลงนัดเอง', icon: CalendarPlus, roles: ['doctor'] },
  { to: '/availability', label: 'ตารางว่าง', icon: CalendarClock, roles: ['doctor'] },
  { to: '/reports', label: 'ผลแล็บ', icon: FlaskConical, roles: ['doctor'] },
  { to: '/biomarker', label: 'Biomarker', icon: Activity, roles: ['doctor'] },
  { to: '/ai', label: 'AI ผู้ช่วย', icon: Bot, roles: ['doctor'] },
  { to: '/account', label: 'บัญชี', icon: UserCog, roles: ['doctor'] },
]

interface SidebarProps {
  role: Role
  actualRole?: Role
  viewAs?: Role | null
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({ role, actualRole, viewAs, open = false, onClose, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const items = role === 'doctor' ? DOCTOR_NAV : NAV.filter((item) => item.roles.includes(role))
  const showBackToAdmin = Boolean(viewAs && actualRole === 'admin')
  // Preserve view-as query so admin stays in the shadowed role while navigating
  const withViewAs = (path: string) => (viewAs ? `${path}?as=${viewAs}` : path)

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
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bbh-muted">Portal</p>
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
            className="ml-auto grid h-9 w-9 place-items-center rounded-xl border border-bbh-line text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green lg:hidden"
            aria-label="ปิดเมนู"
          >
            <X size={18} />
          </button>

          {/* desktop collapse toggle */}
          {onToggleCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={`hidden h-9 w-9 place-items-center rounded-xl border border-bbh-line text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green lg:grid ${collapsed ? 'ml-0' : 'ml-auto'}`}
              aria-label={collapsed ? 'กางเมนู' : 'พับเมนู'}
              title={collapsed ? 'กางเมนู' : 'พับเมนู'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          ) : null}
        </div>

        {showBackToAdmin && viewAs ? (
          <div className={`border-b border-bbh-line bg-bbh-green-soft/50 ${collapsed ? 'lg:px-2 lg:py-3' : 'px-4 py-3'}`}>
            <Link
              to="/admin"
              onClick={onClose}
              title={collapsed ? 'กลับ Admin' : undefined}
              className={`flex items-center rounded-xl border border-bbh-green/30 bg-white text-xs font-semibold text-bbh-green-dark transition-all duration-200 hover:border-bbh-green ${
                collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2'
              }`}
            >
              <ArrowLeft size={14} className="shrink-0" />
              <span className={collapsed ? 'sr-only lg:hidden' : ''}>
                กลับ Admin · กำลังดูในมุม {VIEW_AS_LABEL[viewAs]}
              </span>
            </Link>
          </div>
        ) : null}

        <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'lg:px-2' : 'px-3'}`}>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={withViewAs(item.to)}
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
