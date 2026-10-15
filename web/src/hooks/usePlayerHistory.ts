import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { PlayerHistory } from '../api/types.js';
import { errorMessage } from '../lib/format.js';

/**
 * One player's season history — shared by every "click a player, see their
 * results" surface (Leaderboard, Rounds, Players admin) so each only fetches
 * once per open, however many tabs (Results, Graph) switch over that same data.
 *
 * `seasonId`/`playerId` accept null so a caller whose modal isn't open yet
 * (e.g. Players admin, before a row is clicked) can call this hook
 * unconditionally — React hooks can't be called conditionally, and mounting
 * a whole modal subtree just to satisfy that isn't worth it here.
 */
export function usePlayerHistory(seasonId: number | null, playerId: number | null, afterRound?: number) {
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(null);
    setError(null);
    if (seasonId == null || playerId == null) return;
    seasonsApi
      .getPlayerHistory(seasonId, playerId, afterRound)
      .then(setHistory)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [seasonId, playerId, afterRound]);

  return { history, error };
}
