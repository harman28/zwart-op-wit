import type { ExternalOutcome } from '../api/types.js';

const OPTIONS: { outcome: ExternalOutcome; label: string; cls: string }[] = [
  { outcome: 'WIN', label: 'Won', cls: 'win' },
  { outcome: 'DRAW', label: 'Drew', cls: 'draw' },
  { outcome: 'LOSS', label: 'Lost', cls: 'loss' },
];

export default function ExternalOutcomeToggle({
  value,
  onChange,
}: {
  value: ExternalOutcome | null;
  onChange: (outcome: ExternalOutcome) => void;
}) {
  return (
    <span className="result-toggle">
      {OPTIONS.map((opt) => (
        <button
          key={opt.outcome}
          className={value === opt.outcome ? `sel ${opt.cls}` : ''}
          onClick={() => onChange(opt.outcome)}
        >
          {opt.label}
        </button>
      ))}
    </span>
  );
}
