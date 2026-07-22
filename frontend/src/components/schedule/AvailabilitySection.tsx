// Doctor edits their recurring weekly "open for booking" template. Saving does a
// full PUT-replace. This is the POSITIVE layer (open hours); the ลา/ไม่อยู่ blocks
// remain the negative time-off layer. When a doctor sets any hours, bookings
// outside them are rejected server-side (DOCTOR_UNAVAILABLE); an empty template
// means "no restriction".
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, Plus, X, Loader2 } from 'lucide-react'

import { useAuth } from '../../lib/auth'
import { useAvailability, useSaveAvailability, type AvailabilityRange } from '../../hooks/useAvailability'
import { useToast } from '../../hooks/useToast'
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-1'

interface Row extends AvailabilityRange { key: number }
let _key = 0
const nextKey = () => ++_key

export function AvailabilitySection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const doctorId = user ? Number(user.id) : undefined
  const q = useAvailability(doctorId)
  const save = useSaveAvailability()
  const toast = useToast()
  const DAY_LABELS = [
    t('availabilitySection.days.mon'),
    t('availabilitySection.days.tue'),
    t('availabilitySection.days.wed'),
    t('availabilitySection.days.thu'),
    t('availabilitySection.days.fri'),
    t('availabilitySection.days.sat'),
    t('availabilitySection.days.sun'),
  ]
  const [rows, setRows] = useState<Row[]>([])
  const [dirty, setDirty] = useState(false)

  // Load server template into local editable state — but never clobber the
  // doctor's unsaved edits when a background refetch resolves.
  useEffect(() => {
    if (!q.data || dirty) return
    setRows(q.data.data.map((r) => ({ key: nextKey(), day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time })))
    setDirty(false)
  }, [q.data, dirty])

  if (!doctorId) return null

  const addRange = (day: number) => {
    setRows((prev) => [...prev, { key: nextKey(), day_of_week: day, start_time: '09:00', end_time: '12:00' }])
    setDirty(true)
  }
  const removeRange = (key: number) => {
    setRows((prev) => prev.filter((r) => r.key !== key))
    setDirty(true)
  }
  const editRange = (key: number, patch: Partial<AvailabilityRange>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  const fillWeekdays = () => {
    setRows(
      [0, 1, 2, 3, 4].map((d) => ({ key: nextKey(), day_of_week: d, start_time: '09:00', end_time: '17:00' })),
    )
    setDirty(true)
  }

  const onSave = () => {
    for (const r of rows) {
      if (r.end_time <= r.start_time) {
        toast.show('error', t('availabilitySection.endAfterStart', { day: DAY_LABELS[r.day_of_week] }))
        return
      }
    }
    save.mutate(
      { doctorId, ranges: rows.map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time })) },
      {
        onSuccess: () => { setDirty(false); toast.show('success', t('availabilitySection.saved')) },
        onError: () => toast.show('error', t('availabilitySection.saveFailed')),
      },
    )
  }

  const timeClass = `h-8 rounded-md border border-bbh-line bg-white px-2 font-mono text-xs tabular-nums text-bbh-ink ${FOCUS_RING}`

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-bbh-ink md:text-xl">
          <CalendarCheck size={16} className="text-bbh-green" />
          {t('availabilitySection.title')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fillWeekdays}
            className={`rounded-lg border border-bbh-line bg-white px-3 py-1.5 text-xs font-medium text-bbh-muted transition-colors hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            {t('availabilitySection.weekdayPreset')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || save.isPending}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-bbh-green px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-bbh-green-dark disabled:opacity-50 ${FOCUS_RING}`}
          >
            {save.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
            {t('common.save')}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs leading-5 text-bbh-muted">
        {t('availabilitySection.description')}
      </p>

      <div className="grid gap-2 md:grid-cols-2">
        {DAY_LABELS.map((label, day) => {
          const dayRows = rows.filter((r) => r.day_of_week === day)
          return (
            <div key={day} className="rounded-xl border border-bbh-line bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-bbh-ink">{label}</p>
                <button
                  type="button"
                  onClick={() => addRange(day)}
                  className={`inline-flex items-center gap-1 rounded-md border border-bbh-line px-2 py-1 text-xs font-medium text-bbh-muted transition-colors hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                >
                  <Plus size={11} /> {t('availabilitySection.addRange')}
                </button>
              </div>
              {dayRows.length === 0 ? (
                <p className="text-xs text-bbh-muted">{t('availabilitySection.closed')}</p>
              ) : (
                <div className="space-y-1.5">
                  {dayRows.map((r) => (
                    <div key={r.key} className="flex items-center gap-1.5">
                      <input type="time" value={r.start_time} onChange={(e) => editRange(r.key, { start_time: e.target.value })} className={timeClass} />
                      <span className="text-bbh-muted">–</span>
                      <input type="time" value={r.end_time} onChange={(e) => editRange(r.key, { end_time: e.target.value })} className={timeClass} />
                      <button
                        type="button"
                        onClick={() => removeRange(r.key)}
                        title={t('availabilitySection.removeRange')}
                        className={`ml-auto grid h-7 w-7 place-items-center rounded-md border border-bbh-line text-bbh-muted transition-colors hover:border-red-300 hover:text-red-600 ${FOCUS_RING}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
