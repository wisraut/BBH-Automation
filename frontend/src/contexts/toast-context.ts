import { createContext } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

export interface ToastContextValue {
  show: (kind: ToastKind, message: string) => void
}

// React context ของระบบ toast — แยกจาก ToastProvider เพื่อให้ hook useToast import ได้โดยไม่ดึง provider
export const ToastContext = createContext<ToastContextValue | null>(null)
