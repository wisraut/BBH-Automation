import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
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
import { Availability } from './pages/Availability'
import { Biomarker } from './pages/Biomarker'
import { Book } from './pages/Book'
import { Bookings } from './pages/Bookings'
import { Calendar } from './pages/Calendar'
import { Documents } from './pages/Documents'
import { LabResults } from './pages/LabResults'
import { Patients } from './pages/Patients'
import { Reports } from './pages/Reports'
import { Schedule } from './pages/Schedule'
import { Today } from './pages/Today'
import { SystemHealth } from './pages/SystemHealth'
import { Users } from './pages/Users'
import { Login } from './routes/Login'

const DEFAULT_PATH_BY_ROLE: Record<Role, string> = {
  cro: '/bookings',
  admin: '/admin',
  doctor: '/today',
  nurse: '/patients',
  lab_staff: '/reports',
}

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  '/admin': { title: 'Admin Dashboard', subtitle: 'Action Required และภาพรวมระบบโรงพยาบาล' },
  '/bookings': {
    title: 'การจองทั้งหมด',
    subtitle: 'จัดการคำขอจองคิวจาก LINE / โทรศัพท์ / Walk-in',
  },
  '/calendar': { title: 'ปฏิทิน' },
  '/today': { title: 'วันนี้', subtitle: 'สรุปงานที่ต้องจัดการวันนี้' },
  '/schedule': { title: 'ตารางนัด' },
  '/book': { title: 'ลงนัดเอง', subtitle: 'ลงนัด → ส่งเข้าคิว CRO ยืนยัน' },
  '/availability': { title: 'ตารางว่างของฉัน', subtitle: 'กำหนดเวลาว่างให้ระบบเสนอเวลาจอง' },
  '/biomarker': { title: 'Biomarker', subtitle: 'แนวโน้มค่าตรวจเทียบ optimal range' },
  '/documents': { title: 'กล่องเอกสาร', subtitle: 'เอกสารที่ CRO อัปโหลดและมอบหมายให้คุณ' },
  '/lab-results': { title: 'ผลแล็บ (ละเอียด)', subtitle: 'ค่าตรวจแตกรายตัว · ค่าอ้างอิง · สถานะ' },
  '/patients': { title: 'คนไข้' },
  '/reports': { title: 'ผลแล็บ' },
  '/ai': { title: 'AI Assistant' },
  '/users': { title: 'ผู้ใช้ระบบ' },
  '/system-health': { title: 'สถานะระบบ' },
  '/alert-rules': { title: 'Alert Rules', subtitle: 'ตั้งกฎเตือนที่ evaluator ใช้สร้าง alert' },
  '/audit': { title: 'Audit Log', subtitle: 'การเข้าถึงข้อมูลคนไข้ (HIPAA-like)' },
  '/account': { title: 'บัญชี' },
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-bbh-surface text-bbh-ink">
      <div className="text-center">
        <p className="font-serif text-4xl font-semibold">404</p>
        <p className="mt-2 text-sm text-bbh-muted">ไม่พบหน้าที่คุณกำลังหา</p>
      </div>
    </main>
  )
}

function LoginPage() {
  const { user, isReady } = useAuth()
  const location = useLocation()
  if (!isReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-bbh-surface text-bbh-muted">
        กำลังโหลด...
      </main>
    )
  }
  if (user) {
    // ProtectedRoute redirected to /login with state.from on auth-required pages;
    // after successful login, send the user back to where they tried to go.
    const from = (location.state as { from?: string } | null)?.from
    const target = from && from !== '/login' ? from : DEFAULT_PATH_BY_ROLE[user.role]
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
  '/today': 'doctor',
  '/schedule': 'doctor',
  '/book': 'doctor',
  '/availability': 'doctor',
  '/biomarker': 'doctor',
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
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (!user) return null
  const meta = PAGE_META[location.pathname] ?? { title: 'BBH Hospital' }
  const viewAs = computeViewAs(location.pathname, searchParams.get('as'), user.role)
  const effectiveRole: Role = viewAs ?? user.role

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-white via-bbh-green-soft/45 to-bbh-surface text-bbh-ink">
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
        <Topbar title={meta.title} subtitle={meta.subtitle} onMenuClick={() => setSidebarOpen(true)} viewAs={viewAs} />
        <main className="flex-1 overflow-hidden p-4 md:p-7 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<RoleHome />} />
          <Route path="admin" element={<ProtectedRoute allow={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route element={<ProtectedRoute allow={['cro', 'admin']} />}>
            <Route path="bookings" element={<Bookings />} />
            <Route path="calendar" element={<Calendar />} />
          </Route>
          <Route element={<ProtectedRoute allow={['doctor', 'admin']} />}>
            <Route path="today" element={<Today />} />
            <Route path="book" element={<Book />} />
            <Route path="availability" element={<Availability />} />
            <Route path="biomarker" element={<Biomarker />} />
            <Route path="documents" element={<Documents />} />
            <Route path="lab-results" element={<LabResults />} />
          </Route>
          <Route element={<ProtectedRoute allow={['doctor', 'admin', 'nurse']} />}>
            <Route path="schedule" element={<Schedule />} />
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
