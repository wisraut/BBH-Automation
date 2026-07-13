import { useTranslation } from 'react-i18next'
import { AuthNotice } from './AuthNotice'
import type { DashboardUser, Role } from '../../lib/auth'

// Destination i18n keys — resolved via t('signedInPreview.destinations.*').
const roleDestinations: Record<Role, string[]> = {
  admin: ['bookings', 'patients', 'reports', 'aiAssistant', 'users', 'systemHealth'],
  doctor: ['schedule', 'patients', 'reports', 'aiAssistant', 'account'],
  cro: ['bookings', 'newBooking', 'calendar', 'patients', 'aiAssistant', 'account'],
  nurse: ['patients', 'reports', 'aiAssistant', 'account'],
  lab_staff: ['reports', 'aiAssistant', 'account'],
}

type SignedInPreviewProps = {
  user: DashboardUser
  notice: string
  onLogout: () => void | Promise<void>
}

export function SignedInPreview({ user, notice, onLogout }: SignedInPreviewProps) {
  const { t } = useTranslation()
  return (
    <section>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-bbh-green">
            {t('signedInPreview.eyebrow')}
          </p>
          <h2 className="auth-heading mt-2 text-3xl font-semibold text-bbh-ink">
            {user.display_name}
          </h2>
          <p className="mt-2 text-sm text-bbh-muted">
            {t(`roles.${user.role}`)}
            {user.specialty ? ` · ${user.specialty}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-xl border border-bbh-line px-4 py-2 text-sm font-semibold text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green"
        >
          {t('signedInPreview.logout')}
        </button>
      </div>

      <AuthNotice message={notice} className="mb-5" />

      <div className="rounded-2xl border border-bbh-line p-4">
        <p className="text-sm font-semibold text-bbh-ink">{t('signedInPreview.roleBasedEntry')}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {roleDestinations[user.role].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-bbh-line bg-bbh-surface px-3 py-3 text-sm font-medium text-bbh-ink"
            >
              {t(`signedInPreview.destinations.${item}`)}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
