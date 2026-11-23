import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameService} from '../src/game/service.ts';
import {runBattle} from '../src/battle/runner.ts';

test('a real gym win replaces the seat with the submitted snapshot exactly once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-gym-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true});
  try {
    const a = game.register('challenger', 'password123').playerId;
    const b = game.register('observer', 'password123').playerId;
    game.command(a, 'prepare', {kind: 'prepare', presetId: 'default'});
    game.command(b, 'prepare', {kind: 'prepare', presetId: 'default'});
    game.command(a, 'level', {kind: 'debug', command: '/level all 100'});
    const accepted = game.command(a, 'challenge', {kind: 'gym-challenge', gym: 'gym-1'});
    assert.throws(() => game.command(b, 'busy', {kind: 'gym-challenge', gym: 'gym-1'}));
    assert.throws(() => game.command(a, 'season-busy', {kind: 'debug', command: '/season next'}));
    const record = game.battle(accepted.battleId, a);
    assert.throws(() => game.battle(accepted.battleId, b));
    const result = runBattle({...record.input, seed: [1, 2, 3, 4]});
    assert.equal(result.winnerSide, 'p1');
    game.finishGym(accepted.battleId, result);
    const money = game.state(a).inventory.money;
    game.finishGym(accepted.battleId, result);
    assert.equal(game.state(a).inventory.money, money);
    assert.equal(game.state(a).gyms[0].ownerId, a);
    const won = game.state(a).battles.find((value: any) => value.id === accepted.battleId);
    assert.equal(won.winnerSide, 'p1');
    assert.equal(won.viewerSide, 'p1');
    assert.ok(game.state(a).logs.some((entry: any) => entry.message.includes('你已接任尼比道馆馆主')));
    game.command(a, 'lower', {kind: 'debug', command: '/level all 5'});
    assert.equal(game.store.world().gyms[0].defense!.team[0].level, 100);
    const defense = game.command(b, 'counter', {kind: 'gym-challenge', gym: 'gym-1'});
    assert.equal(game.battle(defense.battleId, a).defenderId, a);
    const defenseResult = runBattle({...game.battle(defense.battleId, b).input, seed: [2, 3, 4, 5]});
    game.finishGym(defense.battleId, defenseResult);
    assert.equal(defenseResult.winnerSide, 'p2');
    assert.equal(game.state(a).gyms[0].ownerId, a);
    const lost = game.state(b).battles.find((value: any) => value.id === defense.battleId);
    assert.equal(lost.winnerSide, 'p2');
    assert.equal(lost.viewerSide, 'p1');
    assert.ok(game.state(b).logs.some((entry: any) => entry.message.includes('尼比道馆挑战结束，未取得席位')));
    assert.ok(game.state(a).logs.some((entry: any) => entry.message.includes('防守完成，继续担任馆主')));
    assert.ok(game.state(a).battles.some((battle: any) => battle.id === defense.battleId && battle.viewerSide === 'p2'));
    assert.ok(game.state(a).logs.some((entry: any) => entry.kind === 'gym-defense'));
    const stale = game.command(b, 'stale', {kind: 'gym-challenge', gym: 'gym-1'});
    const updatedWorld = game.store.world();
    updatedWorld.gyms[0].version++;
    updatedWorld.gyms[0].activeBattleId = null;
    game.store.saveWorld(updatedWorld);
    game.finishGym(stale.battleId, result);
    assert.equal(game.battle(stale.battleId, b).stale, true);
    assert.equal(game.state(a).gyms[0].ownerId, a);
    assert.ok(game.state(a).logs.at(-1)!.message.includes('失效'));
    assert.ok(game.state(b).logs.at(-1)!.message.includes('失效'));
    game.command(a, 'season', {kind: 'debug', command: '/season next'});
    assert.equal(game.state(a).gyms[0].holderKind, 'npc');
    assert.equal(game.state(a).pokemon[0].level, 5);
    assert.equal(game.state(a).inventory.money, money);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('every gym accepts both NPC templates without weakening original team validation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-gym-templates-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true});
  try {
    const id = game.register('templates', 'password123').playerId;
    game.command(id, 'prepare', {kind: 'prepare', presetId: 'default'});
    for (const seed of [1, 0x80000000]) {
      for (let seat = 1; seat <= 8; seat++) {
        const player = game.store.player(id);
        player.rng = seed;
        game.store.savePlayer(player);
        const result = game.command(id, `${seed}-${seat}`, {kind: 'gym-challenge', gym: `gym-${seat}`});
        assert.equal(game.battle(result.battleId, id).input.right.length, 6);
        game.finishGym(result.battleId, undefined, 'test cancellation');
        assert.equal(game.state(id).gyms[seat - 1].activeBattleId, null);
      }
    }
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});
