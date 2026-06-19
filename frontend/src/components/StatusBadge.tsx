import type { BookingStatus } from '../hooks/useBookings'

const LABELS: Record<BookingStatus, string> = {
  draft: 'ร่าง',
  pending_approval: 'รอยืนยัน',
  approved: 'ยืนยันแล้ว',
  rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิก',
  expired: 'หมดอายุ',
}

const STYLES: Record<BookingStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-bbh-green-soft text-bbh-green-dark border border-bbh-green/30',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  cancelled: 'bg-gray-100 text-gray-500',
  expired: 'bg-gray-100 text-gray-500',
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
