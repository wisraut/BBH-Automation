import { useState } from 'react'
import { Search } from 'lucide-react'

import { Modal } from '../Modal'
import { usePatients } from '../../hooks/usePatients'
import type { components } from '../../lib/api-types'

type PatientListItem = components['schemas']['PatientListItem']

interface PatientPickerModalProps {
  open: boolean
  onClose: () => void
  onPick: (p: PatientListItem) => void
  title?: string
}

export function PatientPickerModal({ open, onClose, onPick, title = 'เลือกคนไข้ที่จะถาม AI' }: PatientPickerModalProps) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = usePatients({ search, page: 1, limit: 20 })
  const rows = data?.data ?? []

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bbh-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยชื่อ / HN / เบอร์"
            className="h-11 w-full rounded-2xl border border-bbh-line bg-white pl-9 pr-3 text-sm outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-2xl border border-bbh-line">
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
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-bbh-green-soft"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-bbh-ink">{p.display_name}</p>
                      <p className="text-xs text-bbh-muted">
                        {p.hn ? `HN ${p.hn} · ` : ''}{p.phone ?? '-'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-bbh-muted">
                      <p>นัด: {p.total_bookings}</p>
                      <p>Report: {p.total_reports}</p>
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
