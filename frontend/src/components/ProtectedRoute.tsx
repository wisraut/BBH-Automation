import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'

interface ProtectedRouteProps {
  // Role allowlist — empty means "any authenticated user".
  allow?: Role[]
  // If provided, render this instead of <Outlet/>. Useful when wrapping a single child.
  children?: ReactNode
}

// ยามเฝ้า route — กันคนที่ยังไม่ล็อกอิน (เด้งไป /login) และกัน role ที่ไม่มีสิทธิ์
// (โชว์หน้า access denied); ห่อทุกหน้าใน dashboard เพื่อบังคับ auth + role
export function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const { t } = useTranslation()
  const { user, isReady } = useAuth()
  const location = useLocation()

  if (!isReady) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-sm text-bbh-muted">
        {t('common.loading')}
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (allow && allow.length > 0 && !allow.includes(user.role)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
        <h2 className="font-serif text-2xl text-bbh-ink">{t('protectedRoute.accessDenied')}</h2>
        <p className="text-sm text-bbh-muted">
          {t('protectedRoute.notAllowed', { role: t(`roles.${user.role}`) })}
        </p>
      </div>
    )
  }

  return children ? <>{children}</> : <Outlet />
}
