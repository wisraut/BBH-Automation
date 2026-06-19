const LABELS: Record<string, string> = {
  line: 'LINE',
  phone: 'โทร',
  whatsapp: 'WhatsApp',
  email: 'Email',
  walkin: 'Walk-in',
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-bbh-surface px-2 py-0.5 text-[11px] font-medium text-bbh-muted">
      {LABELS[source] ?? source}
    </span>
  )
}
