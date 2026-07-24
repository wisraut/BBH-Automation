type AuthNoticeProps = {
  message: string
  className?: string
}

// แถบข้อความแจ้งเตือนในหน้า auth (เช่น "ล็อกเอาต์แล้ว" / คำเตือนต่างๆ) — ซ่อนอัตโนมัติเมื่อไม่มีข้อความ
export function AuthNotice({ message, className = '' }: AuthNoticeProps) {
  if (!message) {
    return null
  }

  return (
    <div
      className={`rounded-2xl border border-bbh-green/20 bg-bbh-green-soft px-4 py-3 text-sm text-bbh-green-dark ${className}`}
    >
      {message}
    </div>
  )
}
