import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Edit3,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react'

import { Modal } from '../components/Modal'
import { useAdminAlertRules, type RuleOut } from '../hooks/useAdminAlertRules'
import { useToggleAlertRule } from '../hooks/useToggleAlertRule'
import { useUpdateAlertRuleThreshold } from '../hooks/useUpdateAlertRuleThreshold'

const CATEGORY_LABELS: Record<string, string> = {
  operations: 'Operations',
  security: 'Security',
  integration: 'Integration',
  data_quality: 'Data Quality',
}

const SEVERITY_ICONS: Record<string, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: Zap,
  info: Info,
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-bbh-line bg-bbh-surface text-bbh-muted',
}

const ACK_LABELS: Record<string, string> = {
  auto_close: 'ปิดเอง',
  manual: 'ต้องกด ack',
  sticky: 'snooze ได้',
}

function formatThreshold(t: Record<string, unknown>): string {
  const entries = Object.entries(t)
  if (entries.length === 0) return '—'
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
}

export function AlertRules() {
  const q = useAdminAlertRules()
  const toggle = useToggleAlertRule()
  const [editTarget, setEditTarget] = useState<RuleOut | null>(null)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-[20px] border border-bbh-line bg-white/90 p-4 shadow-bbh-card backdrop-blur md:rounded-[28px] md:p-7">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">Alert Rules</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">กฎเตือน (Admin)</h1>
          <p className="mt-1 text-sm text-bbh-muted">
            จัดการ rules ที่ evaluator ใช้สร้าง alert — toggle เปิด/ปิด และปรับ threshold ตามนโยบายโรงพยาบาล
          </p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink hover:border-bbh-green"
        >
          <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
          รีเฟรช
        </button>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลด rules
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ</div>
      ) : !q.data || q.data.length === 0 ? (
        <div className="rounded-2xl border border-bbh-line bg-white p-10 text-center text-sm text-bbh-muted">ไม่มี rule ในระบบ</div>
      ) : (
        <div className="space-y-3">
          {q.data.map((r) => {
            const Icon = SEVERITY_ICONS[r.severity] ?? ShieldAlert
            const togglePending = toggle.isPending && toggle.variables?.ruleKey === r.rule_key
            return (
              <div key={r.rule_key} className={`rounded-2xl border bg-white p-6 shadow-sm transition ${!r.enabled ? 'border-bbh-line opacity-60' : 'border-bbh-line'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon size={18} className={r.severity === 'critical' ? 'text-red-500' : r.severity === 'warning' ? 'text-amber-500' : 'text-bbh-muted'} />
                      <h3 className="truncate font-serif text-base font-semibold text-bbh-ink">{r.display_name}</h3>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-bbh-muted">{r.rule_key}</p>
                    {r.description ? <p className="mt-2 text-sm text-bbh-muted">{r.description}</p> : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${SEVERITY_STYLES[r.severity]}`}>
                        {r.severity}
                      </span>
                      <span className="rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 text-bbh-muted">
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                      <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-bbh-muted">
                        ack: {ACK_LABELS[r.ack_policy] ?? r.ack_policy}
                      </span>
                      <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-bbh-muted">
                        recheck: {r.recheck_seconds}s
                      </span>
                      <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 font-mono text-bbh-muted">
                        threshold: {formatThreshold(r.threshold_json)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditTarget(r)}
                      className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-1.5 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
                    >
                      <Edit3 size={13} /> threshold
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle.mutate({ ruleKey: r.rule_key, enabled: !r.enabled })}
                      disabled={togglePending}
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                        r.enabled
                          ? 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark hover:border-bbh-green'
                          : 'border-bbh-line bg-bbh-surface text-bbh-muted hover:border-bbh-green/40'
                      }`}
                    >
                      {togglePending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {r.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <EditThresholdModal target={editTarget} onClose={() => setEditTarget(null)} />
    </div>
  )
}

function EditThresholdModal({ target, onClose }: { target: RuleOut | null; onClose: () => void }) {
  const m = useUpdateAlertRuleThreshold()
  const [jsonText, setJsonText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    setJsonText(JSON.stringify(target.threshold_json, null, 2))
    setParseError(null)
    m.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  if (!target) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const parsed = JSON.parse(jsonText)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setParseError('threshold ต้องเป็น JSON object เช่น {"minutes": 5}')
        return
      }
      setParseError(null)
      m.mutate({ ruleKey: target.rule_key, threshold: parsed }, { onSuccess: onClose })
    } catch {
      setParseError('JSON ไม่ถูกต้อง')
    }
  }

  return (
    <Modal open={Boolean(target)} title={`Threshold: ${target.display_name}`} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-bbh-muted">
          แก้ JSON ตรงๆ — รูปแบบขึ้นกับ evaluator <span className="font-mono">{target.evaluator}</span>
        </p>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-bbh-line px-3 py-2 font-mono text-sm focus:border-bbh-green focus:outline-none"
          spellCheck={false}
        />
        {parseError ? <p className="text-xs text-red-600">{parseError}</p> : null}
        {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}

        <div className="rounded-lg bg-bbh-surface p-3 text-[11px] text-bbh-muted">
          <p className="font-semibold text-bbh-ink">ตัวอย่าง threshold ตาม evaluator:</p>
          <ul className="mt-1 space-y-0.5 font-mono">
            <li>eval_stuck_reports: <span className="text-bbh-ink">{'{"minutes": 5}'}</span></li>
            <li>eval_stale_cro_approvals: <span className="text-bbh-ink">{'{"hours": 24}'}</span></li>
            <li>eval_failed_line_pushes: <span className="text-bbh-ink">{'{"window_minutes": 60, "min_count": 1}'}</span></li>
            <li>eval_bridge_dify_disconnected: <span className="text-bbh-ink">{'{"consecutive_fails": 2, "timeout_seconds": 5}'}</span></li>
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} บันทึก
          </button>
        </div>
      </form>
    </Modal>
  )
}
