import {writeFileSync} from 'node:fs';
import {Engine, engineRevision} from '../src/battle/engine.ts';

const dex = Engine.Dex.mod('gen9');
const entries: Array<{kind: string; engineId: string}> = [];
for (const item of dex.items.all()) if (item.exists) entries.push({kind: 'item', engineId: item.id});
for (const ability of dex.abilities.all()) if (ability.exists) entries.push({kind: 'ability', engineId: ability.id});
const conditionIds = new Set<string>(Object.keys(dex.data.Conditions));
for (const move of dex.moves.all()) if (move.condition) conditionIds.add(move.id);
for (const engineId of conditionIds) {
  if (dex.conditions.get(engineId).exists) entries.push({kind: 'condition', engineId});
}
entries.sort((a, b) => `${a.kind}:${a.engineId}`.localeCompare(`${b.kind}:${b.engineId}`, 'en'));
const data = {engineRevision, mechanicsMod: 'gen9', technicalCatalogOnly: true, effects: entries};
writeFileSync(new URL('../config/effect-catalog.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log(`Exported ${entries.length} resolved effects; availability is not an opening-content decision.`);
