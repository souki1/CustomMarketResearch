type LineChartProps = {
  data: number[]
  color?: string
  height?: number
  width?: number
}

export function LineChart({
  data,
  color = 'var(--app-accent)',
  height = 60,
  width = 220,
}: LineChartProps) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - (((v - min) / range) * (height - 8) + 4)}`
    )
    .join(' ')
  const area = `M${pts.split(' ').join('L')} L${width},${height} L0,${height} Z`
  const gradId = `line-${color.replace('#', '')}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={(i / (data.length - 1)) * width}
          cy={height - (((v - min) / range) * (height - 8) + 4)}
          r={i === data.length - 1 ? 3 : 0}
          fill={color}
        />
      ))}
    </svg>
  )
}

type BarChartProps = {
  data: number[]
  color?: string
  height?: number
  width?: number
}

export function BarChart({
  data,
  color = 'var(--app-ok)',
  height = 72,
  width = 280,
}: BarChartProps) {
  if (data.length === 0) return null
  const max = Math.max(...data, 1)
  const slot = width / data.length
  const gap = Math.min(8, slot * 0.28)
  const barW = Math.max(8, slot - gap)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="overflow-visible">
      {data.map((v, i) => {
        const h = Math.max(v > 0 ? 4 : 0, (v / max) * (height - 16))
        const x = i * slot + (slot - barW) / 2
        const y = height - 14 - h
        return (
          <g key={i}>
            <rect
              x={x}
              y={height - 14}
              width={barW}
              height={2}
              rx={1}
              fill="var(--app-fill-strong)"
            />
            <rect x={x} y={y} width={barW} height={h} rx={3} fill={color} opacity={v > 0 ? 1 : 0.35} />
            {v > 0 && (
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fill="var(--app-label)"
                fontSize="10"
                fontWeight="600"
              >
                {v}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

type DonutSegment = { value: number; color: string }

type DonutChartProps = {
  segments: DonutSegment[]
  size?: number
  centerLabel?: string
}

export function DonutChart({ segments, size = 80, centerLabel }: DonutChartProps) {
  const total = segments.reduce((s, d) => s + d.value, 0)
  const label = centerLabel ?? String(total)
  const r = Math.max(22, size * 0.33)
  const stroke = Math.max(8, size * 0.11)
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r

  if (total <= 0) {
    return (
      <svg width={size} height={size} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--app-separator)" strokeWidth={stroke} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--app-label)"
          fontSize="13"
          fontWeight="700"
        >
          0
        </text>
      </svg>
    )
  }

  let offset = 0

  return (
    <svg width={size} height={size} aria-hidden>
      {segments.map((d, i) => {
        const dash = (d.value / total) * circ
        const slice = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += dash
        return slice
      })}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--app-label)"
        fontSize="13"
        fontWeight="700"
      >
        {label}
      </text>
    </svg>
  )
}
