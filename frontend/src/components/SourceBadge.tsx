import { useTranslation } from 'react-i18next'

const SOURCE_KEYS = new Set(['line', 'phone', 'whatsapp', 'email', 'walkin'])

// ป้ายบอกช่องทางที่ได้นัดมา (LINE/โทร/WhatsApp/อีเมล/walk-in) — ใช้ในตาราง/การ์ดรายการนัด
export function SourceBadge({ source }: { source: string }) {
  const { t } = useTranslation()
  const label = SOURCE_KEYS.has(source) ? t(`sourceBadge.${source}`) : source
  return (
    <span className="inline-flex items-center rounded-md border border-bbh-line bg-bbh-surface px-2 py-0.5 font-mono text-xs font-medium tracking-wide text-bbh-muted">
      {label}
    </span>
  )
}
