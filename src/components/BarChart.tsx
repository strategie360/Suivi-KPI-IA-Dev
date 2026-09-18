"use client";

type Point = { label: string; estimation: number; reel: number };

export default function BarChart({ data }: { data: Point[] }) {
  const width = 640;
  const height = 260;
  const padding = { top: 16, right: 12, bottom: 34, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.estimation, d.reel)));
  const niceMax = Math.ceil(maxVal / 5) * 5 || 5;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));

  const groupW = plotW / Math.max(1, data.length);
  const barW = Math.min(22, groupW / 3);

  function y(v: number) {
    return padding.top + plotH - (v / niceMax) * plotH;
  }

  if (!data.length) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-text-faint">
        Pas de données pour cette sélection.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Estimation vs temps réel par ticket">
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={padding.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-muted)">
            {t}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const cx = padding.left + groupW * i + groupW / 2;
        return (
          <g key={d.label + i}>
            <rect
              x={cx - barW - 2}
              y={y(d.estimation)}
              width={barW}
              height={Math.max(0, y(0) - y(d.estimation))}
              fill="var(--text-faint)"
              opacity={0.55}
              rx={2}
            />
            <rect
              x={cx + 2}
              y={y(d.reel)}
              width={barW}
              height={Math.max(0, y(0) - y(d.reel))}
              fill="var(--accent)"
              rx={2}
            />
            <text
              x={cx}
              y={height - padding.bottom + 16}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
            >
              {d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
