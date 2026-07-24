import type { ElementType, ReactNode } from 'react'

// Eyebrow — the small mono, uppercase, tracked section/instrument label used
// across the dashboard (masthead labels, card headers, stat captions).
//
// WHY this exists: the exact same class string was copy-pasted 70+ times, at an
// off-scale size (text-[10px]/[11px]). That is the "no typography system" tell
// (see frontend/DESIGN_PRINCIPLES.md — F. Typography, E. Repetition). This is the
// single source of truth: the size/tracking/weight live here once, so the whole
// app changes from one place and every label stays identical.
//
// Size is text-xs (12px) — the scale floor — not 10px: uppercase + wide tracking
// at 10px is genuinely hard to read and fails the WCAG small-text comfort bar.
//
// Polymorphic via `as` so it can render a <p> (default) or a heading (<h2>) where
// the label is a real section title, without changing the look.
export function Eyebrow({
  as,
  className = '',
  children,
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  const Tag = as ?? 'p'
  return (
    <Tag
      className={`font-mono text-xs font-medium uppercase tracking-[0.18em] text-bbh-muted ${className}`}
    >
      {children}
    </Tag>
  )
}
