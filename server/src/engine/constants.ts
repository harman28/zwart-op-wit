import type { ExternalOutcome } from './types.js';

export const DEFAULT_TOP_VALUE = 120;
export const DEFAULT_REPEAT_PAIRING_WINDOW = 6;

export const REGULAR_BYE_FRACTION = 1 / 3;
export const PAIRING_BYE_FRACTION = 2 / 3;
export const EXTERNAL_BYE_FRACTION: Record<ExternalOutcome, number> = {
  WIN: 0.75,
  DRAW: 0.5,
  LOSS: 0.25,
};

export const REGULAR_BYE_CAP = 3;
export const PAIRING_BYE_CAP = 1;
export const SELF_ARRANGED_CAP = 3;
