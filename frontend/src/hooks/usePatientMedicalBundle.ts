// Patient medical-records bundle (conditions / allergies / medications / treatments).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type MedicalBundle = components['schemas']['MedicalBundle']
export type ConditionOut = components['schemas']['ConditionOut']
export type AllergyOut = components['schemas']['AllergyOut']
export type MedicationOut = components['schemas']['MedicationOut']
export type TreatmentOut = components['schemas']['TreatmentOut']

export type ConditionCreate = components['schemas']['ConditionCreate']
export type AllergyCreate = components['schemas']['AllergyCreate']
export type MedicationCreate = components['schemas']['MedicationCreate']
export type TreatmentCreate = components['schemas']['TreatmentCreate']

export function usePatientMedicalBundle(patientId: number | null) {
  return useQuery({
    queryKey: ['patient-medical-bundle', patientId] as const,
    queryFn: () => api.get<MedicalBundle>(`/api/patients/${patientId}/medical-bundle`),
    enabled: patientId !== null,
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>, patientId: number) {
  qc.invalidateQueries({ queryKey: ['patient-medical-bundle', patientId] })
}

export function useAddCondition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, body }: { patientId: number; body: ConditionCreate }) =>
      api.post<ConditionOut>(`/api/patients/${patientId}/conditions`, body),
    onSuccess: (_d, vars) => invalidate(qc, vars.patientId),
  })
}
export function useDeleteCondition(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/conditions/${id}`),
    onSuccess: () => invalidate(qc, patientId),
  })
}

export function useAddAllergy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, body }: { patientId: number; body: AllergyCreate }) =>
      api.post<AllergyOut>(`/api/patients/${patientId}/allergies`, body),
    onSuccess: (_d, vars) => invalidate(qc, vars.patientId),
  })
}
export function useDeleteAllergy(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/allergies/${id}`),
    onSuccess: () => invalidate(qc, patientId),
  })
}

export function useAddMedication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, body }: { patientId: number; body: MedicationCreate }) =>
      api.post<MedicationOut>(`/api/patients/${patientId}/medications`, body),
    onSuccess: (_d, vars) => invalidate(qc, vars.patientId),
  })
}
export function useToggleMedication(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch<void>(`/api/medications/${id}/active`, { is_active: isActive }),
    onSuccess: () => invalidate(qc, patientId),
  })
}
export function useDeleteMedication(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/medications/${id}`),
    onSuccess: () => invalidate(qc, patientId),
  })
}

export function useAddTreatment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, body }: { patientId: number; body: TreatmentCreate }) =>
      api.post<TreatmentOut>(`/api/patients/${patientId}/treatments`, body),
    onSuccess: (_d, vars) => invalidate(qc, vars.patientId),
  })
}
export function useDeleteTreatment(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/treatments/${id}`),
    onSuccess: () => invalidate(qc, patientId),
  })
}
