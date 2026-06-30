import { useEffect, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'

import { Modal } from '../Modal'
import { useSendPatientMessage } from '../../hooks/useSendPatientMessage'

interface Props {
  open: boolean
  patientId: number | null
  patientName?: string | null
  onClose: () => void
}

const PRESETS = [
  'สวัสดีค่ะ ขอแจ้งข่าวจากโรงพยาบาล Better Being',
  'ขอเลื่อนนัดของท่าน กรุณาติดต่อกลับ',
  'ผลตรวจของท่านพร้อมแล้ว เข้ามาดูได้ที่โรงพยาบาล',
  'อย่าลืมนัดของท่านในวันพรุ่งนี้นะคะ',
]

export function SendMessageModal({ open, patientId, patientName, onClose }: Props) {
  const m = useSendPatientMessage()
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setSent(false)
      m.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!patientId) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    m.mutate({ patientId, message: text }, { onSuccess: () => setSent(true) })
  }

  return (
    <Modal open={open} title={`ส่งข้อความ LINE${patientName ? ` — ${patientName}` : ''}`} onClose={onClose} size="md">
      {sent ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-bbh-green/30 bg-bbh-green-soft/40 p-3 text-sm text-bbh-green-dark">
            ส่งสำเร็จ คนไข้จะได้รับใน LINE
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ปิด</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setText((t) => (t ? t + '\n' : '') + p)}
                className="rounded-full border border-bbh-line bg-white px-2.5 py-1 text-[11px] text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
              >
                + {p.slice(0, 25)}...
              </button>
            ))}
          </div>
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="ข้อความที่จะส่ง... (ภาษาไทยได้)"
            className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-bbh-muted">
            {text.length}/2000 — ระบบจะส่งผ่าน LINE Main bot ของโรงพยาบาล (audit + log อัตโนมัติ)
          </p>
          {m.error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              ส่งไม่สำเร็จ — คนไข้อาจไม่มี LINE หรือ block ระบบ
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
            <button type="submit" disabled={m.isPending || !text.trim()} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
              {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              ส่ง
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
