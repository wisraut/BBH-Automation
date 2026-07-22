// Patient care team — list members, add a doctor with a role, remove, promote.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { UserPlus, X } from 'lucide-react'

import { useAuth } from '../../lib/auth'
import { useDoctors } from '../../hooks/useDoctors'
import {
  useAddCareTeamMember,
  useCareTeam,
  useRemoveCareTeamMember,
  type CareTeamRole,
} from '../../hooks/useCareTeam'
import { useToast } from '../../hooks/useToast'
import { ApiError } from '../../lib/api'
import { Eyebrow } from '../ui/Eyebrow'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const ROLE_LABEL_KEY: Record<CareTeamRole, string> = {
  primary: 'rolePrimary',
  specialist: 'roleSpecialist',
  consultant: 'roleConsultant',
}

export function CareTeamSection({ patientId }: { patientId: number }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canManage = ['cro', 'doctor', 'admin'].includes(user?.role ?? '')
  const q = useCareTeam(patientId)
  const doctorsQ = useDoctors()
  const add = useAddCareTeamMember(patientId)
  const remove = useRemoveCareTeamMember(patientId)
  const toast = useToast()
  const [doctorId, setDoctorId] = useState<number | ''>('')
  const [role, setRole] = useState<CareTeamRole>('specialist')

  const members = q.data?.data ?? []

  async function submitAdd(role: CareTeamRole, id: number) {
    try {
      await add.mutateAsync({ doctor_id: id, role })
      setDoctorId('')
      setRole('specialist')
    } catch (error) {
      toast.show('error', error instanceof ApiError ? error.message : t('careTeamSection.addFailed'))
    }
  }

  return (
    <section>
      <Eyebrow as="h2" className="mb-3">{t('careTeamSection.title')}</Eyebrow>

      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-bbh-line bg-white p-4 text-sm text-bbh-muted">
          {t('careTeamSection.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((m) => {
            const isPrimary = m.role === 'primary'
            return (
              <li
                key={m.doctor_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-bbh-line bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-bbh-ink">{m.doctor_name}</p>
                  {m.specialty ? (
                    <p className="truncate text-xs text-bbh-muted">{m.specialty}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      isPrimary
                        ? 'border-bbh-green/40 bg-bbh-green/5 text-bbh-green-dark'
                        : 'border-bbh-line bg-bbh-surface text-bbh-muted'
                    }`}
                  >
                    {t(`careTeamSection.${ROLE_LABEL_KEY[m.role]}`)}
                  </span>
                  {canManage && !isPrimary ? (
                    <button
                      type="button"
                      onClick={() => submitAdd('primary', m.doctor_id)}
                      className={`rounded text-xs text-bbh-muted transition-colors duration-200 hover:text-bbh-green-dark ${FOCUS_RING}`}
                      title={t('careTeamSection.setPrimary')}
                    >
                      {t('careTeamSection.setPrimary')}
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(t('careTeamSection.removeConfirm', { name: m.doctor_name ?? t('careTeamSection.doctorFallback') }))) remove.mutate(m.doctor_id)
                      }}
                      className={`rounded text-bbh-muted transition-colors duration-200 hover:text-red-600 ${FOCUS_RING}`}
                      title={t('careTeamSection.removeFromTeam')}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {canManage ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value === '' ? '' : Number(e.target.value))}
            className="min-w-0 flex-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
          >
            <option value="">{t('careTeamSection.selectDoctor')}</option>
            {(doctorsQ.data?.data ?? [])
              .filter((d) => !members.some((m) => m.doctor_id === d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name}{d.specialty ? ` (${d.specialty})` : ''}
                </option>
              ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CareTeamRole)}
            className="rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
          >
            <option value="specialist">{t('careTeamSection.roleSpecialist')}</option>
            <option value="consultant">{t('careTeamSection.roleConsultant')}</option>
            <option value="primary">{t('careTeamSection.rolePrimary')}</option>
          </select>
          <button
            type="button"
            disabled={doctorId === '' || add.isPending}
            onClick={() => { if (doctorId !== '') void submitAdd(role, Number(doctorId)) }}
            className={`inline-flex items-center gap-1 rounded-lg bg-bbh-green px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-50 ${FOCUS_RING}`}
          >
            <UserPlus size={14} /> {t('common.add')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
