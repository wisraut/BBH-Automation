import { useState } from 'react'
import { Search } from 'lucide-react'

import { Modal } from '../Modal'
import { usePatients } from '../../hooks/usePatients'
import type { components } from '../../lib/api-types'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

type PatientListItem = components['schemas']['PatientListItem']

interface PatientPickerModalProps {
  open: boolean
  onClose: () => void
  onPick: (p: PatientListItem) => void
}

export function PatientPickerModal({ open, onClose, onPick }: PatientPickerModalProps) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = usePatients({ search, page: 1, limit: 20 })
  const rows = data?.data ?? []

  return (
    <Modal open={open} title="เลือกคนไข้ที่จะถาม AI" onClose={onClose}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bbh-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยชื่อ / HN / เบอร์"
            className="h-11 w-full rounded-lg border border-bbh-line bg-white pl-9 pr-3 text-sm text-bbh-ink transition-colors duration-200 placeholder:text-bbh-muted focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-bbh-line bg-white">
          {isLoading ? (
            <p className="p-6 text-center text-sm text-bbh-muted">กำลังโหลด...</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-bbh-muted">ไม่พบคนไข้</p>
          ) : (
            <ul className="divide-y divide-bbh-line">
              {rows.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { onPick(p); onClose() }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors duration-200 hover:bg-bbh-surface ${FOCUS_RING}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-bbh-ink">{p.display_name}</p>
                      <p className="text-xs text-bbh-muted">
                        {p.hn ? <span className="font-mono tabular-nums">HN {p.hn}</span> : null}
                        {p.hn ? ' · ' : ''}
                        <span className="font-mono tabular-nums">{p.phone ?? '-'}</span>
                      </p>
                    </div>
                    <div className="text-right text-xs text-bbh-muted">
                      <p>นัด: <span className="font-mono tabular-nums">{p.total_bookings}</span></p>
                      <p>Report: <span className="font-mono tabular-nums">{p.total_reports}</span></p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
