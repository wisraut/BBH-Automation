import { useState } from 'react'
import { Check, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react'

import { useTotpDisable, useTotpEnable, useTotpSetup, useTotpStatus } from '../../hooks/useTotp'

export function TotpSection() {
  const status = useTotpStatus()
  const setup = useTotpSetup()
  const enable = useTotpEnable()
  const disable = useTotpDisable()

  const [enrollCode, setEnrollCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')

  const isEnabled = status.data?.enabled ?? false
  const pending = status.data?.pending_setup ?? false
  const generated = setup.data

  return (
    <section className="rounded-2xl border border-bbh-line bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={18} className={isEnabled ? 'text-bbh-green' : 'text-bbh-muted'} />
        <h3 className="font-serif text-lg font-semibold text-bbh-ink">การยืนยันตัวตน 2 ขั้น (2FA)</h3>
        {isEnabled ? (
          <span className="rounded-full border border-bbh-green/30 bg-bbh-green-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-bbh-green-dark">เปิดใช้งาน</span>
        ) : (
          <span className="rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 text-[10px] font-semibold uppercase text-bbh-muted">ยังไม่ตั้ง</span>
        )}
      </div>
      <p className="mb-4 text-sm text-bbh-muted">
        เพิ่มความปลอดภัยด้วยรหัส 6 หลักจากแอป Authenticator (Google Authenticator, Microsoft Authenticator, Authy)
      </p>

      {isEnabled ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-bbh-green/30 bg-bbh-green-soft/40 p-3 text-sm text-bbh-green-dark">
            เปิดใช้งานตั้งแต่ {status.data?.enrolled_at ?? '-'}
          </div>
          <details className="rounded-lg border border-bbh-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-bbh-ink">ปิดการใช้งาน 2FA</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                disable.mutate(
                  { password: disablePassword, code: disableCode },
                  { onSuccess: () => { setDisablePassword(''); setDisableCode('') } },
                )
              }}
              className="mt-3 space-y-2"
            >
              <input type="password" required placeholder="รหัสผ่าน" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
              <input type="text" inputMode="numeric" maxLength={6} required placeholder="รหัส 2FA 6 หลัก" value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))} className="w-full rounded-lg border border-bbh-line px-3 py-2 font-mono text-sm tracking-wider" />
              {disable.error ? <p className="text-xs text-red-600">รหัสผ่านหรือรหัส 2FA ไม่ถูกต้อง</p> : null}
              <button type="submit" disabled={disable.isPending} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:border-red-300 disabled:opacity-60">
                {disable.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                ปิด 2FA
              </button>
            </form>
          </details>
        </div>
      ) : (
        <div className="space-y-3">
          {!pending && !generated ? (
            <button
              type="button"
              onClick={() => setup.mutate()}
              disabled={setup.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60"
            >
              {setup.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              เริ่ม setup 2FA
            </button>
          ) : null}

          {generated ? (
            <div className="space-y-3">
              <p className="text-sm text-bbh-ink font-semibold">1. สแกน QR หรือพิมพ์รหัสเข้าแอป Authenticator</p>
              <div className="flex flex-wrap items-start gap-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generated.otpauth_url)}`}
                  alt="2FA QR code"
                  className="rounded-lg border border-bbh-line bg-white p-2"
                  width={180}
                  height={180}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs text-bbh-muted">หรือพิมพ์ secret นี้ในแอป:</p>
                  <code className="block break-all rounded-lg border border-bbh-line bg-bbh-surface px-3 py-2 font-mono text-sm">{generated.secret}</code>
                  <p className="text-xs text-bbh-muted">issuer: BBH Hospital · 30 วินาที · 6 หลัก</p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  enable.mutate(enrollCode, { onSuccess: () => { setEnrollCode(''); setup.reset() } })
                }}
                className="space-y-2"
              >
                <p className="text-sm font-semibold text-bbh-ink">2. ใส่รหัส 6 หลักจากแอปเพื่อยืนยัน</p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  placeholder="000000"
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ''))}
                  className="w-40 rounded-lg border border-bbh-line px-3 py-2 text-center font-mono text-lg tracking-[0.4em]"
                />
                {enable.error ? <p className="text-xs text-red-600">รหัสไม่ถูกต้อง ลองใหม่</p> : null}
                <button type="submit" disabled={enable.isPending} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
                  {enable.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  ยืนยัน
                </button>
              </form>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
