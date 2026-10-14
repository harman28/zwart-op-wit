import { useState } from 'react';
import type { Standing } from '../api/types.js';
import Modal from './Modal.js';
import PlayerHistoryPanel from './PlayerHistoryPanel.js';

export default function PlayerHistoryModal({
  seasonId,
  playerId,
  standing,
  afterRound,
  onClose,
}: {
  seasonId: number;
  playerId: number;
  /** The player's current-season standing, if the caller already has it
   * (e.g. from the leaderboard it was opened from) — shows the same
   * record/Played/Win/Color/Odd summary as the leaderboard card, above the
   * round-by-round breakdown. Omit if unavailable; the modal still works,
   * just without that summary. */
  standing?: Standing;
  /** Rebase the history under standings as they stood right after this
   * published round, instead of the season's current state — matches
   * whatever round the leaderboard this modal was opened from is showing.
   * Omit (or leave undefined) to show the full season to date. */
  afterRound?: number;
  onClose: () => void;
}) {
  // PlayerHistoryPanel owns the fetch; it reports the name back up once
  // loaded so the modal chrome (owned here, not by the panel) can title itself.
  const [title, setTitle] = useState('Player history');

  return (
    <Modal title={title} onClose={onClose}>
      <PlayerHistoryPanel
        seasonId={seasonId}
        playerId={playerId}
        standing={standing}
        afterRound={afterRound}
        onNameLoaded={setTitle}
      />
    </Modal>
  );
}
