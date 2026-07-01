import type { ReactNode } from 'react'
import { BrandMark } from './BrandMark'

type AuthCardProps = {
  children: ReactNode
}

export function AuthCard({ children }: AuthCardProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bbh-surface px-4 py-8 sm:px-8">
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-bbh-green/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-bbh-green/5 blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-[460px]">
        <div className="mb-8 lg:hidden">
          <BrandMark />
        </div>

        <div className="rounded-[24px] border border-bbh-line bg-white p-6 shadow-xl shadow-bbh-green/5 sm:rounded-[28px] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
