import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../env.js';

// Prisma 7: PrismaClient no longer opens its own connection from a schema
// URL — it requires an injected driver adapter. Dev-mode singleton avoids
// exhausting connections on hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
