import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Plus } from 'lucide-react'

import { Eyebrow } from '../ui/Eyebrow'

// Patient intake the CRO fills before confirming a booking. Values are stored on
// the patient record (created/linked) by the approve endpoint. All strings so the
// inputs stay controlled; the parent converts empties to null (and the smoking/
// drinking tri-state to bool) on submit.
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
  // Optional health-record extras (collapsed by default in the UI).
  english_name: string
  religion: string
  marital_status: string
  occupation: string
  father_name: string
  father_phone: string
  mother_name: string
  mother_phone: string
  emergency_contact_name: string
  emergency_contact_relation: string
  emergency_contact_phone: string
  emergency_contact_address: string
  past_illness: string
  congenital_disease: string
  drugs_supplements: string
  drug_allergy: string
  food_allergy: string
  smoking: string
  smoking_years: string
  drinking: string
  drinking_years: string
}

export const EMPTY_INTAKE: IntakeForm = {
  display_name: '', gender: '', dob: '', national_id: '', blood_type: '',
  phone: '', phone2: '', phone3: '', phone4: '', email: '', address: '', intake_by: '',
  english_name: '', religion: '', marital_status: '', occupation: '',
  father_name: '', father_phone: '', mother_name: '', mother_phone: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: '', emergency_contact_address: '',
  past_illness: '', congenital_disease: '', drugs_supplements: '', drug_allergy: '', food_allergy: '',
  smoking: '', smoking_years: '', drinking: '', drinking_years: '',
}

// The optional (health/family) keys — used to auto-open the collapsed section when
// a linked chart already carries any of them.
const HEALTH_KEYS: (keyof IntakeForm)[] = [
  'english_name', 'religion', 'marital_status', 'occupation',
  'father_name', 'father_phone', 'mother_name', 'mother_phone',
  'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone', 'emergency_contact_address',
  'past_illness', 'congenital_disease', 'drugs_supplements', 'drug_allergy', 'food_allergy',
  'smoking', 'smoking_years', 'drinking', 'drinking_years',
]

// Fields that must be filled before the CRO can confirm (blood type, phone 2-4,
// email, and everything in the collapsed health section are optional).
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
  english_name: 'patientFormModal.englishName', religion: 'patientFormModal.religion',
  marital_status: 'patientFormModal.maritalStatus', occupation: 'patientFormModal.occupation',
  father_name: 'patientFormModal.fatherName', father_phone: 'patientFormModal.fatherPhone',
  mother_name: 'patientFormModal.motherName', mother_phone: 'patientFormModal.motherPhone',
  emergency_contact_name: 'patientFormModal.emergencyName',
  emergency_contact_relation: 'patientFormModal.emergencyRelation',
  emergency_contact_phone: 'patientFormModal.emergencyPhone',
  emergency_contact_address: 'patientFormModal.emergencyAddress',
  past_illness: 'patientFormModal.pastIllness', congenital_disease: 'patientFormModal.congenitalDisease',
  drugs_supplements: 'patientFormModal.drugsSupplements', drug_allergy: 'patientFormModal.drugAllergy',
  food_allergy: 'patientFormModal.foodAllergy',
  smoking: 'patientFormModal.smoking', smoking_years: 'patientFormModal.years',
  drinking: 'patientFormModal.drinking', drinking_years: 'patientFormModal.years',
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
// cognitive load; required identity/contact stay up top, while the fuller health/
// family record (usually filled later, not at booking time) sits in a collapsed
// section so it never bloats the confirm flow.
export function PatientIntakeFields({ value, onChange, showErrors = false }: Props) {
  const { t } = useTranslation()
  const hasExtra = !!(value.phone2 || value.phone3 || value.phone4 || value.email)
  const [showMore, setShowMore] = useState(hasExtra)
  const hasHealth = HEALTH_KEYS.some((k) => value[k].trim() !== '')
  const [showHealth, setShowHealth] = useState(hasHealth)

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

      {/* Optional health / family record — kept at the very bottom (per request);
          collapsed by default since it's usually filled later, not at booking time.
          The tinted toggle header keeps it easy to spot even down here. */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setShowHealth((s) => !s)}
          aria-expanded={showHealth}
          className="flex w-full items-center justify-between rounded-lg border border-bbh-line bg-bbh-surface px-3 py-2.5 text-sm font-medium text-bbh-ink transition-colors hover:border-bbh-green hover:text-bbh-green-dark"
        >
          <span>{t('intake.moreHealthTitle')}</span>
          <ChevronDown size={16} className={`shrink-0 transition-transform ${showHealth ? 'rotate-180' : ''}`} />
        </button>

        {showHealth ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <Label k="english_name" text={t('patientFormModal.englishName')} />
                <input value={value.english_name} onChange={set('english_name')} maxLength={120} className={cls('english_name')} />
              </label>
              <label className="block">
                <Label k="occupation" text={t('patientFormModal.occupation')} />
                <input value={value.occupation} onChange={set('occupation')} maxLength={120} className={cls('occupation')} />
              </label>
              <label className="block">
                <Label k="religion" text={t('patientFormModal.religion')} />
                <input value={value.religion} onChange={set('religion')} maxLength={60} className={cls('religion')} />
              </label>
              <label className="block">
                <Label k="marital_status" text={t('patientFormModal.maritalStatus')} />
                <input value={value.marital_status} onChange={set('marital_status')} maxLength={30} className={cls('marital_status')} />
              </label>
            </div>

            <div>
              <Head text={t('patientFormModal.secFamily')} />
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <Label k="father_name" text={t('patientFormModal.fatherName')} />
                  <input value={value.father_name} onChange={set('father_name')} maxLength={120} className={cls('father_name')} />
                </label>
                <label className="block">
                  <Label k="father_phone" text={t('patientFormModal.fatherPhone')} />
                  <input type="tel" inputMode="tel" value={value.father_phone} onChange={set('father_phone')} maxLength={20} className={cls('father_phone')} />
                </label>
                <label className="block">
                  <Label k="mother_name" text={t('patientFormModal.motherName')} />
                  <input value={value.mother_name} onChange={set('mother_name')} maxLength={120} className={cls('mother_name')} />
                </label>
                <label className="block">
                  <Label k="mother_phone" text={t('patientFormModal.motherPhone')} />
                  <input type="tel" inputMode="tel" value={value.mother_phone} onChange={set('mother_phone')} maxLength={20} className={cls('mother_phone')} />
                </label>
                <label className="block">
                  <Label k="emergency_contact_name" text={t('patientFormModal.emergencyName')} />
                  <input value={value.emergency_contact_name} onChange={set('emergency_contact_name')} maxLength={120} className={cls('emergency_contact_name')} />
                </label>
                <label className="block">
                  <Label k="emergency_contact_relation" text={t('patientFormModal.emergencyRelation')} />
                  <input value={value.emergency_contact_relation} onChange={set('emergency_contact_relation')} maxLength={60} className={cls('emergency_contact_relation')} />
                </label>
                <label className="block">
                  <Label k="emergency_contact_phone" text={t('patientFormModal.emergencyPhone')} />
                  <input type="tel" inputMode="tel" value={value.emergency_contact_phone} onChange={set('emergency_contact_phone')} maxLength={20} className={cls('emergency_contact_phone')} />
                </label>
                <label className="block">
                  <Label k="emergency_contact_address" text={t('patientFormModal.emergencyAddress')} />
                  <input value={value.emergency_contact_address} onChange={set('emergency_contact_address')} maxLength={500} className={cls('emergency_contact_address')} />
                </label>
              </div>
            </div>

            <div>
              <Head text={t('patientFormModal.secHealth')} />
              <div className="mt-2 space-y-2.5">
                <label className="block">
                  <Label k="past_illness" text={t('patientFormModal.pastIllness')} />
                  <textarea value={value.past_illness} onChange={set('past_illness')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${cls('past_illness')}`} />
                </label>
                <label className="block">
                  <Label k="congenital_disease" text={t('patientFormModal.congenitalDisease')} />
                  <textarea value={value.congenital_disease} onChange={set('congenital_disease')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${cls('congenital_disease')}`} />
                </label>
                <label className="block">
                  <Label k="drugs_supplements" text={t('patientFormModal.drugsSupplements')} />
                  <textarea value={value.drugs_supplements} onChange={set('drugs_supplements')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${cls('drugs_supplements')}`} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <Label k="drug_allergy" text={t('patientFormModal.drugAllergy')} />
                    <textarea value={value.drug_allergy} onChange={set('drug_allergy')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${cls('drug_allergy')}`} />
                  </label>
                  <label className="block">
                    <Label k="food_allergy" text={t('patientFormModal.foodAllergy')} />
                    <textarea value={value.food_allergy} onChange={set('food_allergy')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${cls('food_allergy')}`} />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <Head text={t('patientFormModal.secBehavior')} />
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <Label k="smoking" text={t('patientFormModal.smoking')} />
                  <select value={value.smoking} onChange={set('smoking')} className={cls('smoking')}>
                    <option value="">{t('patientFormModal.htUnset')}</option>
                    <option value="no">{t('patientFormModal.htNo')}</option>
                    <option value="yes">{t('patientFormModal.htYes')}</option>
                  </select>
                </label>
                <label className="block">
                  <Label k="smoking_years" text={t('patientFormModal.years')} />
                  <input type="number" min={0} max={120} value={value.smoking_years} disabled={value.smoking !== 'yes'} onChange={set('smoking_years')} className={`${cls('smoking_years')} disabled:cursor-not-allowed disabled:bg-bbh-surface`} />
                </label>
                <label className="block">
                  <Label k="drinking" text={t('patientFormModal.drinking')} />
                  <select value={value.drinking} onChange={set('drinking')} className={cls('drinking')}>
                    <option value="">{t('patientFormModal.htUnset')}</option>
                    <option value="no">{t('patientFormModal.htNo')}</option>
                    <option value="yes">{t('patientFormModal.htYes')}</option>
                  </select>
                </label>
                <label className="block">
                  <Label k="drinking_years" text={t('patientFormModal.years')} />
                  <input type="number" min={0} max={120} value={value.drinking_years} disabled={value.drinking !== 'yes'} onChange={set('drinking_years')} className={`${cls('drinking_years')} disabled:cursor-not-allowed disabled:bg-bbh-surface`} />
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
