import { useState } from 'react';
import { usePlayerHistory } from '../hooks/usePlayerHistory.js';
import Modal from './Modal.js';
import PlayerHistoryPanel from './PlayerHistoryPanel.js';
import PlayerValueChart from './PlayerValueChart.js';

export default function PlayerHistoryModal({
  seasonId,
  playerId,
  afterRound,
  onClose,
}: {
  seasonId: number;
  playerId: number;
  /** Rebase the history under standings as they stood right after this
   * published round, instead of the season's current state — matches
   * whatever round the leaderboard this modal was opened from is showing. */
  afterRound?: number;
  onClose: () => void;
}) {
  const { history, error } = usePlayerHistory(seasonId, playerId, afterRound);
  const [tab, setTab] = useState<'results' | 'graph'>('results');

  return (
    <Modal title={history?.name ?? 'Player history'} onClose={onClose} wide={tab === 'graph'}>
      <div className="modal-tabs">
        <button className={tab === 'results' ? 'modal-tab current' : 'modal-tab'} onClick={() => setTab('results')}>
          Results
        </button>
        <button className={tab === 'graph' ? 'modal-tab current' : 'modal-tab'} onClick={() => setTab('graph')}>
          Graph
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!history && !error && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {history &&
        (tab === 'results' ? (
          <PlayerHistoryPanel history={history} />
        ) : (
          <PlayerValueChart history={history} seasonId={seasonId} afterRound={afterRound} />
        ))}
    </Modal>
  );
}
