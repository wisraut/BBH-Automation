// Persistent allergy warning shown wherever clinical decisions are made
// (upload report, analyze, decide triage). Pulls from patient medical bundle.
import { AlertTriangle, ShieldAlert } from 'lucide-react'

import { usePatientMedicalBundle, type AllergyOut } from '../../hooks/usePatientMedicalBundle'

const SEVERITY_RANK: Record<string, number> = {
  life_threatening: 4, severe: 3, moderate: 2, mild: 1,
}

function topSeverity(allergies: AllergyOut[]): string | null {
  let best: string | null = null
  let bestRank = 0
  for (const a of allergies) {
    if (!a.severity) continue
    const r = SEVERITY_RANK[a.severity] ?? 0
    if (r > bestRank) { bestRank = r; best = a.severity }
  }
  return best
}

// Optional cross-reference: scan caller-supplied text (report title/notes/
// extracted_text) for allergen mentions and surface matched ones first.
function scanMatches(allergies: AllergyOut[], text: string | undefined): AllergyOut[] {
  if (!text) return []
  const low = text.toLowerCase()
  return allergies.filter((a) => {
    const allergen = (a.allergen || '').trim().toLowerCase()
    return allergen.length >= 3 && low.includes(allergen)
  })
}

interface Props {
  patientId: number
  /** Optional text to scan for allergen mentions (report title + notes). */
  scanText?: string
  /** Compact mode for small contexts (modals). */
  compact?: boolean
}

export function AllergyBanner({ patientId, scanText, compact = false }: Props) {
  const q = usePatientMedicalBundle(patientId)
  const allergies = q.data?.allergies ?? []
  if (allergies.length === 0) return null

  const matches = scanMatches(allergies, scanText)
  const sev = topSeverity(allergies)
  const isCritical = matches.length > 0 || sev === 'life_threatening' || sev === 'severe'

  const tone = isCritical
    ? 'border-red-300 bg-red-50 text-red-800'
    : 'border-amber-200 bg-amber-50 text-amber-800'
  const Icon = isCritical ? ShieldAlert : AlertTriangle

  return (
    <div className={`rounded-xl border ${tone} ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-start gap-2">
        <Icon size={compact ? 14 : 16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>
            {matches.length > 0
              ? `แจ้งเตือน: ข้อความนี้กล่าวถึง allergen ที่คนไข้แพ้`
              : `คนไข้มีประวัติแพ้ ${allergies.length} รายการ`}
          </p>
          <ul className={`mt-1 flex flex-wrap gap-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {(matches.length > 0 ? matches : allergies).map((a) => (
              <li
                key={a.id}
                className={`rounded-full border px-2 py-0.5 font-mono ${
                  matches.includes(a) ? 'border-red-400 bg-white text-red-700' : 'border-current bg-white/60'
                }`}
              >
                {a.allergen}
                {a.severity ? ` (${a.severity})` : ''}
                {a.reaction ? ` → ${a.reaction}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
