import type { FormEvent } from 'react'
import { AuthNotice } from './AuthNotice'

type LoginFormProps = {
  email: string
  password: string
  rememberMe: boolean
  notice: string
  isSubmitting: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onRememberMeChange: (value: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onForgotPassword: () => void
}

export function LoginForm({
  email,
  password,
  rememberMe,
  notice,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onRememberMeChange,
  onSubmit,
  onForgotPassword,
}: LoginFormProps) {
  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-bbh-green">
        Secure access
      </p>
      <h2 className="auth-heading mt-2 text-3xl font-semibold text-bbh-ink">
        ยินดีต้อนรับกลับ
      </h2>
      <p className="mt-3 text-sm leading-6 text-bbh-muted">
        เข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่ ระบบจะใช้ role จาก user record ในฐานข้อมูล
      </p>

      <AuthNotice message={notice} className="mt-5" />

      <form className="mt-7 space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-bbh-ink">อีเมล</span>
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none transition placeholder:text-bbh-muted/60 focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10 disabled:cursor-not-allowed disabled:opacity-70"
            placeholder="กรุณากรอกอีเมล"
            autoComplete="email"
            disabled={isSubmitting}
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-bbh-ink">รหัสผ่าน</span>
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none transition placeholder:text-bbh-muted/60 focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10 disabled:cursor-not-allowed disabled:opacity-70"
            placeholder="กรอกรหัสผ่าน"
            autoComplete="current-password"
            disabled={isSubmitting}
            required
          />
        </label>

        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-sm text-bbh-muted">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => onRememberMeChange(event.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 cursor-pointer appearance-none rounded border border-bbh-line bg-white transition checked:border-bbh-green checked:bg-bbh-green focus:outline-none focus:ring-4 focus:ring-bbh-green/10 disabled:cursor-not-allowed disabled:opacity-70"
              style={
                rememberMe
                  ? {
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.3l3 3 6-7'/%3E%3C/svg%3E\")",
                      backgroundSize: '70%',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }
                  : undefined
              }
            />
            จดจำอุปกรณ์นี้
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm font-semibold text-bbh-green transition hover:text-bbh-green-dark"
          >
            ลืมรหัสผ่าน?
          </button>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="h-12 w-full rounded-2xl bg-bbh-green px-5 text-base font-semibold text-white shadow-lg shadow-bbh-green/20 transition hover:bg-bbh-green-dark focus:outline-none focus:ring-4 focus:ring-bbh-green/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs leading-5 text-bbh-muted">
        สำหรับเจ้าหน้าที่ BBH เท่านั้น
      </p>
    </section>
  )
}
