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
import type { LucideIcon } from 'lucide-react'

import { Modal } from '../components/Modal'
import { useAdminAlertRules, type RuleOut } from '../hooks/useAdminAlertRules'
import { useToggleAlertRule } from '../hooks/useToggleAlertRule'
import { useUpdateAlertRuleThreshold } from '../hooks/useUpdateAlertRuleThreshold'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const CATEGORY_LABELS: Record<string, string> = {
  operations: 'Operations',
  security: 'Security',
  integration: 'Integration',
  data_quality: 'Data Quality',
}

const SEVERITY_ICONS: Record<string, LucideIcon> = {
  critical: AlertTriangle,
  warning: Zap,
  info: Info,
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-bbh-line bg-bbh-surface text-bbh-muted',
}

const SEVERITY_ICON_STYLES: Record<string, string> = {
  critical: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-bbh-muted',
}

// Signature "vital-sign lead": a thin colored rail that carries severity so the
// row text can stay calm ink. Green is reserved for enabled, so info reads as a
// neutral lead rather than a brand accent.
const SEVERITY_RAIL: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-bbh-muted/50',
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

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-bbh-line bg-white px-2.5 py-0.5 text-xs text-bbh-muted">
      {children}
    </span>
  )
}

export function AlertRules() {
  const q = useAdminAlertRules()
  const toggle = useToggleAlertRule()
  const [editTarget, setEditTarget] = useState<RuleOut | null>(null)

  const rules = q.data ?? []
  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label + serif heading, refresh on the right */}
        <div className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
              Alert Rules
            </p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">กฎเตือน (Admin)</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              จัดการ rules ที่ evaluator ใช้สร้าง alert — เปิด/ปิดการทำงาน และปรับ threshold ตามนโยบายโรงพยาบาล
            </p>
          </div>
          <button
            type="button"
            onClick={() => q.refetch()}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>

        <div className="animate-rise" style={{ animationDelay: '70ms' }}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">Rule definitions</h2>
            <span className="font-mono text-xs tabular-nums text-bbh-muted">
              {q.isLoading ? 'กำลังโหลด…' : `${enabledCount}/${rules.length} เปิดใช้งาน`}
            </span>
          </div>

          {q.isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
              <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลด rules
            </div>
          ) : q.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชอีกครั้ง
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-bbh-line bg-white p-10 text-center text-sm text-bbh-muted">
              ไม่มี rule ในระบบ
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
              <div className="flex items-center justify-between border-b border-bbh-line bg-bbh-surface px-6 py-4 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
                <span>Rule</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-bbh-line">
                {rules.map((r, i) => {
                  const Icon = SEVERITY_ICONS[r.severity] ?? ShieldAlert
                  const togglePending = toggle.isPending && toggle.variables?.ruleKey === r.rule_key
                  return (
                    <div
                      key={r.rule_key}
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                      className="animate-rise relative flex flex-wrap items-start justify-between gap-4 px-6 py-5"
                    >
                      {/* severity lead rail */}
                      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_RAIL[r.severity] ?? 'bg-bbh-muted/50'}`} />

                      <div className={`min-w-0 flex-1 ${r.enabled ? '' : 'opacity-60'}`}>
                        <div className="flex items-center gap-2">
                          <Icon size={18} className={SEVERITY_ICON_STYLES[r.severity] ?? 'text-bbh-muted'} />
                          <h3 className="truncate font-serif text-base font-semibold text-bbh-ink">{r.display_name}</h3>
                        </div>
                        <p className="mt-1 font-mono text-[11px] tabular-nums text-bbh-muted">{r.rule_key}</p>
                        {r.description ? <p className="mt-2 text-sm leading-relaxed text-bbh-muted">{r.description}</p> : null}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.info}`}>
                            {r.severity}
                          </span>
                          <MetaChip>{CATEGORY_LABELS[r.category] ?? r.category}</MetaChip>
                          <MetaChip>ack: {ACK_LABELS[r.ack_policy] ?? r.ack_policy}</MetaChip>
                          <MetaChip>
                            recheck: <span className="font-mono tabular-nums">{r.recheck_seconds}s</span>
                          </MetaChip>
                          <MetaChip>
                            threshold: <span className="font-mono tabular-nums">{formatThreshold(r.threshold_json)}</span>
                          </MetaChip>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditTarget(r)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-1.5 text-xs font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                        >
                          <Edit3 size={13} /> threshold
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle.mutate({ ruleKey: r.rule_key, enabled: !r.enabled })}
                          disabled={togglePending}
                          aria-pressed={r.enabled}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 disabled:opacity-60 ${FOCUS_RING} ${
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
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <EditThresholdModal target={editTarget} onClose={() => setEditTarget(null)} />
      </section>
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
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs leading-relaxed text-bbh-muted">
          แก้ JSON ตรงๆ — รูปแบบขึ้นกับ evaluator <span className="font-mono">{target.evaluator}</span>
        </p>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={6}
          className={`w-full rounded-lg border border-bbh-line px-3 py-2 font-mono text-sm tabular-nums transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 ${FOCUS_RING}`}
          spellCheck={false}
        />
        {parseError ? <p className="text-xs text-red-600">{parseError}</p> : null}
        {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}

        <div className="rounded-lg border border-bbh-line bg-bbh-surface p-4">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">ตัวอย่าง threshold ตาม evaluator</p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-bbh-muted">
            <li>eval_stuck_reports: <span className="text-bbh-ink">{'{"minutes": 5}'}</span></li>
            <li>eval_stale_cro_approvals: <span className="text-bbh-ink">{'{"hours": 24}'}</span></li>
            <li>eval_failed_line_pushes: <span className="text-bbh-ink">{'{"window_minutes": 60, "min_count": 1}'}</span></li>
            <li>eval_bridge_dify_disconnected: <span className="text-bbh-ink">{'{"consecutive_fails": 2, "timeout_seconds": 5}'}</span></li>
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border border-bbh-line bg-white px-4 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={m.isPending}
            className={`inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} บันทึก
          </button>
        </div>
      </form>
    </Modal>
  )
}
