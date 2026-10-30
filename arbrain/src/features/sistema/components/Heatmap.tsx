'use client'

interface DayStat { fecha: string; done: number; total: number }

function cellColor(ratio: number): string {
  if (ratio <= 0) return 'rgba(255,255,255,0.05)'
  if (ratio < 0.34) return 'rgba(255,145,1,0.22)'
  if (ratio < 0.67) return 'rgba(255,145,1,0.45)'
  if (ratio < 1) return 'rgba(255,145,1,0.72)'
  return '#ff9101'
}

export function Heatmap({ history }: { history: DayStat[] }) {
  return (
    <div className="overflow-x-auto">
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, 12px)',
          gridAutoFlow: 'column',
          gridAutoColumns: '12px',
          gap: 3,
        }}
      >
        {history.map((d) => {
          const ratio = d.total > 0 ? d.done / d.total : 0
          return (
            <div
              key={d.fecha}
              title={`${d.fecha} · ${d.done}/${d.total}`}
              style={{ width: 12, height: 12, borderRadius: 3, background: cellColor(ratio) }}
            />
          )
        })}
      </div>
    </div>
  )
}
