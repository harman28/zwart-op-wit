import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { PlayerHistory } from '../api/types.js';

/**
 * One PlayerHistory per id in `playerIds` — the comparison players added
 * alongside a value graph's primary player. Only fetches ids it doesn't
 * already have; removing an id just stops it being read, nothing is evicted,
 * so re-adding someone already seen this session is instant.
 */
export function usePlayerHistories(seasonId: number, playerIds: number[], afterRound?: number) {
  const [histories, setHistories] = useState<Map<number, PlayerHistory>>(new Map());

  useEffect(() => {
    const missing = playerIds.filter((id) => !histories.has(id));
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) =>
        seasonsApi
          .getPlayerHistory(seasonId, id, afterRound)
          .then((h): [number, PlayerHistory] => [id, h])
          .catch(() => null),
      ),
    ).then((results) => {
      setHistories((prev) => {
        const next = new Map(prev);
        for (const r of results) if (r) next.set(r[0], r[1]);
        return next;
      });
    });
    // histories intentionally excluded — it's this effect's own state, and
    // including it would refire on every fetch it just completed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, playerIds, afterRound]);

  return histories;
}
