// Tiny inline-SVG trend chart (Tufte sparkline): a single series drawn without
// axes next to its current value, with the functional-medicine OPTIMAL zone as
// a shaded green band so "in / below / above target" reads at a glance. No
// charting dependency.
type Props = {
  values: number[]
  optimalLow: number
  optimalHigh: number
  width?: number
  height?: number
}

export function Sparkline({ values, optimalLow, optimalHigh, width = 132, height = 40 }: Props) {
  if (values.length === 0) return null

  const pad = 4
  const innerW = width - pad * 2
  const innerH = height - pad * 2

  // Domain covers both the data and the optimal band so the band is always visible.
  let lo = Math.min(...values, optimalLow)
  let hi = Math.max(...values, optimalHigh)
  if (hi === lo) { hi += 1; lo -= 1 }
  const span = hi - lo
  const margin = span * 0.08
  lo -= margin
  hi += margin

  const x = (i: number) =>
    pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW)
  const y = (v: number) => pad + innerH - ((v - lo) / (hi - lo)) * innerH

  const bandTop = y(Math.min(optimalHigh, hi))
  const bandBottom = y(Math.max(optimalLow, lo))
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  const last = values[values.length - 1]
  const lastInOptimal = last >= optimalLow && last <= optimalHigh
  const dotColor = lastInOptimal ? '#1f9d55' : last > optimalHigh ? '#dc2626' : '#d97706'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden>
      <rect
        x={pad}
        y={Math.min(bandTop, bandBottom)}
        width={innerW}
        height={Math.abs(bandBottom - bandTop)}
        fill="#1f9d55"
        fillOpacity={0.12}
        rx={2}
      />
      {values.length > 1 ? (
        <polyline
          points={points}
          fill="none"
          stroke="#475569"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.8} fill={dotColor} />
    </svg>
  )
}
