import { CalendarDays, FileText } from 'lucide-react'

import { SourceBadge } from '../SourceBadge'
import { StatusBadge } from '../StatusBadge'
import type { ReportListItem } from '../../hooks/usePatientReports'
import type { components } from '../../lib/api-types'

type BookingItem = components['schemas']['BookingListItem']

type TimelineItem =
  | { kind: 'report'; id: string; at: string; report: ReportListItem }
  | { kind: 'booking'; id: string; at: string; booking: BookingItem }

const REPORT_TYPE_LABELS: Record<string, string> = {
  lab: 'Lab',
  imaging: 'Imaging',
  history: 'History',
  prescription: 'Prescription',
  referral: 'Referral',
  other: 'Other',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function reportItems(reports: ReportListItem[]): TimelineItem[] {
  return reports.map((report) => ({
    kind: 'report',
    id: `report-${report.id}`,
    at: report.uploaded_at,
    report,
  }))
}

function bookingItems(bookings: BookingItem[]): TimelineItem[] {
  return bookings.map((booking) => ({
    kind: 'booking',
    id: `booking-${booking.request_uid}`,
    at: booking.created_at,
    booking,
  }))
}

interface PatientTimelineProps {
  reports: ReportListItem[]
  bookings: BookingItem[]
  onSelectReport?: (id: number) => void
}

export function PatientTimeline({ reports, bookings, onSelectReport }: PatientTimelineProps) {
  const items = [...reportItems(reports), ...bookingItems(bookings)].sort((a, b) => b.at.localeCompare(a.at))

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
        ยังไม่มี timeline ของคนไข้รายนี้
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex gap-3 rounded-xl border border-bbh-line bg-white p-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bbh-surface text-bbh-green">
            {item.kind === 'report' ? <FileText size={17} /> : <CalendarDays size={17} />}
          </div>
          <div className="min-w-0 flex-1">
            {item.kind === 'report' ? (
              <button
                type="button"
                onClick={() => onSelectReport?.(item.report.id)}
                className="block w-full text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-bbh-ink">{item.report.title}</span>
                  <span className="rounded-full bg-bbh-green-soft px-2 py-0.5 text-xs font-medium text-bbh-green-dark">
                    {REPORT_TYPE_LABELS[item.report.report_type] ?? item.report.report_type}
                  </span>
                  <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-xs text-bbh-muted">
                    {item.report.source}
                  </span>
                </div>
                <p className="mt-1 text-xs text-bbh-muted">
                  {formatDate(item.report.uploaded_at)} · {item.report.has_extracted_text ? 'มีข้อความสำหรับวิเคราะห์' : 'ยังไม่มีข้อความ OCR'}
                </p>
              </button>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.booking.status} />
                  <SourceBadge source={item.booking.booking_source} />
                </div>
                <p className="mt-1 text-sm font-medium text-bbh-ink">
                  {item.booking.requested_datetime_text || item.booking.appointment_type}
                </p>
                <p className="mt-1 text-xs text-bbh-muted">
                  {formatDate(item.booking.created_at)}{item.booking.symptom ? ` · ${item.booking.symptom}` : ''}
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
