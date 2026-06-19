import type { FormEvent } from 'react'

type ForgotPasswordFormProps = {
  email: string
  onEmailChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onBackToLogin: () => void
}

export function ForgotPasswordForm({
  email,
  onEmailChange,
  onSubmit,
  onBackToLogin,
}: ForgotPasswordFormProps) {
  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-bbh-green">
        Account recovery
      </p>
      <h2 className="auth-heading mt-2 text-3xl font-semibold text-bbh-ink">รีเซ็ตรหัสผ่าน</h2>
      <p className="mt-3 text-sm leading-6 text-bbh-muted">
        ใส่อีเมลบัญชีเจ้าหน้าที่เพื่อรับขั้นตอนรีเซ็ตจากระบบ
      </p>

      <form className="mt-7 space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-bbh-ink">อีเมล</span>
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none transition focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            autoComplete="email"
            required
          />
        </label>

        <button
          type="submit"
          className="h-12 w-full rounded-2xl bg-bbh-green px-5 text-base font-semibold text-white shadow-lg shadow-bbh-green/20 transition hover:bg-bbh-green-dark"
        >
          ส่งคำขอรีเซ็ต
        </button>
        <button
          type="button"
          onClick={onBackToLogin}
          className="h-12 w-full rounded-2xl border border-bbh-line px-5 text-base font-semibold text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </button>
      </form>
    </section>
  )
}
