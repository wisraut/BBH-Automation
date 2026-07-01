import { AuthNotice } from './AuthNotice'
import type { DashboardUser, Role } from '../../lib/auth'

const roleLabels: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  doctor: 'แพทย์',
  cro: 'เจ้าหน้าที่ CRO',
  nurse: 'พยาบาล',
  lab_staff: 'เจ้าหน้าที่แล็บ',
}

const roleDestinations: Record<Role, string[]> = {
  admin: ['Bookings', 'Patients', 'Reports', 'AI Assistant', 'Users', 'System Health'],
  doctor: ['Schedule', 'Patients', 'Reports', 'AI Assistant', 'Account'],
  cro: ['Bookings', 'New Booking', 'Calendar', 'Patients', 'AI Assistant', 'Account'],
  nurse: ['Patients', 'Reports', 'AI Assistant', 'Account'],
  lab_staff: ['Reports', 'AI Assistant', 'Account'],
}

type SignedInPreviewProps = {
  user: DashboardUser
  notice: string
  onLogout: () => void | Promise<void>
}

export function SignedInPreview({ user, notice, onLogout }: SignedInPreviewProps) {
  return (
    <section>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-bbh-green">
            Signed in
          </p>
          <h2 className="auth-heading mt-2 text-3xl font-semibold text-bbh-ink">
            {user.display_name}
          </h2>
          <p className="mt-2 text-sm text-bbh-muted">
            {roleLabels[user.role]}
            {user.specialty ? ` · ${user.specialty}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-xl border border-bbh-line px-4 py-2 text-sm font-semibold text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green"
        >
          ออก
        </button>
      </div>

      <AuthNotice message={notice} className="mb-5" />

      <div className="rounded-2xl border border-bbh-line p-4">
        <p className="text-sm font-semibold text-bbh-ink">Role-based entry</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {roleDestinations[user.role].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-bbh-line bg-bbh-surface px-3 py-3 text-sm font-medium text-bbh-ink"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
