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
            return { kind: 'EXTERNAL_BYE' as const, player: entry.soloPlayer!.name, outcome: entry.externalOutcome! };
        }
      }),
    })),
  };
}

export type ImportMode = { mode: 'replace'; seasonId: number } | { mode: 'new-season' };

/**
 * Wipes (mode=replace) or creates (mode=new-season) a season and rebuilds it
 * verbatim from the file, all inside one transaction. No separate recompute
 * step exists or is needed — since scores are never stored, the very next
 * leaderboard read naturally re-derives correct standings from the rows
 * written here. Restore really is just wipe + reimport.
 */
export async function importSeasonBackup(data: BackupFile, options: ImportMode) {
  return prisma.$transaction(async (tx) => {
    const playerIdByName = new Map<string, number>();
    for (const p of data.players) {
      const existing = await tx.player.findFirst({ where: { name: p.name } });
      const player = existing ?? (await tx.player.create({ data: { name: p.name, membershipType: p.membershipType } }));
      playerIdByName.set(p.name, player.id);
    }

    const resolvePlayerId = (name: string): number => {
      const id = playerIdByName.get(name);
      if (id == null) throw new HttpError(400, `Backup references a player not listed in "players": "${name}"`);
      return id;
    };

    const seasonFields = {
      name: data.season.name,
      topValue: data.season.topValue,
      repeatPairingWindow: data.season.repeatPairingWindow,
      countExternalMatches: data.season.countExternalMatches,
      startedAt: data.season.startedAt,
      endedAt: data.season.endedAt ?? null,
      isArchived: data.season.endedAt != null,
    };

    let seasonId: number;
    if (options.mode === 'replace') {
      seasonId = options.seasonId;
      const existingSeason = await tx.season.findUnique({ where: { id: seasonId } });
      if (!existingSeason) throw new HttpError(404, `Season ${seasonId} not found`);
      await tx.round.deleteMany({ where: { seasonId } }); // cascades signups + entries
      await tx.seasonEnrollment.deleteMany({ where: { seasonId } });
      await tx.season.update({ where: { id: seasonId }, data: seasonFields });
    } else {
      const created = await tx.season.create({ data: seasonFields });
      seasonId = created.id;
    }

    for (const e of data.enrollments) {
      await tx.seasonEnrollment.create({
        data: { seasonId, playerId: resolvePlayerId(e.playerName), startingValue: e.startingValue },
      });
    }

    for (const round of data.rounds) {
      const createdRound = await tx.round.create({
        data: { seasonId, number: round.number, date: round.date, isPublished: round.isPublished },
      });
      for (const name of round.signedUp) {
        await tx.roundSignup.create({ data: { roundId: createdRound.id, playerId: resolvePlayerId(name) } });
      }
      for (const entry of round.entries) {
        if (entry.kind === 'GAME') {
          await tx.roundEntry.create({
            data: {
              roundId: createdRound.id,
              kind: 'GAME',
              whitePlayerId: resolvePlayerId(entry.white),
              blackPlayerId: resolvePlayerId(entry.black),
              result: entry.result,
              isSelfArranged: entry.isSelfArranged,
              tableNumber: entry.tableNumber ?? null,
            },
          });
        } else if (entry.kind === 'EXTERNAL_BYE') {
          await tx.roundEntry.create({
            data: {
              roundId: createdRound.id,
              kind: 'EXTERNAL_BYE',
              soloPlayerId: resolvePlayerId(entry.player),
              externalOutcome: entry.outcome,
            },
          });
        } else {
          await tx.roundEntry.create({
            data: { roundId: createdRound.id, kind: entry.kind, soloPlayerId: resolvePlayerId(entry.player) },
          });
        }
      }
    }

    return tx.season.findUniqueOrThrow({ where: { id: seasonId } });
  });
}
