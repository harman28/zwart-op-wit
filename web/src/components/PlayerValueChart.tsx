import { useState } from 'react';
import type { PlayerHistory } from '../api/types.js';
import { formatNumber } from '../lib/format.js';
import { describeEntry, OUTCOME_CLASS, outcomeFor, valueSeries, type ValuePoint } from '../lib/playerHistory.js';

const WIDTH = 640;
const HEIGHT = 320;
const PAD_LEFT = 46;
const PAD_RIGHT = 14;
const PAD_TOP = 20;
const PAD_BOTTOM = 34;

/** Rounds to a "nice" step (1/2/5 ×10^n) so axis ticks read as round numbers,
 * never 173.33-style fractions. */
function niceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / pow;
  const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return niceFraction * pow;
}

function markerColor(point: ValuePoint): string {
  if (!point.entry) return 'var(--muted)'; // the starting point — not a result
  const outcome = outcomeFor(point.entry);
  if (outcome === 'W') return 'var(--win)';
  if (outcome === 'L') return 'var(--loss)';
  if (outcome === 'D') return 'var(--draw)';
  return 'var(--muted)'; // a bye — no W/D/L to show
}

/**
 * A player's value after every round this season — the Keizer-system number
 * that drives their score, plotted so a trend (climbing, sliding, flat) reads
 * at a glance instead of requiring a scan down the Results table's Total
 * column. Round number on the x-axis, scoped to the current season (matches
 * the Results tab's own scope exactly). Markers are colored by that round's
 * outcome (win/draw/loss, same colors as the Results table's pills) so the
 * shape of the season reads without hovering a single point; hovering (or
 * focusing + arrow keys) adds the opponent, result and points gained/lost
 * behind each point.
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

  // The axis domain is built from the data's own range, rounded OUT to clean
  // step boundaries — never from a padded range — so the topmost (and
  // bottommost) gridline is always at or beyond the actual data, never short
  // of it. A chart whose highest point sits above its own top gridline reads
  // as broken (see the bug this replaced).
  const rawSpan = rawMax - rawMin || Math.max(rawMax, 1) * 0.2;
  const step = niceStep(rawSpan / 5);
  let domainMin = Math.floor(rawMin / step) * step;
  let domainMax = Math.ceil(rawMax / step) * step;
  if (domainMin === domainMax) {
    domainMin -= step;
    domainMax += step;
  }
  const breathing = (domainMax - domainMin) * 0.06;
  const plotMin = domainMin - breathing;
  const plotMax = domainMax + breathing;

  const xScale = (round: number) =>
    maxRound === minRound
      ? (PAD_LEFT + WIDTH - PAD_RIGHT) / 2
      : PAD_LEFT + ((round - minRound) / (maxRound - minRound)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const yScale = (value: number) =>
    PAD_TOP + (1 - (value - plotMin) / (plotMax - plotMin)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const pathD = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.roundNumber)} ${yScale(p.value)}`).join(' ');

  const ticks: number[] = [];
  for (let v = domainMin; v <= domainMax + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);

  // Every round gets a tick mark; text labels thin out once there'd be too
  // many to read (always keeping Start and the last round).
  const labelEvery = Math.max(1, Math.ceil((rounds.length - 1) / 9));

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

  function moveActive(delta: number) {
    setActiveIdx((prev) => {
      const base = prev ?? series.length - 1;
      return Math.min(series.length - 1, Math.max(0, base + delta));
    });
  }

  const active = activeIdx != null ? series[activeIdx] : null;
  const activeOutcome = active?.entry ? outcomeFor(active.entry) : null;
  // Points gained/lost this round — the delta between this point and the one before it.
  const activeDelta = active && activeIdx != null && activeIdx > 0 ? active.value - series[activeIdx - 1]!.value : null;

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Value after each published round this season.</p>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${history.name}'s value by round this season, from ${formatNumber(history.startingValue)} to ${formatNumber(last.value)}`}
          tabIndex={0}
          style={{ width: '100%', height: 'auto', aspectRatio: `${WIDTH} / ${HEIGHT}`, display: 'block', outline: 'none' }}
          onPointerMove={(e) => setActiveIdx(nearestIndex(e.clientX, e.currentTarget))}
          onPointerLeave={() => setActiveIdx(null)}
          onFocus={() => setActiveIdx((prev) => prev ?? series.length - 1)}
          onBlur={() => setActiveIdx(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              moveActive(-1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              moveActive(1);
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
              <text x={PAD_LEFT - 8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">
                {formatNumber(t)}
              </text>
            </g>
          ))}

          {series.map((p, i) =>
            i % labelEvery === 0 || i === series.length - 1 ? (
              <text
                key={p.roundNumber}
                x={xScale(p.roundNumber)}
                y={HEIGHT - 10}
                textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
                className="chart-axis-label"
              >
                {i === 0 ? 'Start' : p.roundNumber}
              </text>
            ) : null,
          )}

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
              r={activeIdx === i ? 6 : 5}
              fill={markerColor(p)}
              stroke="var(--card-raised)"
              strokeWidth={2}
            />
          ))}

          {activeIdx !== series.length - 1 && (
            <text x={xScale(last.roundNumber)} y={yScale(last.value) - 12} textAnchor="end" className="chart-end-label">
              {formatNumber(last.value)}
            </text>
          )}
        </svg>

        {active &&
          (() => {
            const leftPct = (xScale(active.roundNumber) / WIDTH) * 100;
            const topPct = (yScale(active.value) / HEIGHT) * 100;
            // Flip to the other side of the point once it's past the
            // horizontal midpoint, so the tooltip never runs off the chart edge.
            const flip = leftPct > 60;
            return (
              <div
                className="chart-tooltip"
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform: `translate(${flip ? '-100%' : '0%'}, -50%) translateX(${flip ? '-14px' : '14px'})`,
                }}
              >
                <div className="chart-tooltip-round">{active.roundNumber === 0 ? 'Starting value' : `Round ${active.roundNumber}`}</div>
                {active.entry && (
                  <div className="chart-tooltip-opponent">{describeEntry(active.entry)}</div>
                )}
                <div className="chart-tooltip-row">
                  {activeOutcome && <span className={`outcome-pill ${OUTCOME_CLASS[activeOutcome]}`}>{activeOutcome}</span>}
                  {activeDelta != null && (
                    <span className="chart-tooltip-delta">
                      {activeDelta > 0 ? '+' : ''}
                      {formatNumber(activeDelta)}
                    </span>
                  )}
                </div>
                <div className="chart-tooltip-value">{formatNumber(active.value)}</div>
              </div>
            );
          })()}
      </div>
    </div>
  );
}
