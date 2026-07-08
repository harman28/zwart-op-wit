import { prisma } from '../../db/client.js';

export async function recordAction(data: {
  actorName: string | null;
  method: string;
  path: string;
  summary: string;
}): Promise<void> {
  await prisma.adminActionLog.create({ data });
}

export async function listActions(params: { limit: number; beforeId?: number }) {
  return prisma.adminActionLog.findMany({
    where: params.beforeId != null ? { id: { lt: params.beforeId } } : undefined,
    orderBy: { id: 'desc' },
    take: params.limit,
  });
}
