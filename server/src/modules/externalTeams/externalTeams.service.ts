import { prisma } from '../../db/client.js';
import { matchRosterNamesToPlayers } from './netstandScrape.js';
import { fetchDivisionStandings, type DivisionStandings } from './netstandDivisionScrape.js';
import { fetchTeamDetails, type TeamDetails, type TeamRosterPlayer } from './netstandTeamScrape.js';

/**
 * The two Zwart op Wit external teams' own division pages, for the public
 * standings embed (`GET /api/external-teams/standings`). Hardcoded rather
 * than a new ExternalTeam.divisionUrl DB column: this is a fixed pair the
 * club itself described as "the two external teams", divisions only change
 * once a year on promotion/relegation, and the existing ExternalTeam rows
 * are already managed the same informal way (see externalTeams.routes.ts's
 * own comment) — a code change + redeploy once a season beats carrying a
 * schema migration for something this rarely touched.
 */
const EXTERNAL_DIVISIONS: { teamName: string; divisionUrl: string }[] = [
  { teamName: 'Zwart op Wit 1', divisionUrl: 'https://sga.netstand.nl/divisions/view/82' },
  { teamName: 'Zwart op Wit 2', divisionUrl: 'https://sga.netstand.nl/divisions/view/83' },
];

export interface ExternalDivisionStandings extends DivisionStandings {
  ourTeamName: string;
  /** The matching ExternalTeam.id, looked up by name — null if no such row
   * exists (e.g. the name in EXTERNAL_DIVISIONS and the admin-managed
   * ExternalTeam table have drifted apart). Lets the standings table link
   * our own team's name to its own /external-teams/:id page, same id the
   * admin-only CRUD endpoints below already use — single source of truth
   * for "which id is this team", rather than inventing a second one here. */
  ourTeamId: number | null;
}

/** Standings rarely change (at most once a week, when a round's results get
 * entered on netstand) — this just avoids hitting sga.netstand.nl on every
 * single embed page view, same light-touch caching web/server.mjs already
 * does for its own share-image lookups. */
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { expires: number; value: ExternalDivisionStandings[] } | null = null;

export async function getExternalDivisionStandings(): Promise<ExternalDivisionStandings[]> {
  if (cache && cache.expires > Date.now()) return cache.value;
  const value = await Promise.all(
    EXTERNAL_DIVISIONS.map(async ({ teamName, divisionUrl }) => {
      const [standings, ourTeam] = await Promise.all([
        fetchDivisionStandings(divisionUrl),
        prisma.externalTeam.findFirst({ where: { name: teamName } }),
      ]);
      return { ourTeamName: teamName, ourTeamId: ourTeam?.id ?? null, ...standings };
    }),
  );
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

export interface EnrichedTeamDetails extends TeamDetails {
  roster: (TeamRosterPlayer & { playerId: number | null })[];
}

const teamDetailsCache = new Map<number, { expires: number; value: EnrichedTeamDetails }>();

export async function getTeamDetails(id: number): Promise<EnrichedTeamDetails | null> {
  const cached = teamDetailsCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;
  const team = await prisma.externalTeam.findUnique({ where: { id } });
  if (!team) return null;
  const details = await fetchTeamDetails(team.netstandUrl);
  // Scoped to players already linked to this ExternalTeam (an admin-managed
  // signal elsewhere in the app) rather than a blind name search across the
  // whole club, so a shared first name on a different team can't cause a
  // wrong match.
  const candidates = await prisma.player.findMany({ where: { externalTeamId: id } });
  const roster = matchRosterNamesToPlayers(details.roster, candidates);
  const value: EnrichedTeamDetails = { ...details, roster };
  teamDetailsCache.set(id, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function listExternalTeams() {
  return prisma.externalTeam.findMany({ orderBy: { name: 'asc' } });
}

export async function createExternalTeam(data: { name: string; netstandUrl: string }) {
  return prisma.externalTeam.create({ data });
}

export async function updateExternalTeam(id: number, data: { name?: string; netstandUrl?: string }) {
  return prisma.externalTeam.update({ where: { id }, data });
}

export async function deleteExternalTeam(id: number) {
  // Clears the FK on any player pointing at it rather than blocking the
  // delete — same "never lose historical data over a housekeeping action"
  // principle as archiving a player, just there's no history to lose here.
  await prisma.player.updateMany({ where: { externalTeamId: id }, data: { externalTeamId: null } });
  await prisma.externalTeam.delete({ where: { id } });
}
