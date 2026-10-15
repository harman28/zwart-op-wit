import { useState } from 'react';
import type { PlayerHistory } from '../api/types.js';
import { usePlayerHistories } from '../hooks/usePlayerHistories.js';
import { useSeasonRoster } from '../hooks/useSeasonRoster.js';
import { formatNumber } from '../lib/format.js';
import { describeEntry, OUTCOME_CLASS, outcomeFor, valueSeries, type ValuePoint } from '../lib/playerHistory.js';
import PlayerAutocomplete from './PlayerAutocomplete.js';

const WIDTH = 640;
const HEIGHT = 320;
const PAD_LEFT = 46;
const PAD_RIGHT = 14;
const PAD_TOP = 20;
const PAD_BOTTOM = 34;

/** Capped at 2 additions (3 lines total, primary included) — the validated
 * comparison palette (--accent + --chart-series-2/3) can't add a 4th hue
 * that clears the CVD floors against the other three in both themes; past
 * that the right move is faceting, not another color. See tokens.css. */
const MAX_COMPARE = 2;
const COMPARE_COLOR_VARS = ['var(--chart-series-2)', 'var(--chart-series-3)'];

/** Rounds to a "nice" step (1/2/5 ×10^n) so axis ticks read as round numbers,
 * never 173.33-style fractions. */
function niceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / pow;
  const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return niceFraction * pow;
}

interface Series {
  playerId: number;
  name: string;
  color: string;
  points: ValuePoint[];
}

export default function PlayerValueChart({
  history,
  seasonId,
  afterRound,
}: {
  history: PlayerHistory;
  seasonId: number;
  afterRound?: number;
}) {
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [activeRound, setActiveRound] = useState<number | null>(null);

  const roster = useSeasonRoster(seasonId);
  const compareHistories = usePlayerHistories(seasonId, compareIds, afterRound);

  const primarySeries: Series = { playerId: history.playerId, name: history.name, color: 'var(--accent)', points: valueSeries(history) };
  const compareSeries: Series[] = compareIds
    .map((id, i) => {
      const h = compareHistories.get(id);
      return h ? { playerId: id, name: h.name, color: COMPARE_COLOR_VARS[i]!, points: valueSeries(h) } : null;
    })
    .filter((s): s is Series => s != null);
  const series = [primarySeries, ...compareSeries];
  const comparing = compareSeries.length > 0;

  if (primarySeries.points.length < 2) {
    return <p style={{ color: 'var(--muted)' }}>Not enough published rounds yet this season to plot a trend.</p>;
  }

  const allRounds = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.roundNumber)))).sort((a, b) => a - b);
  const minRound = allRounds[0]!;
  const maxRound = allRounds[allRounds.length - 1]!;
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);

  // The axis domain is built from the data's own range, rounded OUT to clean
  // step boundaries, instead of computing ticks within an already-padded
  // range — the top (and bottom) gridline is always at or beyond the actual
  // data, never short of it.
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

  const ticks: number[] = [];
  for (let v = domainMin; v <= domainMax + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);

  const labelEvery = Math.max(1, Math.ceil((allRounds.length - 1) / 9));

  function markerColor(s: Series, point: ValuePoint): string {
    if (comparing) return s.color; // identity, once there's more than one entity to tell apart
    if (!point.entry) return 'var(--muted)'; // the starting point — not a result
    const outcome = outcomeFor(point.entry);
    if (outcome === 'W') return 'var(--win)';
    if (outcome === 'L') return 'var(--loss)';
    if (outcome === 'D') return 'var(--draw)';
    return 'var(--muted)'; // a bye — no W/D/L to show
  }

  function nearestRound(clientX: number, svg: SVGSVGElement): number {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * WIDTH;
    let best = allRounds[0]!;
    let bestDist = Infinity;
    for (const r of allRounds) {
      const d = Math.abs(xScale(r) - svgX);
      if (d < bestDist) {
        bestDist = d;
        best = r;
      }
    }
    return best;
  }

  function moveActive(delta: number) {
    setActiveRound((prev) => {
      const idx = prev == null ? allRounds.length - 1 : allRounds.indexOf(prev);
      const next = Math.min(allRounds.length - 1, Math.max(0, idx + delta));
      return allRounds[next]!;
    });
  }

  const last = primarySeries.points[primarySeries.points.length - 1]!;
  const activeRows = activeRound == null ? [] : series.map((s) => ({ s, point: s.points.find((p) => p.roundNumber === activeRound) })).filter((r) => r.point);

  const compareCandidates = roster.filter((p) => p.id !== history.playerId && !compareIds.includes(p.id));

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Value after each published round this season.</p>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Value by round this season for ${series.map((s) => s.name).join(', ')}`}
          tabIndex={0}
          style={{ width: '100%', height: 'auto', aspectRatio: `${WIDTH} / ${HEIGHT}`, display: 'block', outline: 'none' }}
          onPointerMove={(e) => {
            // Live-follow on genuine mouse hover only — a touch tap rarely
            // fires pointermove at all (no finger movement), so it's handled
            // separately below, as a pin rather than a hover.
            if (e.pointerType === 'mouse') setActiveRound(nearestRound(e.clientX, e.currentTarget));
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') setActiveRound(nearestRound(e.clientX, e.currentTarget));
          }}
          onPointerLeave={(e) => {
            // Touch always "leaves" the instant the finger lifts — clearing
            // here would hide the tooltip right after the tap that opened
            // it. Only a real mouse leaving the chart should dismiss it;
            // a tap stays pinned until another point is tapped or the
            // chart loses focus (onBlur, below).
            if (e.pointerType === 'mouse') setActiveRound(null);
          }}
          onFocus={() => setActiveRound((prev) => prev ?? allRounds[allRounds.length - 1]!)}
          onBlur={() => setActiveRound(null)}
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
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yScale(t)} y2={yScale(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">
                {formatNumber(t)}
              </text>
            </g>
          ))}

          {allRounds.map((r, i) =>
            i % labelEvery === 0 || i === allRounds.length - 1 ? (
              <text
                key={r}
                x={xScale(r)}
                y={HEIGHT - 10}
                textAnchor={i === 0 ? 'start' : i === allRounds.length - 1 ? 'end' : 'middle'}
                className="chart-axis-label"
              >
                {i === 0 ? 'Start' : r}
              </text>
            ) : null,
          )}

          {activeRound != null && (
            <line x1={xScale(activeRound)} x2={xScale(activeRound)} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="var(--muted)" strokeWidth={1} />
          )}

          {series.map((s) => (
            <path
              key={s.playerId}
              d={s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.roundNumber)} ${yScale(p.value)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {series.map((s) =>
            s.points.map((p, i) => (
              <circle
                key={`${s.playerId}-${i}`}
                cx={xScale(p.roundNumber)}
                cy={yScale(p.value)}
                r={activeRound === p.roundNumber ? 6 : 5}
                fill={markerColor(s, p)}
                stroke="var(--card-raised)"
                strokeWidth={2}
              />
            )),
          )}

          {activeRound !== last.roundNumber && (
            <text x={xScale(last.roundNumber)} y={yScale(last.value) - 12} textAnchor="end" className="chart-end-label">
              {formatNumber(last.value)}
            </text>
          )}
        </svg>

        {activeRows.length > 0 &&
          (() => {
            const leftPct = (xScale(activeRound!) / WIDTH) * 100;
            const topPct = (yScale(activeRows[0]!.point!.value) / HEIGHT) * 100;
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
                <div className="chart-tooltip-round">{activeRound === 0 ? 'Starting value' : `Round ${activeRound}`}</div>
                {activeRows.map(({ s, point }) => {
                  const p = point!;
                  const outcome = p.entry ? outcomeFor(p.entry) : null;
                  return (
                    <div key={s.playerId} className="chart-tooltip-series">
                      {comparing && <span className="chart-tooltip-dot" style={{ background: s.color }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {comparing && <div className="chart-tooltip-name">{s.name}</div>}
                        {p.entry && <div className="chart-tooltip-opponent">{describeEntry(p.entry)}</div>}
                        <div className="chart-tooltip-row">
                          {outcome && <span className={`outcome-pill ${OUTCOME_CLASS[outcome]}`}>{outcome}</span>}
                          {p.entry && (
                            <span className="chart-tooltip-delta">
                              {p.entry.points > 0 ? '+' : ''}
                              {formatNumber(p.entry.points)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="chart-tooltip-value">{formatNumber(p.value)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
      </div>

      {comparing && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.playerId} className="chart-legend-item">
              <span className="chart-tooltip-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div className="chart-compare">
        {compareSeries.map((s) => (
          <span key={s.playerId} className="chip">
            <span className="chart-tooltip-dot" style={{ background: s.color }} />
            {s.name}
            <button className="x" onClick={() => setCompareIds((ids) => ids.filter((id) => id !== s.playerId))} aria-label={`Remove ${s.name}`}>
              ✕
            </button>
          </span>
        ))}
        {compareIds.length < MAX_COMPARE && (
          <PlayerAutocomplete
            players={compareCandidates}
            onSelect={(p) => setCompareIds((ids) => [...ids, p.id])}
            placeholder="+ Compare to…"
            inputClassName="editable-name-input"
          />
        )}
      </div>
    </div>
  );
}
