import { z } from 'zod';

const membershipTypeSchema = z.enum(['FULL', 'INTERNAL_ONLY', 'GUEST']);
const gameResultSchema = z.enum(['WHITE_WIN', 'BLACK_WIN', 'DRAW', 'WHITE_WIN_FORFEIT', 'BLACK_WIN_FORFEIT']);
const externalOutcomeSchema = z.enum(['WIN', 'DRAW', 'LOSS']);

// Players are referenced by name, not opaque IDs — the file is human-readable
// and portable to a completely fresh database.
const backupEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('GAME'),
    white: z.string(),
    black: z.string(),
    result: gameResultSchema.nullable(),
    isSelfArranged: z.boolean().default(false),
    tableNumber: z.number().int().nullable().optional(),
  }),
  z.object({ kind: z.literal('PAIRING_BYE'), player: z.string() }),
  z.object({ kind: z.literal('REGULAR_BYE'), player: z.string() }),
  z.object({ kind: z.literal('EXTERNAL_BYE'), player: z.string(), outcome: externalOutcomeSchema }),
]);

const backupRoundSchema = z.object({
  number: z.number().int(),
  date: z.coerce.date(),
  isPublished: z.boolean().default(false),
  signedUp: z.array(z.string()),
  entries: z.array(backupEntrySchema),
});

export const backupFileSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.coerce.date().optional(),
  season: z.object({
    name: z.string(),
    topValue: z.number().int(),
    repeatPairingWindow: z.number().int(),
    countExternalMatches: z.boolean(),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date().nullable().optional(),
  }),
  players: z.array(z.object({ name: z.string(), membershipType: membershipTypeSchema })),
  enrollments: z.array(z.object({ playerName: z.string(), startingValue: z.number().int() })),
  rounds: z.array(backupRoundSchema),
});

export type BackupFile = z.infer<typeof backupFileSchema>;
