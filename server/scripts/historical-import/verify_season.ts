import { readFileSync } from 'node:fs';
import { replaySeason } from '../../src/engine/standings.js';
import type { RoundInput, PlayerBaseline } from '../../src/engine/types.js';

const engineInputPath = process.argv[2];
const standingsPath = process.argv[3];

const engineInput = JSON.parse(readFileSync(engineInputPath, 'utf8'));
const standingsGT = JSON.parse(readFileSync(standingsPath, 'utf8'));

const idToName: Record<string, string> = engineInput.idToName;
const nameToId = new Map<string, number>();
for (const [id, name] of Object.entries(idToName)) {
  nameToId.set((name as string).toLowerCase(), Number(id));
}

const baselines: PlayerBaseline[] = engineInput.baselines;
const rounds: RoundInput[] = engineInput.rounds;
const topValue: number = engineInput.topValue;

const result = replaySeason({ topValue, baselines, rounds });
const computedById = new Map(result.current.standings.map((s) => [s.playerId, s]));

let exactValue = 0;
let mismatches: Array<{
  name: string;
  gtValue: number | null;
  compValue: number | null;
  gtPlayed: number | null;
  compPlayed: number | null;
  gtWin: number | null;
  compWin: number | null;
}> = [];

for (const row of standingsGT.rows) {
  const id = nameToId.get(String(row.name).toLowerCase());
  const comp = id != null ? computedById.get(id) : undefined;
  const gtValue = row.value ?? null;
  const compValue = comp ? comp.value : null;
  const close = gtValue != null && compValue != null && Math.abs(gtValue - compValue) < 1e-6;
  if (close) exactValue++;
  if (!close) {
    mismatches.push({
      name: row.name,
      gtValue,
      compValue,
      gtPlayed: row.played ?? null,
      compPlayed: comp ? comp.played : null,
      gtWin: row.win ?? null,
      compWin: comp ? comp.wins : null,
    });
  }
}

console.log(`season ${engineInput.season}: ${exactValue}/${standingsGT.rows.length} players' Value matches ground truth exactly`);
if (mismatches.length > 0) {
  console.log(`  ${mismatches.length} mismatches (showing up to 15):`);
  for (const m of mismatches.slice(0, 15)) {
    console.log(
      `    ${m.name}: GT value=${m.gtValue} played=${m.gtPlayed} win=${m.gtWin}  |  computed value=${m.compValue} played=${m.compPlayed} win=${m.compWin}`,
    );
  }
}
