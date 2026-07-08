import { prisma } from '../../db/client.js';

/** Prefill defaults for the next new season — never exposes adminPasswordHash. */
export async function getClubSettings() {
  const settings = await prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } });
  return {
    defaultTopValue: settings.defaultTopValue,
    defaultRepeatPairingWindow: settings.defaultRepeatPairingWindow,
    defaultCountExternalMatches: settings.defaultCountExternalMatches,
    defaultRegularByeCap: settings.defaultRegularByeCap,
    defaultKnsbArbiterName: settings.defaultKnsbArbiterName,
    defaultKnsbArbiterEmail: settings.defaultKnsbArbiterEmail,
  };
}

export async function updateClubSettings(data: {
  defaultTopValue?: number;
  defaultRepeatPairingWindow?: number;
  defaultCountExternalMatches?: boolean;
  defaultRegularByeCap?: number;
  defaultKnsbArbiterName?: string;
  defaultKnsbArbiterEmail?: string;
}) {
  const updated = await prisma.clubSettings.update({ where: { id: 1 }, data });
  return {
    defaultTopValue: updated.defaultTopValue,
    defaultRepeatPairingWindow: updated.defaultRepeatPairingWindow,
    defaultCountExternalMatches: updated.defaultCountExternalMatches,
    defaultRegularByeCap: updated.defaultRegularByeCap,
    defaultKnsbArbiterName: updated.defaultKnsbArbiterName,
    defaultKnsbArbiterEmail: updated.defaultKnsbArbiterEmail,
  };
}
