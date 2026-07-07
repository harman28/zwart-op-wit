export default function UnpairedCallout({
  playerName,
  onAssignOpponent,
}: {
  playerName: string;
  onAssignOpponent?: () => void;
}) {
  return (
    <div className="unpaired-flag">
      <span className="txt">
        <strong>{playerName}</strong>: <em>Unpaired</em>
      </span>
      {onAssignOpponent && (
        <button className="assign" onClick={onAssignOpponent}>
          Assign opponent
        </button>
      )}
    </div>
  );
}
