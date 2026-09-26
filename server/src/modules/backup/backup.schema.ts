import { z } from 'zod';

const membershipTypeSchema = z.enum(['FULL', 'INTERNAL_ONLY', 'GUEST']);
const genderSchema = z.enum(['M', 'V', 'X']);
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
  z.object({ kind: z.literal('REGULAR_BYE'), player: z.string(), isRetroactive: z.boolean().default(false) }),
  z.object({ kind: z.literal('EXTERNAL_BYE'), player: z.string(), outcome: externalOutcomeSchema.nullable() }),
]);

const backupRoundSchema = z.object({
  number: z.number().int(),
  date: z.coerce.date(),
  isPublished: z.boolean().default(false),
  signedUp: z.array(z.string()),
  entries: z.array(backupEntrySchema),
});

// Every player that has ever existed, not just those currently enrolled in
// some season — a guest who played one round three seasons ago is still a
// real historical identity and must survive a restore intact.
const backupPlayerSchema = z.object({
  name: z.string(),
  membershipType: membershipTypeSchema,
  notes: z.string().nullable().optional(),
  archivedAt: z.coerce.date().nullable().optional(),
  gender: genderSchema.nullable().optional(),
  knsbId: z.string().nullable().optional(),
  federation: z.string().nullable().optional(),
  duesPaid: z.boolean().optional(),
});

const backupSeasonSchema = z.object({
  name: z.string(),
  topValue: z.number().int(),
  repeatPairingWindow: z.number().int(),
  countExternalMatches: z.boolean(),
  regularByeCap: z.number().int(),
  knsbTournamentName: z.string().nullable().optional(),
  knsbPlannedEndDate: z.coerce.date().nullable().optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable().optional(),
  isArchived: z.boolean().default(false),
  enrollments: z.array(z.object({ playerName: z.string(), startingValue: z.number().int() })),
  rounds: z.array(backupRoundSchema),
});

// Deliberately excludes adminPasswordHash — this file is meant to be
// downloaded, emailed, dropped in a shared folder, etc., and a password
// hash has no business riding along in something that portable. A restore
// never touches the current admin password.
const backupClubSettingsSchema = z.object({
  defaultTopValue: z.number().int(),
  defaultRepeatPairingWindow: z.number().int(),
  defaultCountExternalMatches: z.boolean(),
  defaultRegularByeCap: z.number().int(),
  defaultKnsbArbiterName: z.string().nullable().optional(),
  defaultKnsbArbiterEmail: z.string().nullable().optional(),
  defaultKnsbExportFilename: z.string().optional(),
});

export const backupFileSchema = z.object({
  formatVersion: z.literal(2),
  exportedAt: z.coerce.date().optional(),
  clubSettings: backupClubSettingsSchema,
  players: z.array(backupPlayerSchema),
  seasons: z.array(backupSeasonSchema),
});

export type BackupFile = z.infer<typeof backupFileSchema>;
