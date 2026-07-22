import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'

import { dateLocale } from '../i18n/datetime'
import { usePatient } from '../hooks/usePatient'
import { LanguageToggle } from '../components/LanguageToggle'
import bbhLogo from '../assets/bbh-logo-dashboard.png'

function ageFrom(dob?: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1
  return a >= 0 && a < 150 ? a : null
}
function fmt(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

// One "label / filled value" cell — the value sits on an underline like a real
// paper form, so a blank field still reads as something to write on.
function Field({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="min-h-[1.4rem] border-b border-zinc-300 pb-0.5 text-sm text-black">{value?.trim() ? value : ' '}</p>
    </div>
  )
}

// Standalone, print-optimized patient profile — opened in a new tab from the
// profile tab so the CRO prints a filled record instead of hand-writing one.
// Rendered OUTSIDE the dashboard shell (no sidebar/topbar) for a clean A4 page.
export function PatientProfilePrint() {
  const { id } = useParams()
  const { t } = useTranslation()
  const q = usePatient(Number(id) || null)
  const p = q.data

  if (q.isLoading || !p) {
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-500">{t('common.loading')}</div>
  }

  const age = ageFrom(p.dob)
  const genderLabel = p.gender
    ? t(`patientFormModal.sex${p.gender[0].toUpperCase()}${p.gender.slice(1)}`)
    : '—'
  const dobText = p.dob ? `${fmt(p.dob)}${age != null ? ` (${t('profilePrint.ageYears', { age })})` : ''}` : '—'

  return (
    <div className="min-h-screen bg-zinc-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4; margin: 14mm; } .no-print { display: none !important; } }`}</style>

      {/* Control bar (screen only) — switch the print language, then print. */}
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between">
        <LanguageToggle />
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark"
        >
          <Printer size={16} /> {t('profilePrint.print')}
        </button>
      </div>

      <div className="mx-auto max-w-[210mm] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {/* Facility header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div className="flex flex-col items-start gap-2">
            <img src={bbhLogo} alt="Better Being Hospital" className="h-14 w-14 object-contain" />
            <p className="text-lg font-bold">{t('profilePrint.hospital')}</p>
          </div>
          <div className="text-right text-xs leading-5">
            <p className="text-sm font-semibold">{t('profilePrint.title')}</p>
            <p>HN: <span className="font-mono">{p.hn ?? '—'}</span></p>
            <p>{t('profilePrint.printedOn')}: {new Date().toLocaleDateString(dateLocale())}</p>
          </div>
        </div>

        {/* Identity */}
        <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t('intake.sectionIdentity')}</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <Field label={t('intake.name')} value={p.display_name} wide />
          <Field label={t('intake.gender')} value={genderLabel} />
          <Field label={t('intake.dob')} value={dobText} />
          <Field label={t('intake.nationalId')} value={p.national_id} />
          <Field label={t('patientFormModal.nationality')} value={p.nationality} />
          <Field label={t('intake.bloodType')} value={p.blood_type} />
        </div>

        {/* Contact */}
        <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t('intake.sectionContact')}</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <Field label={t('intake.phone1')} value={p.phone} />
          <Field label={t('intake.phone2')} value={p.phone2} />
          <Field label={t('intake.phone3')} value={p.phone3} />
          <Field label={t('intake.phone4')} value={p.phone4} />
          <Field label={t('intake.email')} value={p.email} wide />
          <Field label={t('intake.address')} value={p.address} wide />
        </div>

        {/* Record meta */}
        <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t('intake.sectionIntakeBy')}</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <Field label={t('intake.intakeBy')} value={p.intake_by} />
          <Field label={t('patientFormModal.notes')} value={p.notes} wide />
        </div>

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <div className="text-center">
            <div className="mb-1 border-t border-black pt-1">{t('profilePrint.patientSign')}</div>
            <p className="text-xs text-zinc-500">{t('profilePrint.dateLine')}</p>
          </div>
          <div className="text-center">
            <div className="mb-1 border-t border-black pt-1">{t('profilePrint.staffSign')}</div>
            <p className="text-xs text-zinc-500">{t('profilePrint.dateLine')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
