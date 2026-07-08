import type { GameResult } from '../api/types.js';

const OPTIONS: { result: GameResult; label: string; cls: string }[] = [
  { result: 'WHITE_WIN', label: '1–0', cls: 'white-win' },
  { result: 'DRAW', label: '½–½', cls: 'draw' },
  { result: 'BLACK_WIN', label: '0–1', cls: 'black-win' },
];

export default function ResultToggle({
  value,
  onChange,
}: {
  value: GameResult | null;
  onChange: (result: GameResult) => void;
}) {
  return (
    <span className="result-toggle">
      {OPTIONS.map((opt) => (
        <button
          key={opt.result}
          className={value === opt.result ? `sel ${opt.cls}` : ''}
          onClick={() => onChange(opt.result)}
        >
          {opt.label}
        </button>
      ))}
    </span>
  );
}
