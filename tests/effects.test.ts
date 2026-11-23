import test from 'node:test';
import assert from 'node:assert/strict';
import {EffectDefinition, deserializeEffects, createBattleDex} from '../src/battle/effects.ts';
import {Engine} from '../src/battle/engine.ts';

test('item and ability JSON deserialize through the same base and reject executable input', () => {
  const definitions = deserializeEffects([
    {kind: 'item', engineId: 'leftovers'},
    {kind: 'ability', engineId: 'hugepower'},
    {kind: 'condition', engineId: 'raindance'}
  ]);
  assert.ok(definitions.every(value => value instanceof EffectDefinition));
  assert.throws(() => createBattleDex('badalias', deserializeEffects([{kind: 'item', engineId: 'lefties'}])));
  assert.throws(() => deserializeEffects([{kind: 'item', engineId: 'leftovers', code: 'process.exit()'}]));
  assert.throws(() => deserializeEffects([{kind: ['item'], engineId: 'leftovers'}]));
  assert.throws(() => deserializeEffects([{kind: 'item', engineId: 'leftovers', handler: 'eval', parameters: {}}]));
  assert.throws(() => deserializeEffects([
    {kind: 'item', engineId: 'leftovers', handler: 'residual-heal', parameters: {numerator: 1, denominator: 0}}
  ]));
});

test('a JSON healing patch affects real residual healing without changing another revision', () => {
  const boosted = createBattleDex('testheal', deserializeEffects([
    {kind: 'item', engineId: 'leftovers', handler: 'residual-heal', parameters: {numerator: 1, denominator: 8}}
  ]));
  const original = createBattleDex('testoriginal', []);
  function heal(mod: string) {
    const format = new Engine.Format({id: mod, name: mod, mod, gameType: 'singles', ruleset: []});
    const battle = new Engine.Battle({format});
    battle.setPlayer('p1', {team: [{species: 'Snorlax', moves: ['splash'], item: 'Leftovers'}]});
    battle.setPlayer('p2', {team: [{species: 'Snorlax', moves: ['splash']}]});
    const pokemon = battle.p1.active[0];
    pokemon.hp = 1;
    battle.makeChoices('move 1', 'move 1');
    return {gain: pokemon.hp - 1, max: pokemon.maxhp};
  }
  const a = heal(boosted);
  const b = heal(original);
  assert.equal(a.gain, Math.floor(a.max / 8));
  assert.equal(b.gain, Math.floor(b.max / 16));
});

test('a JSON ability parameter changes effective attack rather than permanent base stats', () => {
  const mod = createBattleDex('testability', deserializeEffects([
    {kind: 'ability', engineId: 'hugepower', handler: 'attack-multiplier', parameters: {numerator: 3, denominator: 2}}
  ]));
  const format = new Engine.Format({id: mod, name: mod, mod, gameType: 'singles', ruleset: []});
  const battle = new Engine.Battle({format});
  battle.setPlayer('p1', {team: [{species: 'Azumarill', ability: 'Huge Power', moves: ['splash']}]});
  battle.setPlayer('p2', {team: [{species: 'Snorlax', moves: ['splash']}]});
  const pokemon = battle.p1.active[0];
  assert.equal(pokemon.getStat('atk'), Math.floor(pokemon.storedStats.atk * 1.5));
  assert.equal(pokemon.storedStats.atk, pokemon.baseStoredStats.atk);
});
