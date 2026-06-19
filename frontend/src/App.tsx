import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { ProtectedRoute } from './components/ProtectedRoute'
import { Sidebar } from './components/Sidebar'
import type { PageKey } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { AuthProvider } from './contexts/AuthProvider'
import { ToastProvider } from './contexts/ToastProvider'
import { useAuth } from './lib/auth'
import { queryClient } from './lib/queryClient'
import { Bookings } from './pages/Bookings'
import { Login } from './routes/Login'

const DEFAULT_PAGE_BY_ROLE: Record<string, PageKey> = {
  cro: 'bookings',
  admin: 'bookings',
  doctor: 'schedule',
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

function Dashboard() {
  const { user } = useAuth()
  const [page, setPage] = useState<PageKey>(user ? DEFAULT_PAGE_BY_ROLE[user.role] ?? 'account' : 'bookings')

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-white via-bbh-green-soft/45 to-bbh-surface text-bbh-ink">
      <Sidebar role={user.role} current={page} onNavigate={setPage} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={pageTitle(page)} subtitle={pageSubtitle(page)} />
        <main className="flex-1 overflow-hidden p-5">
          {page === 'bookings' ? (
            <ProtectedRoute allow={['cro', 'admin']}>
              <Bookings />
            </ProtectedRoute>
          ) : null}
          {page === 'new-booking' ? <Placeholder title="จองใหม่" /> : null}
          {page === 'calendar' ? <Placeholder title="ปฏิทิน" /> : null}
          {page === 'schedule' ? <Placeholder title="ตารางงานแพทย์" /> : null}
          {page === 'patients' ? <Placeholder title="คนไข้" /> : null}
          {page === 'reports' ? <Placeholder title="รายงาน" /> : null}
          {page === 'ai' ? <Placeholder title="AI Assistant" /> : null}
          {page === 'users' ? <Placeholder title="ผู้ใช้" /> : null}
          {page === 'system-health' ? <Placeholder title="สถานะระบบ" /> : null}
          {page === 'account' ? <Placeholder title="บัญชี" /> : null}
        </main>
      </div>
    </div>
  )
}

function pageTitle(page: PageKey): string {
  switch (page) {
    case 'bookings': return 'การจองทั้งหมด'
    case 'new-booking': return 'จองใหม่'
    case 'calendar': return 'ปฏิทิน'
    case 'schedule': return 'ตารางงานแพทย์'
    case 'patients': return 'คนไข้'
    case 'reports': return 'รายงานแพทย์'
    case 'ai': return 'AI Assistant'
    case 'users': return 'ผู้ใช้ระบบ'
    case 'system-health': return 'สถานะระบบ'
    case 'account': return 'บัญชี'
  }
}

function pageSubtitle(page: PageKey): string | undefined {
  if (page === 'bookings') return 'จัดการคำขอจองคิวจาก LINE / โทรศัพท์ / Walk-in'
  return undefined
}

function Shell() {
  const { user, isReady } = useAuth()
  if (!isReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-bbh-surface text-bbh-muted">
        กำลังโหลด...
      </main>
    )
  }
  return user ? <Dashboard /> : <Login />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}

export default App
