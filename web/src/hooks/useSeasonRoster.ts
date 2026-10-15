import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';

/**
 * Every player enrolled in a season, id+name only — the candidate pool for
 * the value graph's "+ Compare" picker. Deliberately the public leaderboard
 * endpoint (not the admin-only enrolled-players one): the graph itself is
 * visible to a logged-out visitor, so the picker has to be too.
 */
export function useSeasonRoster(seasonId: number) {
  const [roster, setRoster] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    seasonsApi
      .getLeaderboard(seasonId)
      .then((lb) => setRoster(lb.standings.map((s) => ({ id: s.playerId, name: s.name }))))
      .catch(() => setRoster([]));
  }, [seasonId]);

  return roster;
}
