export default function TableStepper({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number) => void;
}) {
  const current = value ?? 0;
  return (
    <span className="table-stepper">
      <button onClick={() => onChange(current - 1)} aria-label="Decrease table number">
        −
      </button>
      {current}
      <button onClick={() => onChange(current + 1)} aria-label="Increase table number">
        +
      </button>
    </span>
  );
}
