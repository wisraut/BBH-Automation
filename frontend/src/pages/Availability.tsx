// ตารางว่างของฉัน — weekly free/busy grid the doctor sets.
// FRONTEND-ONLY: interaction is fully working on local state. Persistence
// (GET/PUT /api/doctors/me/availability) is a future backend task, so "บันทึก"
// currently keeps the change in memory and shows a confirmation toast.
import { useMemo, useState } from 'react'
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  Save,
} from 'lucide-react'

import { useToast } from '../hooks/useToast'

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']
const DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
// Monday of the week containing `d` (local).
function mondayOf(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const dow = (copy.getDay() + 6) % 7 // Mon=0 … Sun=6
  copy.setDate(copy.getDate() - dow)
  return copy
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}
function slotKey(dateIso: string, hour: string): string {
  return `${dateIso} ${hour}`
}
function formatRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${weekStart.toLocaleDateString('th-TH', opt)} – ${end.toLocaleDateString('th-TH', opt)}`
}

export function Availability() {
  const toast = useToast()
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  // open slots keyed by "YYYY-MM-DD HH:MM"; a map per week is kept implicitly
  // because keys embed the date, so navigating weeks preserves each week's state.
  const [open, setOpen] = useState<Set<string>>(new Set())

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const weekIsos = useMemo(() => weekDates.map(isoDate), [weekDates])
  const todayIso = isoDate(new Date())

  const isOpen = (dateIso: string, hour: string) => open.has(slotKey(dateIso, hour))

  const toggleSlot = (dateIso: string, hour: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      const k = slotKey(dateIso, hour)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  // Toggle a whole day: if any slot is closed, open all; else close all.
  const toggleDay = (dateIso: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      const anyClosed = HOURS.some((h) => !next.has(slotKey(dateIso, h)))
      for (const h of HOURS) {
        const k = slotKey(dateIso, h)
        if (anyClosed) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  const setWeek = (isos: string[], value: boolean) => {
    setOpen((prev) => {
      const next = new Set(prev)
      for (const dateIso of isos) {
        for (const h of HOURS) {
          const k = slotKey(dateIso, h)
          if (value) next.add(k)
          else next.delete(k)
        }
      }
      return next
    })
  }

  const openAllWeek = () => setWeek(weekIsos, true)
  const openWeekdays = () => {
    setWeek(weekIsos, false)
    setWeek(weekIsos.slice(0, 5), true)
  }
  const clearWeek = () => setWeek(weekIsos, false)

  // Copy previous week's pattern (by weekday offset) into the current week.
  const copyPrevWeek = () => {
    const prevIsos = weekDates.map((d) => isoDate(addDays(d, -7)))
    setOpen((prev) => {
      const next = new Set(prev)
      weekIsos.forEach((dateIso, i) => {
        for (const h of HOURS) {
          const src = slotKey(prevIsos[i], h)
          const dst = slotKey(dateIso, h)
          if (prev.has(src)) next.add(dst)
          else next.delete(dst)
        }
      })
      return next
    })
    toast.show('success', 'คัดลอกจากสัปดาห์ก่อนแล้ว')
  }

  const openCount = useMemo(
    () => weekIsos.reduce((sum, d) => sum + HOURS.filter((h) => open.has(slotKey(d, h))).length, 0),
    [weekIsos, open],
  )
  const openDays = useMemo(
    () => weekIsos.filter((d) => HOURS.some((h) => open.has(slotKey(d, h)))).length,
    [weekIsos, open],
  )

  const save = () => {
    // FRONTEND-ONLY: no PUT endpoint yet. Keep local + inform the user.
    toast.show('success', 'บันทึกไว้ในเครื่องแล้ว (ยังไม่ต่อ backend)')
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-2xl bg-white/80 p-4 ring-1 ring-bbh-line md:p-7">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">My Availability</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">ตารางว่างของฉัน</h1>
          <p className="mt-1 text-sm text-bbh-muted">
            คลิกช่องเพื่อสลับ ว่าง / ไม่ว่าง · คลิกหัววันเพื่อเปิด-ปิดทั้งวัน — ระบบจะเสนอเฉพาะเวลาที่เปิดว่างให้การจอง
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bbh-green-dark"
        >
          <Save size={16} /> บันทึก
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="grid h-9 w-9 place-items-center rounded-lg bg-white text-bbh-muted ring-1 ring-bbh-line transition-colors hover:text-bbh-green-dark"
            aria-label="สัปดาห์ก่อน"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-bbh-ink">{formatRange(weekStart)}</span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="grid h-9 w-9 place-items-center rounded-lg bg-white text-bbh-muted ring-1 ring-bbh-line transition-colors hover:text-bbh-green-dark"
            aria-label="สัปดาห์ถัดไป"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-bbh-muted ring-1 ring-bbh-line transition-colors hover:text-bbh-green-dark"
          >
            สัปดาห์นี้
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <button type="button" onClick={openAllWeek} className="rounded-lg bg-bbh-green-soft px-3 py-1.5 text-bbh-green-dark ring-1 ring-bbh-green/20 hover:ring-bbh-green/40">
            เปิดทั้งสัปดาห์
          </button>
          <button type="button" onClick={openWeekdays} className="rounded-lg bg-white px-3 py-1.5 text-bbh-muted ring-1 ring-bbh-line hover:text-bbh-green-dark">
            จ–ศ
          </button>
          <button type="button" onClick={copyPrevWeek} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-bbh-muted ring-1 ring-bbh-line hover:text-bbh-green-dark">
            <Copy size={13} /> คัดลอกสัปดาห์ก่อน
          </button>
          <button type="button" onClick={clearWeek} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-bbh-muted ring-1 ring-bbh-line hover:text-red-600">
            <Eraser size={13} /> ล้าง
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Day header row */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-1.5">
            <div />
            {weekDates.map((d, i) => {
              const iso = weekIsos[i]
              const allOpen = HOURS.every((h) => isOpen(iso, h))
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDay(iso)}
                  className={`rounded-lg py-2 text-center transition-colors ${
                    iso === todayIso ? 'ring-1 ring-bbh-green' : ''
                  } ${allOpen ? 'bg-bbh-green-soft text-bbh-green-dark' : 'bg-white text-bbh-ink ring-1 ring-bbh-line hover:bg-bbh-surface'}`}
                  title="เปิด/ปิดทั้งวัน"
                >
                  <span className="block text-xs font-semibold">{DAY_LABELS[i]}</span>
                  <span className="mt-0.5 block font-mono text-sm">{d.getDate()}</span>
                </button>
              )
            })}
          </div>

          {/* Time rows */}
          <div className="mt-1.5 space-y-1.5">
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-[64px_repeat(7,1fr)] gap-1.5">
                <div className="flex items-center justify-end pr-2 font-mono text-xs text-bbh-muted">{hour}</div>
                {weekIsos.map((iso) => {
                  const on = isOpen(iso, hour)
                  return (
                    <button
                      key={`${iso}-${hour}`}
                      type="button"
                      onClick={() => toggleSlot(iso, hour)}
                      className={`h-10 rounded-lg text-xs font-semibold transition-colors ${
                        on
                          ? 'bg-bbh-green text-white hover:bg-bbh-green-dark'
                          : 'bg-white text-transparent ring-1 ring-bbh-line hover:bg-bbh-green-soft/40'
                      }`}
                      aria-label={`${iso} ${hour} ${on ? 'ว่าง' : 'ไม่ว่าง'}`}
                    >
                      {on ? <Check size={14} className="mx-auto" /> : '·'}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 flex items-center gap-3 rounded-xl bg-bbh-surface px-4 py-3 text-sm ring-1 ring-bbh-line">
        <CalendarClock size={18} className="text-bbh-green" />
        <span className="text-bbh-ink">
          สัปดาห์นี้เปิดว่าง <span className="font-semibold text-bbh-green-dark">{openCount}</span> ชม. ·{' '}
          <span className="font-semibold text-bbh-green-dark">{openDays}</span> วัน
        </span>
      </div>
    </div>
  )
}
