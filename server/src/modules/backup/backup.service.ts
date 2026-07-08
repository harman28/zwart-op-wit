import { prisma } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { BackupFile } from './backup.schema.js';

export async function exportSeasonBackup(seasonId: number): Promise<BackupFile> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      enrollments: { include: { player: true } },
      rounds: {
        orderBy: { number: 'asc' },
        include: {
          signups: { include: { player: true } },
          entries: { include: { whitePlayer: true, blackPlayer: true, soloPlayer: true } },
        },
      },
    },
  });
  if (!season) throw new HttpError(404, `Season ${seasonId} not found`);

  return {
    formatVersion: 1,
    exportedAt: new Date(),
    season: {
      name: season.name,
      topValue: season.topValue,
      repeatPairingWindow: season.repeatPairingWindow,
      countExternalMatches: season.countExternalMatches,
      startedAt: season.startedAt,
      endedAt: season.endedAt,
    },
    players: season.enrollments.map((e) => ({ name: e.player.name, membershipType: e.player.membershipType })),
    enrollments: season.enrollments.map((e) => ({ playerName: e.player.name, startingValue: e.startingValue })),
    rounds: season.rounds.map((round) => ({
      number: round.number,
      date: round.date,
      isPublished: round.isPublished,
      signedUp: round.signups.map((s) => s.player.name),
      entries: round.entries.map((entry) => {
        switch (entry.kind) {
          case 'GAME':
            return {
              kind: 'GAME' as const,
              white: entry.whitePlayer!.name,
              black: entry.blackPlayer!.name,
              result: entry.result,
              isSelfArranged: entry.isSelfArranged,
              tableNumber: entry.tableNumber,
            };
          case 'PAIRING_BYE':
          case 'REGULAR_BYE':
            return { kind: entry.kind, player: entry.soloPlayer!.name };
          case 'EXTERNAL_BYE':
            return { kind: 'EXTERNAL_BYE' as const, player: entry.soloPlayer!.name, outcome: entry.externalOutcome };
        }
      }),
    })),
  };
}

/**
 * Wipes the given season and rebuilds it verbatim from the file, all inside
 * one transaction. No separate recompute step exists or is needed — since
 * scores are never stored, the very next leaderboard read naturally
 * re-derives correct standings from the rows written here. Restore really is
 * just wipe + reimport.
 *
 * Everything below is batched (createMany), not one create-per-row — a
 * real season's worth of enrollments/signups/entries is easily 200+ rows,
 * and sequential awaited creates inside one transaction blew past Prisma's
 * default interactive-transaction timeout the first time this ran for real.
 */
export async function importSeasonBackup(data: BackupFile, seasonId: number) {
  return prisma.$transaction(
    async (tx) => {
      const existingSeason = await tx.season.findUnique({ where: { id: seasonId } });
      if (!existingSeason) throw new HttpError(404, `Season ${seasonId} not found`);

      const names = [...new Set(data.players.map((p) => p.name))];
      const existingPlayers = await tx.player.findMany({ where: { name: { in: names } } });
      const existingNames = new Set(existingPlayers.map((p) => p.name));
      const missing = data.players.filter((p) => !existingNames.has(p.name));
      if (missing.length > 0) {
        await tx.player.createMany({ data: missing });
      }
      const allPlayers = existingNames.size === names.length ? existingPlayers : await tx.player.findMany({ where: { name: { in: names } } });
      const playerIdByName = new Map(allPlayers.map((p) => [p.name, p.id]));

      const resolvePlayerId = (name: string): number => {
        const id = playerIdByName.get(name);
        if (id == null) throw new HttpError(400, `Backup references a player not listed in "players": "${name}"`);
        return id;
      };

      await tx.round.deleteMany({ where: { seasonId } }); // cascades signups + entries
      await tx.seasonEnrollment.deleteMany({ where: { seasonId } });
      await tx.season.update({
        where: { id: seasonId },
        data: {
          name: data.season.name,
          topValue: data.season.topValue,
          repeatPairingWindow: data.season.repeatPairingWindow,
          countExternalMatches: data.season.countExternalMatches,
          startedAt: data.season.startedAt,
          endedAt: data.season.endedAt ?? null,
          isArchived: data.season.endedAt != null,
        },
      });

      await tx.seasonEnrollment.createMany({
        data: data.enrollments.map((e) => ({
          seasonId,
          playerId: resolvePlayerId(e.playerName),
          startingValue: e.startingValue,
        })),
      });

      for (const round of data.rounds) {
        const createdRound = await tx.round.create({
          data: { seasonId, number: round.number, date: round.date, isPublished: round.isPublished },
        });
        if (round.signedUp.length > 0) {
          await tx.roundSignup.createMany({
            data: round.signedUp.map((name) => ({ roundId: createdRound.id, playerId: resolvePlayerId(name) })),
          });
        }
        if (round.entries.length > 0) {
          await tx.roundEntry.createMany({
            data: round.entries.map((entry) => {
              if (entry.kind === 'GAME') {
                return {
                  roundId: createdRound.id,
                  kind: 'GAME' as const,
                  whitePlayerId: resolvePlayerId(entry.white),
                  blackPlayerId: resolvePlayerId(entry.black),
                  result: entry.result,
                  isSelfArranged: entry.isSelfArranged,
                  tableNumber: entry.tableNumber ?? null,
                };
              }
              if (entry.kind === 'EXTERNAL_BYE') {
                return {
                  roundId: createdRound.id,
                  kind: 'EXTERNAL_BYE' as const,
                  soloPlayerId: resolvePlayerId(entry.player),
                  externalOutcome: entry.outcome,
                };
              }
              return { roundId: createdRound.id, kind: entry.kind, soloPlayerId: resolvePlayerId(entry.player) };
            }),
          });
        }
      }

      return tx.season.findUniqueOrThrow({ where: { id: seasonId } });
    },
    { timeout: 15000 },
  );
}
