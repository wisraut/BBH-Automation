import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'

import { Eyebrow } from '../ui/Eyebrow'

// Patient intake the CRO fills before confirming a booking. Values are stored on
// the patient record (created/linked) by the approve endpoint. All strings so the
// inputs stay controlled; the parent converts empties to null on submit.
export interface IntakeForm {
  display_name: string
  gender: string
  dob: string
  national_id: string
  blood_type: string
  phone: string
  phone2: string
  phone3: string
  phone4: string
  email: string
  address: string
  intake_by: string
}

export const EMPTY_INTAKE: IntakeForm = {
  display_name: '', gender: '', dob: '', national_id: '', blood_type: '',
  phone: '', phone2: '', phone3: '', phone4: '', email: '', address: '', intake_by: '',
}

// Fields that must be filled before the CRO can confirm (blood type, phone 2-4,
// and email are optional).
export const REQUIRED_INTAKE: (keyof IntakeForm)[] = [
  'display_name', 'gender', 'dob', 'national_id', 'phone', 'address', 'intake_by',
]

// i18n label key per field — lets the parent list exactly what's still missing.
export const INTAKE_LABEL_KEY: Record<keyof IntakeForm, string> = {
  display_name: 'intake.name', gender: 'intake.gender', dob: 'intake.dob',
  national_id: 'intake.nationalId', blood_type: 'intake.bloodType',
  phone: 'intake.phone1', phone2: 'intake.phone2', phone3: 'intake.phone3',
  phone4: 'intake.phone4', email: 'intake.email', address: 'intake.address',
  intake_by: 'intake.intakeBy',
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export function isIntakeComplete(v: IntakeForm): boolean {
  return REQUIRED_INTAKE.every((k) => v[k].trim() !== '')
}

export function missingIntakeKeys(v: IntakeForm): (keyof IntakeForm)[] {
  return REQUIRED_INTAKE.filter((k) => v[k].trim() === '')
}

const BASE =
  'w-full rounded-lg border px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus:ring-2'
const OK = 'border-bbh-line focus:border-bbh-green focus:ring-bbh-green/30'
const ERR = 'border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-red-300'

interface Props {
  value: IntakeForm
  onChange: (next: IntakeForm) => void
  // When true (after a failed confirm), empty required fields turn red.
  showErrors?: boolean
}

// Grouped intake block embedded in ApproveModal. Sections chunk the fields to cut
// cognitive load; field widths track expected content; optional contact details
// stay hidden until needed (progressive disclosure). Required fields carry a red
// asterisk and highlight red once the CRO tries to confirm without them.
export function PatientIntakeFields({ value, onChange, showErrors = false }: Props) {
  const { t } = useTranslation()
  const hasExtra = !!(value.phone2 || value.phone3 || value.phone4 || value.email)
  const [showMore, setShowMore] = useState(hasExtra)

  const set = (k: keyof IntakeForm) => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value })
  const isErr = (k: keyof IntakeForm) =>
    showErrors && REQUIRED_INTAKE.includes(k) && value[k].trim() === ''
  const cls = (k: keyof IntakeForm) => `${BASE} ${isErr(k) ? ERR : OK}`

  const Label = ({ k, text }: { k: keyof IntakeForm; text: string }) => (
    <span className="mb-1 block text-xs font-medium text-bbh-ink">
      {text}
      {REQUIRED_INTAKE.includes(k) ? <span className="text-red-500"> *</span> : null}
    </span>
  )
  const Head = ({ text }: { text: string }) => (
    <Eyebrow>{text}</Eyebrow>
  )

  return (
    <div className="space-y-4">
      {/* Identity */}
      <section className="space-y-2.5">
        <Head text={t('intake.sectionIdentity')} />
        <label className="block">
          <Label k="display_name" text={t('intake.name')} />
          <input autoFocus value={value.display_name} onChange={set('display_name')} maxLength={120} className={cls('display_name')} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <Label k="gender" text={t('intake.gender')} />
            <select value={value.gender} onChange={set('gender')} className={cls('gender')}>
              <option value="">{t('intake.selectPlaceholder')}</option>
              <option value="female">{t('patientFormModal.sexFemale')}</option>
              <option value="male">{t('patientFormModal.sexMale')}</option>
              <option value="other">{t('patientFormModal.sexOther')}</option>
              <option value="unknown">{t('patientFormModal.sexUnknown')}</option>
            </select>
          </label>
          <label className="block">
            <Label k="dob" text={t('intake.dob')} />
            <input type="date" value={value.dob} onChange={set('dob')} className={cls('dob')} />
          </label>
          <label className="block">
            <Label k="national_id" text={t('intake.nationalId')} />
            <input value={value.national_id} onChange={set('national_id')} maxLength={30} className={cls('national_id')} />
          </label>
        </div>
      </section>

      {/* Contact & medical */}
      <section className="space-y-2.5">
        <Head text={t('intake.sectionContact')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label k="phone" text={t('intake.phone1')} />
            <input type="tel" inputMode="tel" value={value.phone} onChange={set('phone')} maxLength={20} className={cls('phone')} />
          </label>
          <label className="block">
            <Label k="blood_type" text={t('intake.bloodType')} />
            <select value={value.blood_type} onChange={set('blood_type')} className={cls('blood_type')}>
              <option value="">{t('intake.bloodUnknown')}</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <Label k="address" text={t('intake.address')} />
          <textarea value={value.address} onChange={set('address')} rows={2} maxLength={2000} className={`resize-none ${cls('address')}`} />
        </label>

        {showMore ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <Label k="phone2" text={t('intake.phone2')} />
              <input type="tel" inputMode="tel" value={value.phone2} onChange={set('phone2')} maxLength={20} className={cls('phone2')} />
            </label>
            <label className="block">
              <Label k="phone3" text={t('intake.phone3')} />
              <input type="tel" inputMode="tel" value={value.phone3} onChange={set('phone3')} maxLength={20} className={cls('phone3')} />
            </label>
            <label className="block">
              <Label k="phone4" text={t('intake.phone4')} />
              <input type="tel" inputMode="tel" value={value.phone4} onChange={set('phone4')} maxLength={20} className={cls('phone4')} />
            </label>
            <label className="block sm:col-span-3">
              <Label k="email" text={t('intake.email')} />
              <input type="email" value={value.email} onChange={set('email')} maxLength={191} className={cls('email')} />
            </label>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-bbh-green-dark hover:underline"
          >
            <Plus size={13} /> {t('intake.addMore')}
          </button>
        )}
      </section>

      {/* Who filled it */}
      <section className="space-y-2.5">
        <Head text={t('intake.sectionIntakeBy')} />
        <label className="block">
          <Label k="intake_by" text={t('intake.intakeBy')} />
          <input
            value={value.intake_by}
            onChange={set('intake_by')}
            maxLength={120}
            placeholder={t('intake.intakeByPlaceholder')}
            className={cls('intake_by')}
          />
        </label>
      </section>
    </div>
  )
}
