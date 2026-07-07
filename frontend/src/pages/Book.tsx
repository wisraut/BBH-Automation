// ลงนัดเอง — doctor books an appointment that would enter the CRO approval queue.
// FRONTEND-ONLY: the form + live summary work on local state. The real submit
// (POST as doctor → status='pending_approval', created_by_role='doctor') needs a
// doctor booking endpoint that does not exist yet, so "ยืนยันลงนัด" shows the
// "ส่งให้ CRO แล้ว" confirmation locally without persisting.
import { useMemo, useState } from 'react'
import {
  CalendarPlus,
  Check,
  ChevronRight,
  Loader2,
  Repeat,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react'

import { Modal } from '../components/Modal'
import { usePatients, type PatientListItem } from '../hooks/usePatients'

interface ApptType {
  key: string
  label: string
  duration: number
}
const APPT_TYPES: ApptType[] = [
  { key: 'consult', label: 'ปรึกษา (Consult)', duration: 30 },
  { key: 'followup', label: 'ติดตามผล (Follow-up)', duration: 30 },
  { key: 'new', label: 'ตรวจใหม่ (New)', duration: 45 },
  { key: 'procedure', label: 'หัตถการ / HBOT', duration: 60 },
]
const TIME_SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']
const FREQ_OPTIONS = [
  { key: 1, label: '1 ครั้ง/สัปดาห์' },
  { key: 2, label: '2 ครั้ง/สัปดาห์' },
  { key: 3, label: '3 ครั้ง/สัปดาห์' },
  { key: 5, label: '5 ครั้ง/สัปดาห์' },
]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function Book() {
  const [newPatient, setNewPatient] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PatientListItem | null>(null)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const [typeKey, setTypeKey] = useState('consult')
  const [date, setDate] = useState(todayIso())
  const [time, setTime] = useState('09:00')
  const [notes, setNotes] = useState('')

  const [isCourse, setIsCourse] = useState(false)
  const [sessions, setSessions] = useState(10)
  const [freq, setFreq] = useState(3)

  const [done, setDone] = useState(false)

  // Search real patients only when the user typed something and isn't in
  // "new patient" mode. usePatients hits GET /api/patients (doctor-accessible).
  const patientsQ = usePatients({ search: search.trim(), limit: 8 })
  const results = search.trim().length >= 1 ? patientsQ.data?.data ?? [] : []

  const apptType = APPT_TYPES.find((t) => t.key === typeKey) ?? APPT_TYPES[0]

  const patientLabel = newPatient
    ? newName.trim() || null
    : selected
      ? `${selected.display_name}${selected.hn ? ` · ${selected.hn}` : ''}`
      : null

  const canSubmit = Boolean(patientLabel) && Boolean(date) && Boolean(time) && (!isCourse || sessions > 0)

  const submit = () => {
    if (!canSubmit) return
    // FRONTEND-ONLY: no persistence yet — show the CRO-queue confirmation.
    setDone(true)
  }

  const reset = () => {
    setDone(false)
    setSelected(null)
    setNewName('')
    setNewPhone('')
    setSearch('')
    setNotes('')
    setIsCourse(false)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">Self Booking</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">ลงนัดเอง</h1>
        <p className="mt-1 text-sm text-bbh-muted">
          ลงนัดคนไข้ แล้วส่งเข้าคิวให้ CRO ยืนยัน — ยังไม่ยืนยันทันที
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Form */}
        <div className="space-y-5 rounded-2xl bg-white/80 p-6 ring-1 ring-bbh-line">
          {/* Patient */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-bbh-ink">คนไข้</label>
              <button
                type="button"
                onClick={() => {
                  setNewPatient((v) => !v)
                  setSelected(null)
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-bbh-green-dark hover:underline"
              >
                <UserPlus size={13} /> {newPatient ? 'เลือกจากรายชื่อ' : 'คนไข้ใหม่'}
              </button>
            </div>

            {newPatient ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล"
                  className="rounded-lg border border-bbh-line px-3 py-2 text-sm"
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="เบอร์โทร"
                  className="rounded-lg border border-bbh-line px-3 py-2 text-sm"
                />
              </div>
            ) : selected ? (
              <div className="flex items-center justify-between rounded-lg bg-bbh-green-soft px-3 py-2.5 ring-1 ring-bbh-green/20">
                <span className="text-sm font-semibold text-bbh-ink">
                  {selected.display_name}
                  {selected.hn ? <span className="ml-2 font-mono text-xs text-bbh-muted">{selected.hn}</span> : null}
                </span>
                <button type="button" onClick={() => setSelected(null)} className="text-bbh-muted hover:text-red-600">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-bbh-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ / HN / เบอร์"
                  className="w-full rounded-lg border border-bbh-line py-2 pl-9 pr-3 text-sm"
                />
                {search.trim().length >= 1 ? (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-bbh-line bg-white shadow-sm">
                    {patientsQ.isPending ? (
                      <p className="flex items-center gap-2 px-3 py-3 text-sm text-bbh-muted">
                        <Loader2 size={14} className="animate-spin" /> กำลังค้นหา...
                      </p>
                    ) : results.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-bbh-muted">ไม่พบคนไข้</p>
                    ) : (
                      results.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelected(p)
                            setSearch('')
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bbh-green-soft/50"
                        >
                          <span className="font-medium text-bbh-ink">{p.display_name}</span>
                          <span className="font-mono text-xs text-bbh-muted">{p.hn ?? '-'}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Appointment type */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-bbh-ink">ประเภทนัด</label>
            <div className="grid grid-cols-2 gap-2">
              {APPT_TYPES.map((t) => {
                const active = t.key === typeKey
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTypeKey(t.key)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? 'bg-bbh-green text-white'
                        : 'bg-white text-bbh-ink ring-1 ring-bbh-line hover:bg-bbh-surface'
                    }`}
                  >
                    <span className="font-medium">{t.label}</span>
                    <span className={active ? 'text-white/80' : 'text-bbh-muted'}>{t.duration}น.</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date + time */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-bbh-ink">
              วันที่
              <input
                type="date"
                value={date}
                min={todayIso()}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-bbh-ink">
              เวลา
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Course toggle */}
          <div className="rounded-lg bg-bbh-surface p-3 ring-1 ring-bbh-line">
            <label className="flex items-center gap-2 text-sm font-semibold text-bbh-ink">
              <input type="checkbox" checked={isCourse} onChange={(e) => setIsCourse(e.target.checked)} className="h-4 w-4" />
              <Repeat size={15} className="text-bbh-green" /> จองเป็นคอร์ส
            </label>
            {isCourse ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-bbh-muted">
                  จำนวนครั้ง
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={sessions}
                    onChange={(e) => setSessions(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm text-bbh-ink"
                  />
                </label>
                <label className="block text-xs font-medium text-bbh-muted">
                  ความถี่
                  <select
                    value={freq}
                    onChange={(e) => setFreq(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm text-bbh-ink"
                  >
                    {FREQ_OPTIONS.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          {/* Notes */}
          <label className="block text-sm font-semibold text-bbh-ink">
            หมายเหตุ
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="เช่น อาการ, สิ่งที่ต้องเตรียม"
              className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>

        {/* Live summary */}
        <div className="lg:sticky lg:top-0 h-fit space-y-4 rounded-2xl bg-white/80 p-6 ring-1 ring-bbh-line">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink">สรุปนัด</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-bbh-muted">คนไข้</dt>
              <dd className="text-right font-semibold text-bbh-ink">{patientLabel ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-bbh-muted">ประเภท</dt>
              <dd className="text-right font-semibold text-bbh-ink">{apptType.label}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-bbh-muted">ระยะเวลา</dt>
              <dd className="text-right font-semibold text-bbh-ink">{apptType.duration} นาที</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-bbh-muted">วัน-เวลา</dt>
              <dd className="text-right font-mono text-bbh-ink">{date} {time}</dd>
            </div>
            {isCourse ? (
              <div className="flex justify-between gap-3">
                <dt className="text-bbh-muted">คอร์ส</dt>
                <dd className="text-right font-semibold text-bbh-ink">
                  {sessions} ครั้ง · {FREQ_OPTIONS.find((f) => f.key === freq)?.label}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700 ring-1 ring-amber-200">
            เมื่อยืนยัน นัดจะเข้าคิว <span className="font-semibold">รอ CRO ยืนยัน</span> ก่อนแจ้งคนไข้
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-bbh-green px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-bbh-green-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} /> ยืนยันลงนัด
          </button>
          <p className="text-center text-[11px] text-bbh-muted">
            (พรีวิว — ยังไม่บันทึกจริง รอต่อ endpoint ฝั่งหมอ)
          </p>
        </div>
      </div>

      {/* Sent-to-CRO confirmation */}
      <Modal open={done} title="ส่งให้ CRO แล้ว" onClose={reset} size="md">
        <div className="space-y-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-bbh-green-soft text-bbh-green-dark">
            <Check size={28} />
          </span>
          <div>
            <p className="font-semibold text-bbh-ink">นัดถูกส่งเข้าคิว CRO เรียบร้อย</p>
            <p className="mt-1 text-sm text-bbh-muted">
              สถานะ: <span className="font-semibold text-amber-700">รอ CRO ยืนยัน</span> — เมื่อ CRO อนุมัติ ระบบจะแจ้งคนไข้ทาง LINE
            </p>
          </div>
          <div className="rounded-lg bg-bbh-surface px-3 py-2.5 text-left text-sm ring-1 ring-bbh-line">
            <p className="font-semibold text-bbh-ink">{patientLabel}</p>
            <p className="text-bbh-muted">
              {apptType.label} · {date} {time}
              {isCourse ? ` · คอร์ส ${sessions} ครั้ง` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-xl bg-bbh-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-bbh-green-dark"
          >
            ลงนัดรายการใหม่ <ChevronRight size={15} />
          </button>
        </div>
      </Modal>
    </div>
  )
}
