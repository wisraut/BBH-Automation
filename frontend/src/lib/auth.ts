import { createContext, useContext } from 'react'

export type Role = 'admin' | 'doctor' | 'cro' | 'nurse' | 'lab_staff'

export type DashboardUser = {
  id: number
  email: string
  display_name: string
  role: Role
  specialty?: string | null
  avatar_url?: string | null
  last_login_at?: string | null
}

export type AuthContextValue = {
  user: DashboardUser | null
  isReady: boolean
  login: (email: string, password: string, otpCode?: string) => Promise<DashboardUser>
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
