type AuthNoticeProps = {
  message: string
  className?: string
}

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
