import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { Season } from '../api/types.js';

/** The season visitors/admin see by default: the most recently started one, ended or not. */
export function useLatestSeason() {
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seasonsApi
      .listSeasons()
      .then((seasons) => setSeason(seasons[0] ?? null))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load season'))
      .finally(() => setLoading(false));
  }, []);

  return { season, loading, error };
}
