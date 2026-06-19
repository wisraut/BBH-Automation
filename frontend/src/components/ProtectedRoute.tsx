import type { ReactNode } from 'react'

import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'

interface ProtectedRouteProps {
  allow: Role[]
  children: ReactNode
  fallback?: ReactNode
}

export function ProtectedRoute({ allow, children, fallback }: ProtectedRouteProps) {
  const { user, isReady } = useAuth()

  if (!isReady) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-sm text-bbh-muted">
        กำลังโหลด...
      </div>
    )
  }

  if (!user) {
    return fallback ?? null
  }

  if (!allow.includes(user.role)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
        <h2 className="font-serif text-2xl text-bbh-ink">ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
        <p className="text-sm text-bbh-muted">
          บัญชี {user.role} ไม่ได้รับอนุญาตให้เข้าหน้านี้
        </p>
      </div>
    )
  }

  return <>{children}</>
}
