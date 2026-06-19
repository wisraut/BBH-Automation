import { createContext, useContext } from 'react'

export type Role = 'admin' | 'doctor' | 'cro'

export type DashboardUser = {
  id: number
  email: string
  display_name: string
  role: Role
  specialty?: string | null
  avatar_url?: string | null
}

export type AuthContextValue = {
  user: DashboardUser | null
  isReady: boolean
  login: (email: string, password: string) => Promise<DashboardUser>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
