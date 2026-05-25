import { useMemo } from 'react'

export default function Sparkline({ data = [], width = 120, height = 32, stroke = 'var(--color-accent)', strokeWidth = 1.5, fill = true }) {
  const path = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' }
    const max = Math.max(...data, 1)
    const min = Math.min(...data, 0)
    const range = max - min || 1
    const step = width / (data.length - 1)
    const points = data.map((v, i) => ({
      x: i * step,
      y: height - ((v - min) / range) * (height - 4) - 2,
    }))
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const area = `${line} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`
    return { line, area }
  }, [data, height, width])

  if (data.length < 2) return null

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="overflow-visible">
      {fill && (
        <defs>
          <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={path.area} fill="url(#spark-fill)" />}
      <path d={path.line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
