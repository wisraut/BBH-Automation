import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

type ResetPasswordFormProps = {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

// ฟอร์มตั้งรหัสผ่านใหม่ (หลังกดลิงก์รีเซ็ตจากอีเมล) — รหัสใหม่ + ยืนยัน + แถบวัดความแข็งแรง
export function ResetPasswordForm({ onSubmit }: ResetPasswordFormProps) {
  const { t } = useTranslation()
  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-bbh-green">
        {t('resetPasswordForm.eyebrow')}
      </p>
      <h2 className="auth-heading mt-2 text-3xl font-semibold text-bbh-ink">
        {t('resetPasswordForm.heading')}
      </h2>
      <p className="mt-3 text-sm leading-6 text-bbh-muted">
        {t('resetPasswordForm.subtitle')}
      </p>

      <form className="mt-7 space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-bbh-ink">{t('resetPasswordForm.newPassword')}</span>
          <input
            type="password"
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none transition focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-bbh-ink">{t('resetPasswordForm.confirmPassword')}</span>
          <input
            type="password"
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none transition focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            autoComplete="new-password"
            required
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <span className="h-2 rounded-full bg-bbh-green" />
          <span className="h-2 rounded-full bg-bbh-green" />
          <span className="h-2 rounded-full bg-bbh-line" />
        </div>
        <button
          type="submit"
          className="h-12 w-full rounded-2xl bg-bbh-green px-5 text-base font-semibold text-white shadow-lg shadow-bbh-green/20 transition hover:bg-bbh-green-dark"
        >
          {t('resetPasswordForm.submit')}
        </button>
      </form>
    </section>
  )
}
