import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../lib/auth'
import type { AuthContextValue, DashboardUser, Role } from '../lib/auth'
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

// DEV-ONLY UI preview: `VITE_DEV_ROLE=doctor npm run dev` fakes an authenticated
// user of that role so a workspace can be reviewed locally without a real login.
// Never active in a production build (guarded by import.meta.env.DEV). Data-fetch
// pages will 401 (no real token) and show empty/error states; local-state pages
// (availability/book/biomarker) render fully.
const _VALID_ROLES: Role[] = ['admin', 'doctor', 'cro', 'nurse', 'lab_staff']
const _devRole = import.meta.env.DEV ? (import.meta.env.VITE_DEV_ROLE as string | undefined) : undefined
const DEV_MOCK_USER: DashboardUser | null =
  _devRole && (_VALID_ROLES as string[]).includes(_devRole)
    ? { id: 0, email: `dev+${_devRole}@local`, display_name: 'หมอพรีวิว', role: _devRole as Role }
    : null

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
      // DEV mock: skip the network; the fake user is already set.
      if (DEV_MOCK_USER) {
        setIsReady(true)
        return
      }
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
      // Keep the DEV mock user logged in despite 401s from data endpoints.
      if (DEV_MOCK_USER) return
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
