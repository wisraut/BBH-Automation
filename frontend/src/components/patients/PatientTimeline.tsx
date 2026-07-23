import { useTranslation } from 'react-i18next'
import { dateLocale } from '../../i18n/datetime'
import { CalendarDays, FileText } from 'lucide-react'

import { SourceBadge } from '../SourceBadge'
import { staggerStyle } from '../../lib/motion'
import { StatusBadge } from '../StatusBadge'
import type { ReportListItem } from '../../hooks/usePatientReports'
import type { components } from '../../lib/api-types'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

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
  return new Date(iso).toLocaleDateString(dateLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// แปลง report/booking ให้เป็น TimelineItem รูปแบบเดียวกัน (มี kind + เวลา) เพื่อเอามาเรียงรวมในไทม์ไลน์เดียว
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

// ไทม์ไลน์รวมของคนไข้ — ผสม report ที่อัปโหลดกับ booking นัดหมาย เรียงใหม่สุดขึ้นก่อน
// ให้เห็นลำดับเหตุการณ์ทั้งหมดในที่เดียว; คลิก report เพื่อเปิดดูรายละเอียดได้
export function PatientTimeline({ reports, bookings, onSelectReport }: PatientTimelineProps) {
  const { t } = useTranslation()
  const items = [...reportItems(reports), ...bookingItems(bookings)].sort((a, b) => b.at.localeCompare(a.at))

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
        {t('patientTimeline.empty')}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
      <div className="divide-y divide-bbh-line">
        {items.map((item, i) =>
          item.kind === 'report' ? (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectReport?.(item.report.id)}
              style={staggerStyle(i)}
              className={`animate-rise flex w-full items-start gap-3 px-4 py-4 text-left transition-colors duration-200 hover:bg-bbh-surface ${FOCUS_RING}`}
            >
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bbh-surface text-bbh-muted">
                <FileText size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-bbh-ink">{item.report.title}</span>
                  <span className="inline-flex items-center rounded-full border border-bbh-line bg-white px-2 py-0.5 text-xs font-medium text-bbh-muted">
                    {REPORT_TYPE_LABELS[item.report.report_type] ?? item.report.report_type}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 text-xs text-bbh-muted">
                    {item.report.source}
                  </span>
                </div>
                <p className="mt-1 text-xs text-bbh-muted">
                  <span className="font-mono tabular-nums">{formatDate(item.report.uploaded_at)}</span> · {item.report.has_extracted_text ? t('patientTimeline.hasText') : t('patientTimeline.noOcrText')}
                </p>
              </div>
            </button>
          ) : (
            <div
              key={item.id}
              style={staggerStyle(i)}
              className="animate-rise flex items-start gap-3 px-4 py-4"
            >
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bbh-surface text-bbh-muted">
                <CalendarDays size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.booking.status} />
                  <SourceBadge source={item.booking.booking_source} />
                </div>
                <p className="mt-1 font-mono text-sm font-medium tabular-nums text-bbh-ink">
                  {item.booking.requested_datetime_text || item.booking.appointment_type}
                </p>
                <p className="mt-1 text-xs text-bbh-muted">
                  <span className="font-mono tabular-nums">{formatDate(item.booking.created_at)}</span>{item.booking.symptom ? ` · ${item.booking.symptom}` : ''}
                </p>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
