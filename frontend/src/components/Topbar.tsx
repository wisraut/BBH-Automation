import { useAuth } from '../lib/auth'
import type { Role } from '../lib/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  doctor: 'แพทย์',
  cro: 'เจ้าหน้าที่ CRO',
}

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { user, logout } = useAuth()

  return (
    <header className="flex items-center justify-between border-b border-bbh-line bg-white px-8 py-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-bbh-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-bbh-muted">{subtitle}</p> : null}
      </div>
      {user ? (
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-bbh-ink">{user.display_name}</p>
            <p className="text-xs text-bbh-muted">{ROLE_LABELS[user.role]}</p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-bbh-green-soft text-sm font-semibold text-bbh-green-dark">
            {user.display_name.slice(0, 1)}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-xl border border-bbh-line px-3 py-2 text-sm font-medium text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green"
          >
            ออก
          </button>
        </div>
      ) : null}
    </header>
  )
}
