import { api } from './client.js';
import type { EntryKind, ExternalOutcome, GameResult, MembershipType, RoundAdmin } from './types.js';

export function createRound(
  seasonId: number,
  input: {
    number: number;
    date: string;
    signedUpPlayerIds: number[];
    newPlayers?: { name: string; membershipType?: MembershipType; startingValue: number }[];
  },
) {
  return api.post<RoundAdmin>(`/admin/seasons/${seasonId}/rounds`, input);
}

export function getRoundAdmin(id: number) {
  return api.get<RoundAdmin>(`/admin/rounds/${id}`);
}

export function updateRound(id: number, data: { number?: number; date?: string }) {
  return api.patch<RoundAdmin>(`/admin/rounds/${id}`, data);
}

export interface UpdateEntryInput {
  kind?: EntryKind;
  whitePlayerId?: number | null;
  blackPlayerId?: number | null;
  soloPlayerId?: number | null;
  result?: GameResult | null;
  externalOutcome?: ExternalOutcome | null;
  isSelfArranged?: boolean;
  tableNumber?: number | null;
}

export function updateEntry(roundId: number, entryId: number, data: UpdateEntryInput) {
  return api.patch(`/admin/rounds/${roundId}/entries/${entryId}`, data);
}

export function addEntry(
  roundId: number,
  data: {
    kind: EntryKind;
    whitePlayerId?: number;
    blackPlayerId?: number;
    soloPlayerId?: number;
    result?: GameResult;
    externalOutcome?: ExternalOutcome;
    isSelfArranged?: boolean;
    tableNumber?: number;
  },
) {
  return api.post(`/admin/rounds/${roundId}/entries`, data);
}

export function deleteEntry(roundId: number, entryId: number) {
  return api.delete(`/admin/rounds/${roundId}/entries/${entryId}`);
}

export function renumberTables(roundId: number, startAt: number) {
  return api.patch(`/admin/rounds/${roundId}/table-numbers`, { startAt });
}

export function publishRound(id: number) {
  return api.post<RoundAdmin>(`/admin/rounds/${id}/publish`);
}

export function deleteRound(id: number) {
  return api.delete(`/admin/rounds/${id}`);
}
