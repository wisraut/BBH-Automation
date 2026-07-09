import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

// Set (or clear) an appointment's online-meeting link. The backend writes it to
// the booking's Google Calendar event; the doctor schedule reads it back.
export function useSetVideoLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, videoLink }: { uid: string; videoLink: string | null }) =>
      api.patch<{ ok: boolean }>(`/api/bookings/${uid}/video-link`, { video_link: videoLink }),
    onSuccess: (_data, { uid }) => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
      qc.invalidateQueries({ queryKey: ['my-schedule'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
      qc.invalidateQueries({ queryKey: ['booking', uid] })
    },
  })
}
