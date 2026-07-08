import { prisma } from '../../db/client.js';
import { replaySeason } from '../../engine/standings.js';
import { HttpError } from '../../lib/errors.js';
import { mapEnrollmentsToBaselines, mapRoundToEngine } from '../../lib/mappers.js';
import { generateKnsbExport, type KnsbPlayerRow, type KnsbRoundResult } from './knsbExport.js';

const PLACE = 'Amsterdam';
const COUNTRY = 'NED';
const TIME_CONTROL = '25+10'; // Internal Keizer competition — Rapid, per KNSB's own classification.
const PAIRING_METHOD = 'Individual: Keizer system';

/**
 * Builds the fixed-width KNSB submission for one reporting batch (Jim
 * submits monthly — a range of rounds, not the whole season to date).
 * Every enrolled player is listed, even one who didn't play any game in this
 * particular range (all rounds render blank/"not paired" for them) — safer
 * than guessing who to exclude, since a missing real result would be a
 * genuine rating-data bug while an extra all-blank row is harmless.
 */
export async function generateSeasonKnsbExport(
  seasonId: number,
  fromRound: number,
  throughRound: number,
): Promise<string> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { enrollments: { include: { player: true } } },
  });
  if (!season) throw new HttpError(404, `Season ${seasonId} not found`);

  const clubSettings = await prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } });

  const allRounds = await prisma.round.findMany({
    where: { seasonId },
    include: { entries: true },
    orderBy: { number: 'asc' },
  });
  const rangeRounds = allRounds.filter((r) => r.number >= fromRound && r.number <= throughRound);
  if (rangeRounds.length === 0) throw new HttpError(400, `No rounds numbered ${fromRound}-${throughRound} exist`);

  // Lotingsnummer (seed number) reflects each player's standing just before
  // this batch starts — replay only the rounds strictly before fromRound.
  const priorRounds = allRounds.filter((r) => r.number < fromRound);
  const roundsForReplay = season.countExternalMatches
    ? priorRounds
    : priorRounds.map((r) => ({ ...r, entries: r.entries.filter((e) => e.kind !== 'EXTERNAL_BYE') }));
  const replay = replaySeason({
    topValue: season.topValue,
    baselines: mapEnrollmentsToBaselines(season.enrollments),
    rounds: roundsForReplay.map(mapRoundToEngine),
  });
  const standingsByPlayer = new Map(replay.current.standings.map((s) => [s.playerId, s]));

  const rankedByValue = season.enrollments
    .map((e) => ({ playerId: e.playerId, value: standingsByPlayer.get(e.playerId)?.value ?? e.startingValue }))
    .sort((a, b) => b.value - a.value);
  const lotingsnummerByPlayer = new Map(rankedByValue.map((r, idx) => [r.playerId, idx + 1]));

  const players: KnsbPlayerRow[] = season.enrollments.map((e) => {
    const lotingsnummer = lotingsnummerByPlayer.get(e.playerId)!;
    let totalScore = 0;
    const rounds: KnsbRoundResult[] = rangeRounds.map((round) => {
      const entry = round.entries.find(
        (en) =>
          en.kind === 'GAME' &&
          (en.whitePlayerId === e.playerId || en.blackPlayerId === e.playerId) &&
          en.result != null &&
          en.result !== 'WHITE_WIN_FORFEIT' &&
          en.result !== 'BLACK_WIN_FORFEIT',
      );
      if (!entry) return { opponentLotingsnummer: null, color: null, result: null };

      const isWhite = entry.whitePlayerId === e.playerId;
      const opponentId = (isWhite ? entry.blackPlayerId : entry.whitePlayerId)!;
      const color: 'w' | 'b' = isWhite ? 'w' : 'b';
      let result: '1' | '=' | '0';
      let points: number;
      if (entry.result === 'DRAW') {
        result = '=';
        points = 0.5;
      } else {
        const whiteWon = entry.result === 'WHITE_WIN';
        const won = isWhite ? whiteWon : !whiteWon;
        result = won ? '1' : '0';
        points = won ? 1 : 0;
      }
      totalScore += points;
      return { opponentLotingsnummer: lotingsnummerByPlayer.get(opponentId) ?? 0, color, result };
    });

    return {
      lotingsnummer,
      gender: e.player.gender,
      name: e.player.name,
      knsbRating: 0, // KNSB owns its own on-file rating; we never track/report a live value.
      federation: e.player.federation,
      knsbId: e.player.knsbId,
      totalScore,
      finalRanking: lotingsnummer,
      rounds,
    };
  });
  players.sort((a, b) => a.lotingsnummer - b.lotingsnummer);

  return generateKnsbExport({
    tournamentName: season.knsbTournamentName ?? season.name,
    place: PLACE,
    country: COUNTRY,
    startDate: season.startedAt,
    endDate: season.knsbPlannedEndDate ?? season.endedAt ?? season.startedAt,
    arbiterName: clubSettings.defaultKnsbArbiterName ?? '',
    arbiterEmail: clubSettings.defaultKnsbArbiterEmail ?? '',
    timeControl: TIME_CONTROL,
    pairingMethod: PAIRING_METHOD,
    roundDates: rangeRounds.map((r) => r.date),
    players,
  });
}
