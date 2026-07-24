import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'

import { ProtectedRoute } from './components/ProtectedRoute'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { AuthProvider } from './contexts/AuthProvider'
import { ToastProvider } from './contexts/ToastProvider'
import { useAuth } from './lib/auth'
import type { Role } from './lib/auth'
import { queryClient } from './lib/queryClient'
import { Account } from './pages/Account'
import { AdminDashboard } from './pages/AdminDashboard'
import { AlertRules } from './pages/AlertRules'
import { AuditLog } from './pages/AuditLog'
import { AiAssistant } from './pages/AiAssistant'
import { Bookings } from './pages/Bookings'
import { Calendar } from './pages/Calendar'
import { DoctorCalendar } from './pages/DoctorCalendar'
import { Patients } from './pages/Patients'
import { PatientProfilePrint } from './pages/PatientProfilePrint'
import { Reports } from './pages/Reports'
import { Schedule } from './pages/Schedule'
import { SystemHealth } from './pages/SystemHealth'
import { Users } from './pages/Users'
import { Login } from './routes/Login'

const DEFAULT_PATH_BY_ROLE: Record<Role, string> = {
  cro: '/bookings',
  admin: '/admin',
  doctor: '/schedule',
  nurse: '/patients',
  lab_staff: '/reports',
}

// Which roles may open each path — mirrors the <ProtectedRoute allow> lists in
// AppRoutes. Unlisted paths (e.g. /ai, /account) are open to any authenticated
// user. Used to reject a stale post-login redirect target the new role can't see
// (e.g. logout on a doctor page, then log back in as CRO).
const ROUTE_ALLOW: Record<string, Role[]> = {
  '/admin': ['admin'],
  '/bookings': ['cro', 'admin'],
  '/calendar': ['cro', 'admin'],
  '/schedule': ['doctor', 'admin', 'nurse'],
  '/doctor-calendar': ['doctor', 'admin', 'nurse'],
  '/reports': ['doctor', 'admin', 'nurse', 'lab_staff'],
  '/patients': ['cro', 'doctor', 'admin', 'nurse'],
  '/users': ['admin'],
  '/system-health': ['admin'],
  '/alert-rules': ['admin'],
  '/audit': ['admin'],
}

function canAccess(path: string, role: Role): boolean {
  const allow = ROUTE_ALLOW[path]
  return !allow || allow.includes(role)
}

// Maps each path to its i18n key base under `pages.*`; hasSubtitle marks the
// paths that also carry a `.subtitle`. Titles/subtitles are resolved in
// DashboardLayout via t() so they follow the active language.
const PAGE_META: Record<string, { key: string; hasSubtitle?: boolean }> = {
  '/admin': { key: 'admin', hasSubtitle: true },
  '/bookings': { key: 'bookings', hasSubtitle: true },
  '/calendar': { key: 'calendar' },
  '/schedule': { key: 'schedule' },
  '/doctor-calendar': { key: 'doctorCalendar', hasSubtitle: true },
  '/patients': { key: 'patients' },
  '/reports': { key: 'reports' },
  '/ai': { key: 'ai' },
  '/users': { key: 'users' },
  '/system-health': { key: 'systemHealth' },
  '/alert-rules': { key: 'alertRules', hasSubtitle: true },
  '/audit': { key: 'audit', hasSubtitle: true },
  '/account': { key: 'account' },
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <main className="grid min-h-screen place-items-center bg-bbh-surface text-bbh-ink">
      <div className="text-center">
        <p className="font-serif text-4xl font-semibold">404</p>
        <p className="mt-2 text-sm text-bbh-muted">{t('notFound.message')}</p>
      </div>
    </main>
  )
}

function LoginPage() {
  const { user, isReady } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  if (!isReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-bbh-surface text-bbh-muted">
        {t('common.loading')}
      </main>
    )
  }
  if (user) {
    // ProtectedRoute redirected to /login with state.from on auth-required pages;
    // after successful login, send the user back to where they tried to go — but
    // only if the new role may actually open it. Otherwise (e.g. logout on a
    // doctor page, then log in as CRO) go to the new role's home instead of
    // landing on a "no access" page.
    const from = (location.state as { from?: string } | null)?.from
    const target = from && from !== '/login' && canAccess(from, user.role)
      ? from
      : DEFAULT_PATH_BY_ROLE[user.role]
    return <Navigate to={target} replace />
  }
  return <Login />
}

function RoleHome() {
  const { user } = useAuth()
  return <Navigate to={user ? DEFAULT_PATH_BY_ROLE[user.role] : '/login'} replace />
}

const ADMIN_PATHS = ['/admin', '/users', '/system-health', '/alert-rules', '/audit']
const ROLE_OF_PATH: Record<string, Role> = {
  '/bookings': 'cro',
  '/calendar': 'cro',
  '/schedule': 'doctor',
  '/doctor-calendar': 'doctor',
}
const VALID_VIEW_AS: Role[] = ['cro', 'doctor', 'nurse', 'lab_staff']

function computeViewAs(pathname: string, asParam: string | null, actualRole: Role): Role | null {
  if (actualRole !== 'admin') return null
  if (ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null
  if (asParam && (VALID_VIEW_AS as string[]).includes(asParam)) return asParam as Role
  return ROLE_OF_PATH[pathname] ?? null
}

function DashboardLayout() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (!user) return null
  const meta = PAGE_META[location.pathname]
  const title = meta ? t(`pages.${meta.key}.title`) : t('pages.fallbackTitle')
  const subtitle = meta?.hasSubtitle ? t(`pages.${meta.key}.subtitle`) : undefined
  const viewAs = computeViewAs(location.pathname, searchParams.get('as'), user.role)
  const effectiveRole: Role = viewAs ?? user.role

  return (
    <div className="flex h-screen overflow-hidden bg-white text-bbh-ink">
      <Sidebar
        role={effectiveRole}
        actualRole={user.role}
        viewAs={viewAs}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar title={title} subtitle={subtitle} onMenuClick={() => setSidebarOpen(true)} viewAs={viewAs} />
        {/* Open, edge-to-edge work surface for every route: pages are full-bleed
            to the sidebar/topbar (which carry their own hairline borders), so no
            page reads as a floating card on a gradient. Each page owns its own
            internal scroll and hairline-ruled panels — see AdminDashboard. */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// นิยาม route ทั้งหมดของ dashboard — ห่อด้วย ProtectedRoute เพื่อคุมสิทธิ์ตาม role
// และ DashboardLayout (sidebar + topbar); path ที่ role เข้าไม่ได้จะถูก redirect
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="print/patient/:id" element={<PatientProfilePrint />} />
        <Route element={<DashboardLayout />}>
          <Route index element={<RoleHome />} />
          <Route path="admin" element={<ProtectedRoute allow={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route element={<ProtectedRoute allow={['cro', 'admin']} />}>
            <Route path="bookings" element={<Bookings />} />
            <Route path="calendar" element={<Calendar />} />
          </Route>
          <Route element={<ProtectedRoute allow={['doctor', 'admin', 'nurse']} />}>
            <Route path="schedule" element={<Schedule />} />
            <Route path="doctor-calendar" element={<DoctorCalendar />} />
          </Route>
          <Route element={<ProtectedRoute allow={['doctor', 'admin', 'nurse', 'lab_staff']} />}>
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="patients" element={<ProtectedRoute allow={['cro', 'doctor', 'admin', 'nurse']}><Patients /></ProtectedRoute>} />
          <Route path="ai" element={<AiAssistant />} />
          <Route element={<ProtectedRoute allow={['admin']} />}>
            <Route path="users" element={<Users />} />
            <Route path="system-health" element={<SystemHealth />} />
            <Route path="alert-rules" element={<AlertRules />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
          <Route path="account" element={<Account />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

// รากของแอป — ครอบทุกหน้าด้วย provider หลัก (React Query, Auth, Toast) แล้วเรนเดอร์ route
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}

export default App
