type LineChartProps = {
  data: number[]
  color?: string
  height?: number
  width?: number
}

export function LineChart({
  data,
  color = '#2563eb',
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

type DonutSegment = { value: number; color: string }

type DonutChartProps = {
  segments: DonutSegment[]
  size?: number
}

export function DonutChart({ segments, size = 80 }: DonutChartProps) {
  const total = segments.reduce((s, d) => s + d.value, 0)
  if (total <= 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={30} fill="none" stroke="#e5e7eb" strokeWidth={10} />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-800 text-[13px] font-bold"
        >
          0
        </text>
      </svg>
    )
  }

  let offset = 0
  const r = 30
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r

  return (
    <svg width={size} height={size}>
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
            strokeWidth={10}
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += dash
        return slice
      })}
      <circle cx={cx} cy={cy} r={22} fill="#fff" />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-slate-800 text-[13px] font-bold"
      >
        {total}
      </text>
    </svg>
  )
}
