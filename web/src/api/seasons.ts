import { api } from './client.js';
import type { Leaderboard, MembershipType, Player, PlayerHistory, Round, Season } from './types.js';

export function listSeasons() {
  return api.get<Season[]>('/seasons');
}
export function getSeason(id: number) {
  return api.get<Season>(`/seasons/${id}`);
}
export function getLeaderboard(id: number, afterRound?: number) {
  const query = afterRound != null ? `?afterRound=${afterRound}` : '';
  return api.get<Leaderboard>(`/seasons/${id}/leaderboard${query}`);
}
export function getPublicRounds(id: number) {
  return api.get<Round[]>(`/seasons/${id}/rounds`);
}
export function getPlayerHistory(seasonId: number, playerId: number) {
  return api.get<PlayerHistory>(`/seasons/${seasonId}/players/${playerId}/history`);
}

export function getCurrentSeason() {
  return api.get<Season>('/admin/seasons/current');
}

export function getNextRoundNumber(seasonId: number) {
  return api.get<{ number: number; existingDraft: { id: number; number: number } | null }>(
    `/admin/seasons/${seasonId}/next-round-number`,
  );
}

/** Same published rounds as the public feed, but every entry kind (incl. REGULAR_BYE). */
export function getAdminRounds(id: number) {
  return api.get<Round[]>(`/admin/seasons/${id}/rounds`);
}

/** Players actually enrolled in this season — the valid pool for "who's playing?",
 * swap-opponent, and assign-opponent pickers (never the club-wide players list,
 * which spans every season a player has ever touched). */
export function getEnrolledPlayers(id: number) {
  return api.get<Player[]>(`/admin/seasons/${id}/players`);
}

export interface RosterEntryInput {
  playerId?: number;
  newPlayerName?: string;
  membershipType?: MembershipType;
  startingValue: number;
}

export function createSeason(input: {
  name: string;
  topValue?: number;
  repeatPairingWindow?: number;
  countExternalMatches?: boolean;
  roster: RosterEntryInput[];
}) {
  return api.post<Season>('/admin/seasons', input);
}
export function endSeason(id: number) {
  return api.post<Season>(`/admin/seasons/${id}/end`);
}
export function updateSeasonSettings(
  id: number,
  data: {
    repeatPairingWindow?: number;
    countExternalMatches?: boolean;
    regularByeCap?: number;
    knsbTournamentName?: string;
    knsbPlannedEndDate?: string | null;
  },
) {
  return api.patch<Season>(`/admin/seasons/${id}/settings`, data);
}
