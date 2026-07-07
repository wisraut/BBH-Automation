// Honest scaffold placeholder for doctor pages whose backend arrives in a later phase.
// Renders an intentional empty state (no mock data) describing what the page will do.
import type { LucideIcon } from 'lucide-react'

interface PagePlaceholderProps {
  icon: LucideIcon
  title: string
  description: string
  points?: string[]
  phaseNote?: string
}

export function PagePlaceholder({ icon: Icon, title, description, points, phaseNote }: PagePlaceholderProps) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white/80 p-8 text-center ring-1 ring-bbh-line">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-bbh-green-soft text-bbh-green-dark">
          <Icon size={26} />
        </span>
        <h2 className="mt-5 font-serif text-2xl font-semibold text-bbh-ink">{title}</h2>
        <p className="mt-2 text-sm text-bbh-muted">{description}</p>
        {points && points.length > 0 ? (
          <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-bbh-ink">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bbh-green" />
                {p}
              </li>
            ))}
          </ul>
        ) : null}
        {phaseNote ? (
          <p className="mt-6 inline-block rounded-full bg-bbh-surface px-3 py-1 text-xs font-semibold text-bbh-muted ring-1 ring-bbh-line">
            {phaseNote}
          </p>
        ) : null}
      </div>
    </div>
  )
}
