import { prisma } from '../../db/client.js';

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
