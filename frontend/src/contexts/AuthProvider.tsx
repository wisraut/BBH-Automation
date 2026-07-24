import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../lib/auth'
import type { AuthContextValue, DashboardUser } from '../lib/auth'
import { api, clearToken, getToken, setToken } from '../lib/api'
import { setOwner as setAiOwner } from '../lib/aiStore'

type LoginResponse = {
  token: string
  user: DashboardUser
  expires_at: string
}

type MeResponse = {
  user: DashboardUser
}

// Provider จัดการ auth ทั้งแอป — hydrate user จาก token ตอนโหลด, ให้ login/logout,
// ผูก AI chat store กับผู้ใช้ปัจจุบัน และ redirect ไป /login เมื่อ session หมดอายุ (401)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const navigate = useNavigate()

  // Scope AI chat history (localStorage) to the current user so switching
  // accounts in the same browser does not leak the previous user's sessions.
  useEffect(() => {
    setAiOwner(user ? String(user.id) : null)
  }, [user])

  useEffect(() => {
    let active = true

    async function hydrate() {
      if (!getToken()) {
        setIsReady(true)
        return
      }

      try {
        const data = await api.get<MeResponse>('/auth/me')
        if (active) setUser(data.user)
      } catch {
        clearToken()
        if (active) setUser(null)
      } finally {
        if (active) setIsReady(true)
      }
    }

    hydrate()

    const handleUnauthorized = () => {
      clearToken()
      setUser(null)
    }
    window.addEventListener('bbh:unauthorized', handleUnauthorized)

    return () => {
      active = false
      window.removeEventListener('bbh:unauthorized', handleUnauthorized)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      async login(email: string, password: string) {
        const data = await api.post<LoginResponse>(
          '/auth/login',
          { email, password },
          { noAuth: true },
        )
        setToken(data.token)
        setUser(data.user)
        return data.user
      },
      async logout() {
        try {
          if (getToken()) await api.post<void>('/auth/logout')
        } finally {
          clearToken()
          setUser(null)
          // Land on a clean /login without a `from` intent. Otherwise
          // ProtectedRoute would stamp the current page as `state.from`, and a
          // fresh login (possibly as a different role) would be sent back to the
          // previous role's page instead of the new role's home.
          navigate('/login', { replace: true })
        }
      },
    }),
    [user, isReady, navigate],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
