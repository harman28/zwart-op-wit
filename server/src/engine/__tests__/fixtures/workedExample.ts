import type { SeasonReplayInput } from '../../types.js';

/**
 * The 6-player, 2-round worked example from the club's own rules document
 * ("Example - Keizer score calculation"), transcribed exactly. topValue=90
 * matches that specific example (the club's current live parameter is 120 —
 * see the `topValue` parametrization test).
 *
 * Player IDs: 1=Joppe 2=Jim 3=Maurice 4=Sebastian 5=Wiebe 6=Robbert
 *
 * Note: the doc's own round-2 score prose has a typo ("Jim: ... 0 (loss vs
 * Sebastian)") that contradicts its own pairing description ("Maurice plays
 * Jim instead"). Doesn't affect any assertion — a loss contributes 0
 * regardless of opponent — but the pairing here follows the doc's stated
 * pairing (Maurice vs Jim), not the inconsistent prose.
 */
export const WORKED_EXAMPLE_TOP_VALUE = 90;

export const JOPPE = 1;
export const JIM = 2;
export const MAURICE = 3;
export const SEBASTIAN = 4;
export const WIEBE = 5;
export const ROBBERT = 6;

export const workedExampleInput: SeasonReplayInput = {
  topValue: WORKED_EXAMPLE_TOP_VALUE,
  baselines: [
    { playerId: JOPPE, startingValue: 90 },
    { playerId: JIM, startingValue: 89 },
    { playerId: MAURICE, startingValue: 88 },
    { playerId: SEBASTIAN, startingValue: 87 },
    { playerId: WIEBE, startingValue: 86 },
    { playerId: ROBBERT, startingValue: 85 },
  ],
  rounds: [
    {
      number: 1,
      entries: [
        { kind: 'GAME', whitePlayerId: JOPPE, blackPlayerId: JIM, result: 'WHITE_WIN', isSelfArranged: false },
        { kind: 'GAME', whitePlayerId: MAURICE, blackPlayerId: SEBASTIAN, result: 'DRAW', isSelfArranged: false },
        { kind: 'GAME', whitePlayerId: WIEBE, blackPlayerId: ROBBERT, result: 'WHITE_WIN', isSelfArranged: false },
      ],
    },
    {
      number: 2,
      entries: [
        // Wiebe beats Joppe
        { kind: 'GAME', whitePlayerId: JOPPE, blackPlayerId: WIEBE, result: 'BLACK_WIN', isSelfArranged: false },
        // Maurice beats Jim
        { kind: 'GAME', whitePlayerId: MAURICE, blackPlayerId: JIM, result: 'WHITE_WIN', isSelfArranged: false },
        { kind: 'PAIRING_BYE', playerId: SEBASTIAN },
        { kind: 'REGULAR_BYE', playerId: ROBBERT },
      ],
    },
  ],
};
