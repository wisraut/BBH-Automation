import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Printer, Save, X } from 'lucide-react'

import { usePatient } from '../../hooks/usePatient'
import { useUpdatePatient } from '../../hooks/useUpdatePatient'
import { useToast } from '../../hooks/useToast'
import { ApiError } from '../../lib/api'
import { Eyebrow } from '../ui/Eyebrow'

const NATIONALITIES = [
  'ไทย', 'เมียนมา', 'กัมพูชา', 'ลาว', 'เวียดนาม', 'มาเลเซีย', 'จีน',
  'อินเดีย', 'ญี่ปุ่น', 'เกาหลีใต้', 'ฟิลิปปินส์', 'สหรัฐอเมริกา', 'สหราชอาณาจักร',
]
const OTHER = '__other__'
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

interface Form {
  display_name: string
  gender: string
  dob: string
  national_id: string
  nationality: string
  blood_type: string
  phone: string
  phone2: string
  phone3: string
  phone4: string
  email: string
  address: string
  intake_by: string
  notes: string
}
const EMPTY: Form = {
  display_name: '', gender: '', dob: '', national_id: '', nationality: '', blood_type: '',
  phone: '', phone2: '', phone3: '', phone4: '', email: '', address: '', intake_by: '', notes: '',
}

const BASE = 'w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

// Read-only value row (view mode).
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5">
      <span className="text-xs text-bbh-muted">{label}</span>
      <span className="text-sm text-bbh-ink">{value?.trim() ? value : '—'}</span>
    </div>
  )
}
function Head({ text }: { text: string }) {
  return <Eyebrow>{text}</Eyebrow>
}

// The editable "personal profile" tab of the patient record. Read-only by default
// (a hospital chart — edits are deliberate) with an Edit toggle; grouped sections
// + content-width fields per the form-design research applied to the intake modal.
export function PatientProfileSection({ patientId }: { patientId: number }) {
  const { t } = useTranslation()
  const patientQ = usePatient(patientId)
  const update = useUpdatePatient()
  const toast = useToast()
  const p = patientQ.data

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Form>(EMPTY)
  const [natOther, setNatOther] = useState(false)

  function startEdit() {
    if (!p) return
    const nat = p.nationality ?? ''
    setForm({
      display_name: p.display_name ?? '', gender: p.gender ?? '', dob: p.dob ?? '',
      national_id: p.national_id ?? '', nationality: nat, blood_type: p.blood_type ?? '',
      phone: p.phone ?? '', phone2: p.phone2 ?? '', phone3: p.phone3 ?? '', phone4: p.phone4 ?? '',
      email: p.email ?? '', address: p.address ?? '', intake_by: p.intake_by ?? '', notes: p.notes ?? '',
    })
    setNatOther(!!nat && !NATIONALITIES.includes(nat))
    setEditing(true)
  }
  // Leave edit mode if the selected patient changes underneath us.
  useEffect(() => { setEditing(false) }, [patientId])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    // Send trimmed values; empty string clears the field (null).
    const body = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v.trim() || null]),
    )
    try {
      await update.mutateAsync({ id: patientId, body })
      toast.show('success', t('patientProfile.saved'))
      setEditing(false)
    } catch (error) {
      toast.show('error', error instanceof ApiError ? error.message : t('patientProfile.saveFailed'))
    }
  }

  if (patientQ.isLoading || !p) {
    return <p className="text-sm text-bbh-muted">{t('common.loading')}</p>
  }

  const genderLabel = p.gender ? t(`patientFormModal.sex${p.gender[0].toUpperCase()}${p.gender.slice(1)}`) : '—'

  if (!editing) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Head text={t('patients.tabs.profile')} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.open(`/print/patient/${patientId}`, '_blank')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-3 py-1.5 text-xs font-medium text-bbh-ink transition-colors hover:border-bbh-green hover:text-bbh-green-dark"
            >
              <Printer size={13} /> {t('patientProfile.print')}
            </button>
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-3 py-1.5 text-xs font-medium text-bbh-ink transition-colors hover:border-bbh-green hover:text-bbh-green-dark"
            >
              <Pencil size={13} /> {t('patientProfile.edit')}
            </button>
          </div>
        </div>
        <div className="divide-y divide-bbh-line">
          <Row label={t('intake.name')} value={p.display_name} />
          <Row label={t('intake.gender')} value={genderLabel} />
          <Row label={t('intake.dob')} value={p.dob} />
          <Row label={t('intake.nationalId')} value={p.national_id} />
          <Row label={t('patientFormModal.nationality')} value={p.nationality} />
          <Row label={t('intake.bloodType')} value={p.blood_type} />
          <Row label={t('intake.phone1')} value={p.phone} />
          <Row label={t('intake.phone2')} value={p.phone2} />
          <Row label={t('intake.phone3')} value={p.phone3} />
          <Row label={t('intake.phone4')} value={p.phone4} />
          <Row label={t('intake.email')} value={p.email} />
          <Row label={t('intake.address')} value={p.address} />
          <Row label={t('intake.intakeBy')} value={p.intake_by} />
          <Row label={t('patientFormModal.notes')} value={p.notes} />
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <Head text={t('patients.tabs.profile')} />

      {/* Identity */}
      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.name')}</span>
          <input value={form.display_name} onChange={set('display_name')} maxLength={120} className={BASE} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.gender')}</span>
            <select value={form.gender} onChange={set('gender')} className={BASE}>
              <option value="">{t('intake.selectPlaceholder')}</option>
              <option value="female">{t('patientFormModal.sexFemale')}</option>
              <option value="male">{t('patientFormModal.sexMale')}</option>
              <option value="other">{t('patientFormModal.sexOther')}</option>
              <option value="unknown">{t('patientFormModal.sexUnknown')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.dob')}</span>
            <input type="date" value={form.dob} onChange={set('dob')} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.nationalId')}</span>
            <input value={form.national_id} onChange={set('national_id')} maxLength={30} className={BASE} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.nationality')}</span>
            <select
              value={natOther ? OTHER : form.nationality}
              onChange={(e) => {
                const v = e.target.value
                if (v === OTHER) { setNatOther(true); setForm((f) => ({ ...f, nationality: '' })) }
                else { setNatOther(false); setForm((f) => ({ ...f, nationality: v })) }
              }}
              className={BASE}
            >
              <option value="">{t('patientFormModal.nationalityUnset')}</option>
              {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={OTHER}>{t('patientFormModal.nationalityOther')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.bloodType')}</span>
            <select value={form.blood_type} onChange={set('blood_type')} className={BASE}>
              <option value="">{t('intake.bloodUnknown')}</option>
              {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        {natOther ? (
          <label className="block sm:w-1/2">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.nationalitySpecify')}</span>
            <input value={form.nationality} onChange={set('nationality')} maxLength={60} className={BASE} />
          </label>
        ) : null}
      </div>

      {/* Contact */}
      <div className="space-y-2.5 border-t border-bbh-line pt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone1')}</span>
            <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone2')}</span>
            <input type="tel" inputMode="tel" value={form.phone2} onChange={set('phone2')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone3')}</span>
            <input type="tel" inputMode="tel" value={form.phone3} onChange={set('phone3')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone4')}</span>
            <input type="tel" inputMode="tel" value={form.phone4} onChange={set('phone4')} maxLength={20} className={BASE} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.email')}</span>
          <input type="email" value={form.email} onChange={set('email')} maxLength={191} className={BASE} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.address')}</span>
          <textarea value={form.address} onChange={set('address')} rows={2} maxLength={2000} className={`resize-none ${BASE}`} />
        </label>
      </div>

      {/* Other */}
      <div className="space-y-2.5 border-t border-bbh-line pt-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.intakeBy')}</span>
          <input value={form.intake_by} onChange={set('intake_by')} maxLength={120} className={BASE} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.notes')}</span>
          <textarea value={form.notes} onChange={set('notes')} rows={3} maxLength={2000} className={`resize-none ${BASE}`} />
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={update.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-3 py-2 text-sm font-medium text-bbh-muted hover:text-bbh-ink disabled:opacity-60"
        >
          <X size={15} /> {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={update.isPending || !form.display_name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60"
        >
          <Save size={15} /> {t('common.save')}
        </button>
      </div>
    </section>
  )
}
