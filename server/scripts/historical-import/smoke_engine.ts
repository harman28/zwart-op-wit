import { replaySeason } from '../../src/engine/standings.js';

const result = replaySeason({
  topValue: 3,
  baselines: [
    { playerId: 1, startingValue: 3 },
    { playerId: 2, startingValue: 2 },
    { playerId: 3, startingValue: 1 },
  ],
  rounds: [
    { number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'BLACK_WIN', isSelfArranged: false }, { kind: 'PAIRING_BYE', playerId: 3 }] },
  ],
});
console.log(JSON.stringify(result.current.standings, null, 2));
