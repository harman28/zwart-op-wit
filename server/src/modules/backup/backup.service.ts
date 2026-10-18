import { prisma } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { BackupFile } from './backup.schema.js';

/**
 * A real disaster-recovery backup: every player ever created (not just
 * those enrolled in some season), every season with its full settings,
 * and the club-wide defaults — everything needed to rebuild this instance
 * from nothing. Deliberately excludes adminPasswordHash (see backup.schema.ts)
 * and AdminSession/AdminActionLog, which are this environment's own runtime
 * state, not club data.
 */
export async function exportFullBackup(): Promise<BackupFile> {
  const [players, seasons, clubSettings, externalTeams] = await Promise.all([
    prisma.player.findMany({ orderBy: { id: 'asc' }, include: { externalTeam: true } }),
    prisma.season.findMany({
      orderBy: { id: 'asc' },
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
    }),
    prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.externalTeam.findMany({ orderBy: { id: 'asc' } }),
  ]);

  return {
    formatVersion: 2,
    exportedAt: new Date(),
    clubSettings: {
      defaultTopValue: clubSettings.defaultTopValue,
      defaultRepeatPairingWindow: clubSettings.defaultRepeatPairingWindow,
      defaultCountExternalMatches: clubSettings.defaultCountExternalMatches,
      defaultRegularByeCap: clubSettings.defaultRegularByeCap,
      defaultKnsbArbiterName: clubSettings.defaultKnsbArbiterName,
      defaultKnsbArbiterEmail: clubSettings.defaultKnsbArbiterEmail,
      defaultKnsbExportFilename: clubSettings.defaultKnsbExportFilename,
    },
    players: players.map((p) => ({
      name: p.name,
      membershipType: p.membershipType,
      notes: p.notes,
      archivedAt: p.archivedAt,
      gender: p.gender,
      knsbId: p.knsbId,
      federation: p.federation,
      duesStatus: p.duesStatus,
      externalTeamName: p.externalTeam?.name ?? null,
    })),
    externalTeams: externalTeams.map((t) => ({ name: t.name, netstandUrl: t.netstandUrl })),
    seasons: seasons.map((season) => ({
      name: season.name,
      topValue: season.topValue,
      repeatPairingWindow: season.repeatPairingWindow,
      countExternalMatches: season.countExternalMatches,
      regularByeCap: season.regularByeCap,
      knsbTournamentName: season.knsbTournamentName,
      knsbPlannedEndDate: season.knsbPlannedEndDate,
      startedAt: season.startedAt,
      endedAt: season.endedAt,
      isArchived: season.isArchived,
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
              return { kind: entry.kind, player: entry.soloPlayer!.name };
            case 'REGULAR_BYE':
              return { kind: entry.kind, player: entry.soloPlayer!.name, isRetroactive: entry.isRetroactive };
            case 'EXTERNAL_BYE':
              return { kind: 'EXTERNAL_BYE' as const, player: entry.soloPlayer!.name, outcome: entry.externalOutcome };
          }
        }),
      })),
    })),
  };
}

/**
 * Wipes the ENTIRE instance — every season, every player, every round —
 * and rebuilds it verbatim from the file, all inside one transaction.
 * adminPasswordHash and AdminSession/AdminActionLog are never touched (the
 * file doesn't carry them at all — see backup.schema.ts). Restore really is
 * just wipe + reimport, same principle as the old season-scoped restore,
 * just at the scale of the whole club instead of one season.
 *
 * Everything below is batched (createMany), not one create-per-row — a real
 * instance's worth of players/rounds/entries is easily 500+ rows, and
 * sequential awaited creates inside one transaction blew past Prisma's
 * default interactive-transaction timeout for the season-scoped version of
 * this at a fraction of this size.
 */
export async function importFullBackup(data: BackupFile) {
  const seen = new Set<string>();
  for (const p of data.players) {
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) throw new HttpError(409, `"${p.name}" appears more than once in the players list`);
    seen.add(key);
  }
  const seenTeams = new Set<string>();
  for (const t of data.externalTeams) {
    const key = t.name.trim().toLowerCase();
    if (seenTeams.has(key)) throw new HttpError(409, `"${t.name}" appears more than once in the externalTeams list`);
    seenTeams.add(key);
  }

  return prisma.$transaction(
    async (tx) => {
      // Seasons cascade away their own enrollments/rounds/signups/entries —
      // see the onDelete: Cascade relations in schema.prisma. Players have
      // to go second: nothing references them anymore once every season
      // (and everything under it) is gone. ExternalTeam has no onDelete
      // rule (Restrict by default), so it goes last — once every Player row
      // that could reference one is gone too.
      await tx.season.deleteMany({});
      await tx.player.deleteMany({});
      await tx.externalTeam.deleteMany({});

      await tx.clubSettings.update({
        where: { id: 1 },
        data: {
          defaultTopValue: data.clubSettings.defaultTopValue,
          defaultRepeatPairingWindow: data.clubSettings.defaultRepeatPairingWindow,
          defaultCountExternalMatches: data.clubSettings.defaultCountExternalMatches,
          defaultRegularByeCap: data.clubSettings.defaultRegularByeCap,
          defaultKnsbArbiterName: data.clubSettings.defaultKnsbArbiterName ?? null,
          defaultKnsbArbiterEmail: data.clubSettings.defaultKnsbArbiterEmail ?? null,
          ...(data.clubSettings.defaultKnsbExportFilename != null
            ? { defaultKnsbExportFilename: data.clubSettings.defaultKnsbExportFilename }
            : {}),
        },
      });

      // Created before players — player creation below needs to resolve
      // externalTeamName to an id, same reason seasons are created after
      // players (enrollments need a playerId to resolve).
      if (data.externalTeams.length > 0) {
        await tx.externalTeam.createMany({
          data: data.externalTeams.map((t) => ({ name: t.name, netstandUrl: t.netstandUrl })),
        });
      }
      const allExternalTeams = await tx.externalTeam.findMany();
      const externalTeamIdByName = new Map(allExternalTeams.map((t) => [t.name, t.id]));
      const resolveExternalTeamId = (name: string): number => {
        const id = externalTeamIdByName.get(name);
        if (id == null) throw new HttpError(400, `Backup references an external team not listed in "externalTeams": "${name}"`);
        return id;
      };

      if (data.players.length > 0) {
        await tx.player.createMany({
          data: data.players.map((p) => ({
            name: p.name,
            membershipType: p.membershipType,
            notes: p.notes ?? null,
            archivedAt: p.archivedAt ?? null,
            gender: p.gender ?? null,
            knsbId: p.knsbId ?? null,
            federation: p.federation ?? null,
            // New files carry duesStatus directly; an older file only has
            // duesPaid (or neither, for a file predating both).
            duesStatus: p.duesStatus ?? (p.duesPaid ? 'PAID' : 'UNPAID'),
            externalTeamId: p.externalTeamName ? resolveExternalTeamId(p.externalTeamName) : null,
          })),
        });
      }
      const allPlayers = await tx.player.findMany();
      const playerIdByName = new Map(allPlayers.map((p) => [p.name, p.id]));
      const resolvePlayerId = (name: string): number => {
        const id = playerIdByName.get(name);
        if (id == null) throw new HttpError(400, `Backup references a player not listed in "players": "${name}"`);
        return id;
      };

      for (const season of data.seasons) {
        const createdSeason = await tx.season.create({
          data: {
            name: season.name,
            topValue: season.topValue,
            repeatPairingWindow: season.repeatPairingWindow,
            countExternalMatches: season.countExternalMatches,
            regularByeCap: season.regularByeCap,
            knsbTournamentName: season.knsbTournamentName ?? null,
            knsbPlannedEndDate: season.knsbPlannedEndDate ?? null,
            startedAt: season.startedAt,
            endedAt: season.endedAt ?? null,
            isArchived: season.isArchived,
          },
        });

        if (season.enrollments.length > 0) {
          await tx.seasonEnrollment.createMany({
            data: season.enrollments.map((e) => ({
              seasonId: createdSeason.id,
              playerId: resolvePlayerId(e.playerName),
              startingValue: e.startingValue,
            })),
          });
        }

        for (const round of season.rounds) {
          const createdRound = await tx.round.create({
            data: {
              seasonId: createdSeason.id,
              number: round.number,
              date: round.date,
              isPublished: round.isPublished,
            },
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
                if (entry.kind === 'REGULAR_BYE') {
                  return {
                    roundId: createdRound.id,
                    kind: 'REGULAR_BYE' as const,
                    soloPlayerId: resolvePlayerId(entry.player),
                    isRetroactive: entry.isRetroactive,
                  };
                }
                return { roundId: createdRound.id, kind: entry.kind, soloPlayerId: resolvePlayerId(entry.player) };
              }),
            });
          }
        }
      }

      return { playersImported: data.players.length, seasonsImported: data.seasons.length };
    },
    { timeout: 30000 },
  );
}
