import { useState } from 'react';
import Modal from './Modal.js';
import PlayerHistoryPanel from './PlayerHistoryPanel.js';

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
   * whatever round the leaderboard this modal was opened from is showing.
   * Omit (or leave undefined) to show the full season to date. */
  afterRound?: number;
  onClose: () => void;
}) {
  // PlayerHistoryPanel owns the fetch (and the record/summary line that
  // comes with it); it reports the name back up once loaded so the modal
  // chrome (owned here, not by the panel) can title itself.
  const [title, setTitle] = useState('Player history');

  return (
    <Modal title={title} onClose={onClose}>
      <PlayerHistoryPanel seasonId={seasonId} playerId={playerId} afterRound={afterRound} onNameLoaded={setTitle} />
    </Modal>
  );
}
