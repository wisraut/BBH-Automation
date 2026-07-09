const LABELS: Record<string, string> = {
  line: 'LINE',
  phone: 'โทร',
  whatsapp: 'WhatsApp',
  email: 'Email',
  walkin: 'Walk-in',
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-bbh-line bg-bbh-surface px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-bbh-muted">
      {LABELS[source] ?? source}
    </span>
  )
}
