import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { ProtectedRoute } from './components/ProtectedRoute'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { AuthProvider } from './contexts/AuthProvider'
import { ToastProvider } from './contexts/ToastProvider'
import { useAuth } from './lib/auth'
import type { Role } from './lib/auth'
import { queryClient } from './lib/queryClient'
import { Account } from './pages/Account'
import { AiAssistant } from './pages/AiAssistant'
import { Bookings } from './pages/Bookings'
import { Calendar } from './pages/Calendar'
import { Patients } from './pages/Patients'
import { Login } from './routes/Login'

const DEFAULT_PATH_BY_ROLE: Record<Role, string> = {
  cro: '/bookings',
  admin: '/bookings',
  doctor: '/schedule',
}

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  '/bookings': {
    title: 'การจองทั้งหมด',
    subtitle: 'จัดการคำขอจองคิวจาก LINE / โทรศัพท์ / Walk-in',
  },
  '/calendar': { title: 'ปฏิทิน' },
  '/schedule': { title: 'ตารางงานแพทย์' },
  '/patients': { title: 'คนไข้' },
  '/reports': { title: 'รายงานแพทย์' },
  '/ai': { title: 'AI Assistant' },
  '/users': { title: 'ผู้ใช้ระบบ' },
  '/system-health': { title: 'สถานะระบบ' },
  '/account': { title: 'บัญชี' },
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-2xl border border-dashed border-bbh-line bg-white p-12 text-center">
        <p className="font-serif text-2xl text-bbh-ink">{title}</p>
        <p className="mt-2 text-sm text-bbh-muted">กำลังพัฒนา — Phase ถัดไป</p>
      </div>
    </div>
  )
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

function DashboardLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (!user) return null
  const meta = PAGE_META[location.pathname] ?? { title: 'BBH Portal' }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-white via-bbh-green-soft/45 to-bbh-surface text-bbh-ink">
      <Sidebar
        role={user.role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar title={meta.title} subtitle={meta.subtitle} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-hidden p-3 md:p-5">
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
          <Route element={<ProtectedRoute allow={['cro', 'admin']} />}>
            <Route path="bookings" element={<Bookings />} />
            <Route path="calendar" element={<Calendar />} />
          </Route>
          <Route element={<ProtectedRoute allow={['doctor', 'admin']} />}>
            <Route path="schedule" element={<Placeholder title="ตารางงานแพทย์" />} />
            <Route path="reports" element={<Placeholder title="รายงาน" />} />
          </Route>
          <Route path="patients" element={<ProtectedRoute allow={['cro', 'doctor', 'admin']}><Patients /></ProtectedRoute>} />
          <Route path="ai" element={<AiAssistant />} />
          <Route element={<ProtectedRoute allow={['admin']} />}>
            <Route path="users" element={<Placeholder title="ผู้ใช้" />} />
            <Route path="system-health" element={<Placeholder title="สถานะระบบ" />} />
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
