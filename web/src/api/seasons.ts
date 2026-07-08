import { api } from './client.js';
import type { Leaderboard, MembershipType, Round, Season } from './types.js';

export function listSeasons() {
  return api.get<Season[]>('/seasons');
}
export function getSeason(id: number) {
  return api.get<Season>(`/seasons/${id}`);
}
export function getLeaderboard(id: number) {
  return api.get<Leaderboard>(`/seasons/${id}/leaderboard`);
}
export function getPublicRounds(id: number) {
  return api.get<Round[]>(`/seasons/${id}/rounds`);
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
