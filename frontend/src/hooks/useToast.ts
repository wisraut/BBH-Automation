// Toast notifications — show success/error/info banners from anywhere.
import { useContext } from 'react'

import { ToastContext } from '../contexts/toast-context'

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
