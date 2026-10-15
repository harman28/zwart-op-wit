import { useState } from 'react';
import type { PlayerHistory } from '../api/types.js';
import { formatNumber } from '../lib/format.js';
import { valueSeries } from '../lib/playerHistory.js';

const WIDTH = 400;
const HEIGHT = 200;
const PAD_LEFT = 34;
const PAD_RIGHT = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

/** Rounds to a "nice" step (1/2/5 ×10^n) so axis ticks read as round numbers,
 * never 173.33-style fractions. */
function niceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / pow;
  const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return niceFraction * pow;
}

function yTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = niceStep((max - min) / count);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * A player's value after every round this season — the Keizer-system number
 * that drives their score, plotted so a trend (climbing, sliding, flat) reads
 * at a glance instead of requiring a scan down the Results table's Total
 * column. Round number on the x-axis, scoped to the current season (matches
 * the Results tab's own scope exactly).
 */
export default function PlayerValueChart({ history }: { history: PlayerHistory }) {
  const series = valueSeries(history);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (series.length < 2) {
    return <p style={{ color: 'var(--muted)' }}>Not enough published rounds yet this season to plot a trend.</p>;
  }

  const rounds = series.map((p) => p.roundNumber);
  const values = series.map((p) => p.value);
  const minRound = rounds[0]!;
  const maxRound = rounds[rounds.length - 1]!;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Flat series (e.g. a single round, no movement yet) still needs headroom
  // so the line isn't pinned to one edge.
  const span = rawMax - rawMin || Math.max(rawMax, 1) * 0.1;
  const yMin = rawMin - span * 0.12;
  const yMax = rawMax + span * 0.12;

  const xScale = (round: number) =>
    maxRound === minRound
      ? (PAD_LEFT + WIDTH - PAD_RIGHT) / 2
      : PAD_LEFT + ((round - minRound) / (maxRound - minRound)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const yScale = (value: number) => PAD_TOP + (1 - (value - yMin) / (yMax - yMin)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const pathD = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.roundNumber)} ${yScale(p.value)}`).join(' ');
  const ticks = yTicks(yMin, yMax, 4);
  const last = series[series.length - 1]!;

  function nearestIndex(clientX: number, svg: SVGSVGElement): number {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    let bestDist = Infinity;
    series.forEach((p, i) => {
      const d = Math.abs(xScale(p.roundNumber) - svgX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function step(delta: number) {
    setActiveIdx((prev) => {
      const base = prev ?? series.length - 1;
      return Math.min(series.length - 1, Math.max(0, base + delta));
    });
  }

  const active = activeIdx != null ? series[activeIdx] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${history.name}'s value by round this season, from ${formatNumber(history.startingValue)} to ${formatNumber(last.value)}`}
        tabIndex={0}
        style={{ width: '100%', height: 'auto', outline: 'none' }}
        onPointerMove={(e) => setActiveIdx(nearestIndex(e.clientX, e.currentTarget))}
        onPointerLeave={() => setActiveIdx(null)}
        onFocus={() => setActiveIdx((prev) => prev ?? series.length - 1)}
        onBlur={() => setActiveIdx(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            step(-1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            step(1);
          }
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 6} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">
              {formatNumber(t)}
            </text>
          </g>
        ))}

        <text x={xScale(minRound)} y={HEIGHT - 8} textAnchor="start" className="chart-axis-label">
          Start
        </text>
        <text x={xScale(maxRound)} y={HEIGHT - 8} textAnchor="end" className="chart-axis-label">
          Rnd {maxRound}
        </text>

        {active && (
          <line
            x1={xScale(active.roundNumber)}
            x2={xScale(active.roundNumber)}
            y1={PAD_TOP}
            y2={HEIGHT - PAD_BOTTOM}
            stroke="var(--muted)"
            strokeWidth={1}
          />
        )}

        <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {series.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.roundNumber)}
            cy={yScale(p.value)}
            r={activeIdx === i ? 5 : 4}
            fill="var(--accent)"
            stroke="var(--card-raised)"
            strokeWidth={2}
          />
        ))}

        <text
          x={xScale(last.roundNumber)}
          y={yScale(last.value) - 10}
          textAnchor="end"
          className="chart-end-label"
        >
          {formatNumber(last.value)}
        </text>

        {active &&
          (() => {
            const tipX = Math.min(Math.max(xScale(active.roundNumber), PAD_LEFT + 30), WIDTH - PAD_RIGHT - 30);
            const tipY = Math.max(yScale(active.value) - 30, PAD_TOP + 2);
            return (
              <g transform={`translate(${tipX}, ${tipY})`}>
                <rect x={-30} y={-10} width={60} height={28} rx={5} fill="var(--card-raised)" stroke="var(--border)" />
                <text x={0} y={2} textAnchor="middle" className="chart-tooltip-value">
                  {formatNumber(active.value)}
                </text>
                <text x={0} y={14} textAnchor="middle" className="chart-tooltip-label">
                  {active.roundNumber === 0 ? 'Start' : `Round ${active.roundNumber}`}
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}
