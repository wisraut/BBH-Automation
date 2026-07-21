import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, UserRound } from 'lucide-react'

import { Modal } from '../Modal'
import type { PatientCreateRequest } from '../../hooks/useCreatePatient'
import type { PatientOut } from '../../hooks/usePatient'
import type { PatientUpdateRequest } from '../../hooks/useUpdatePatient'

type Gender = NonNullable<PatientCreateRequest['gender']>

// Canonical nationality options — kept in sync with the LINE bot's normalize
// target (rag/prompts.py) so both channels store the same values. "อื่นๆ" reveals
// a free-text field for the long tail.
const NATIONALITIES = [
  'ไทย', 'เมียนมา', 'กัมพูชา', 'ลาว', 'เวียดนาม', 'มาเลเซีย', 'จีน',
  'อินเดีย', 'ญี่ปุ่น', 'เกาหลีใต้', 'ฟิลิปปินส์', 'สหรัฐอเมริกา', 'สหราชอาณาจักร',
]
const OTHER = '__other__'

type FormState = {
  display_name: string
  phone: string
  email: string
  dob: string
  gender: Gender
  nationality: string
  notes: string
}

interface PatientFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  patient?: PatientOut | null
  saving?: boolean
  onClose: () => void
  onSubmit: (body: PatientCreateRequest | PatientUpdateRequest) => void
}

const EMPTY: FormState = {
  display_name: '',
  phone: '',
  email: '',
  dob: '',
  gender: 'unknown',
  nationality: '',
  notes: '',
}

function clean(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

// Modal ฟอร์มเพิ่ม/แก้ไขข้อมูลคนไข้ (ชื่อ/เบอร์/อีเมล/วันเกิด/เพศ/โน้ต) — ใช้ทั้งตอน
// สร้างคนไข้ใหม่และแก้ข้อมูลเดิม (mode create/edit) จากหน้ารายชื่อคนไข้
export function PatientFormModal({ open, mode, patient, saving, onClose, onSubmit }: PatientFormModalProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(EMPTY)
  // Whether the nationality picker is in free-text mode (value not in the list).
  const [natOther, setNatOther] = useState(false)

  useEffect(() => {
    if (!open) return
    const nat = patient?.nationality ?? ''
    setForm({
      display_name: patient?.display_name ?? '',
      phone: patient?.phone ?? '',
      email: patient?.email ?? '',
      dob: patient?.dob ?? '',
      gender: patient?.gender ?? 'unknown',
      nationality: nat,
      notes: patient?.notes ?? '',
    })
    setNatOther(!!nat && !NATIONALITIES.includes(nat))
  }, [open, patient])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const body = {
      display_name: form.display_name.trim(),
      phone: clean(form.phone),
      email: clean(form.email),
      dob: clean(form.dob),
      gender: form.gender,
      nationality: clean(form.nationality),
      notes: clean(form.notes),
    }
    onSubmit(body)
  }

  return (
    <Modal open={open} title={mode === 'create' ? t('patientFormModal.addTitle') : t('patientFormModal.editTitle')} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-bbh-ink">
          {t('patientFormModal.fullName')}
          <input
            required
            value={form.display_name}
            onChange={(e) => update('display_name', e.target.value)}
            className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
          />
        </label>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.phone')}
            <input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
            />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.email')}
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
            />
          </label>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.dob')}
            <input
              type="date"
              value={form.dob}
              onChange={(e) => update('dob', e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
            />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.sex')}
            <select
              value={form.gender}
              onChange={(e) => update('gender', e.target.value as Gender)}
              className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
            >
              <option value="unknown">{t('patientFormModal.sexUnknown')}</option>
              <option value="female">{t('patientFormModal.sexFemale')}</option>
              <option value="male">{t('patientFormModal.sexMale')}</option>
              <option value="other">{t('patientFormModal.sexOther')}</option>
            </select>
          </label>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.nationality')}
            <select
              value={natOther ? OTHER : form.nationality}
              onChange={(e) => {
                const v = e.target.value
                if (v === OTHER) { setNatOther(true); update('nationality', '') }
                else { setNatOther(false); update('nationality', v) }
              }}
              className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
            >
              <option value="">{t('patientFormModal.nationalityUnset')}</option>
              {NATIONALITIES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value={OTHER}>{t('patientFormModal.nationalityOther')}</option>
            </select>
          </label>
          {natOther && (
            <label className="block text-sm font-medium text-bbh-ink">
              {t('patientFormModal.nationalitySpecify')}
              <input
                value={form.nationality}
                maxLength={60}
                onChange={(e) => update('nationality', e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
              />
            </label>
          )}
        </div>

        <label className="block text-sm font-medium text-bbh-ink">
          {t('patientFormModal.notes')}
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="mt-1 w-full resize-none rounded-xl border border-bbh-line px-3 py-3 text-sm focus:border-bbh-green focus:outline-none"
          />
        </label>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-bbh-line px-4 text-sm text-bbh-muted hover:text-bbh-ink sm:h-auto sm:py-2">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || !form.display_name.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-bbh-green px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-auto sm:py-2"
          >
            {mode === 'create' ? <UserRound size={16} /> : <Save size={16} />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

