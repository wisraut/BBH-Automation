import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from '../lib/auth'
import type { AuthContextValue, DashboardUser } from '../lib/auth'
import { api, clearToken, getToken, setToken } from '../lib/api'

type LoginResponse = {
  token: string
  user: DashboardUser
  expires_at: string
}

type MeResponse = {
  user: DashboardUser
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [isReady, setIsReady] = useState(false)

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
        }
      },
    }),
    [user, isReady],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
