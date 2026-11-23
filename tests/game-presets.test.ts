import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameService} from '../src/game/service.ts';
import type {GameLog, Partner} from '../src/game/types.ts';

function withGame(run: (game: GameService, id: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'afk-presets-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true, now: () => 1800000000000});
  try {
    run(game, game.register('preset_player', 'password123').playerId);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
}

test('multiple saved presets stay independent of the immutable current ready roster', () =>
  withGame((game, id) => {
    const initial = game.state(id);
    const second = game.command(id, 'save-second', {
      kind: 'preset-save',
      name: '森林探索',
      team: initial.team.slice(0, 3),
      tactic: '优先集中攻击。'
    });
    assert.equal(game.state(id).presets.length, 2);
    assert.equal(game.state(id).readyPresetId, null);
    game.command(id, 'ready', {kind: 'prepare', presetId: second.presetId});
    assert.deepEqual(game.state(id).team, initial.team.slice(0, 3));
    assert.throws(() =>
      game.command(id, 'edit-ready', {
        kind: 'preset-save',
        presetId: second.presetId,
        name: '不能偷偷换队',
        team: initial.team.slice(3),
        tactic: ''
      })
    );
    assert.throws(() => game.command(id, 'delete-ready', {kind: 'preset-delete', presetId: second.presetId}));
    game.command(id, 'edit-other', {
      kind: 'preset-save',
      presetId: initial.presets[0].id,
      name: '道馆队伍',
      team: initial.team,
      tactic: '保护后反击。'
    });
    assert.equal(game.state(id).tactic, '优先集中攻击。');
    assert.throws(() => game.command(id, 'legacy-bypass', {kind: 'team', team: initial.team, tactic: ''}));
    game.command(id, 'cancel', {kind: 'cancel-ready'});
    game.command(id, 'delete', {kind: 'preset-delete', presetId: second.presetId});
    assert.equal(game.state(id).presets.length, 1);
  }));

test('a partner nickname persists separately from its species name and survives evolution', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-nicknames-'));
  const file = join(directory, 'game.sqlite');
  let game = new GameService(file, {testMode: true, now: () => 1800000000000});
  try {
    const id = game.register('nickname_player', 'password123').playerId;
    const partner = game.state(id).pokemon.find((value: Partner) => value.species === 'bulbasaur')!;
    const command = {kind: 'rename', partner: partner.id, nickname: '  小叶  '};
    game.command(id, 'name', command);
    game.command(id, 'name', command);
    let saved = game.state(id).pokemon.find((value: Partner) => value.id === partner.id)!;
    assert.equal(saved.nickname, '小叶');
    assert.equal(saved.name, '妙蛙种子');
    assert.equal(game.state(id).logs.filter((entry: GameLog) => entry.kind === 'rename').length, 1);
    game.command(id, 'level', {kind: 'debug', command: '/等级 全体 100'});
    game.command(id, 'evolve', {kind: 'evolve', partner: partner.id, target: 'ivysaur'});
    game.close();
    game = new GameService(file, {testMode: true, now: () => 1800000000000});
    saved = game.state(id).pokemon.find((value: Partner) => value.id === partner.id)!;
    assert.equal(saved.nickname, '小叶');
    assert.equal(saved.name, '妙蛙草');
    assert.equal(saved.species, 'ivysaur');
    game.command(id, 'clear', {kind: 'rename', partner: partner.id, nickname: ''});
    assert.equal(game.state(id).pokemon.find((value: Partner) => value.id === partner.id)!.nickname, undefined);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('renaming validates ownership and nickname characters without mutating another partner', () =>
  withGame((game, id) => {
    const partner = game.state(id).pokemon[0];
    const other = game.register('nickname_other', 'password123').playerId;
    for (const nickname of ['叶'.repeat(13), '名字\n换行', '名字\u0000', 123, null]) {
      assert.throws(() =>
        game.command(id, `bad-${typeof nickname}-${String(nickname).length}`, {kind: 'rename', partner: partner.id, nickname})
      );
    }
    assert.throws(() => game.command(other, 'foreign', {kind: 'rename', partner: partner.id, nickname: '别人的伙伴'}));
    assert.equal(game.state(id).pokemon[0].nickname, undefined);
    game.command(id, 'unicode', {kind: 'rename', partner: partner.id, nickname: '🌱'.repeat(12)});
    assert.equal(game.state(id).pokemon[0].nickname, '🌱'.repeat(12));
    game.command(id, 'literal', {kind: 'rename', partner: partner.id, nickname: '/heal'});
    assert.ok(game.state(id).logs.at(-1)!.message.includes('/heal'));
    assert.equal(game.state(other).pokemon[0].nickname, undefined);
  }));

test('work, breeding, management and readiness reject each other, while the ready team may explore', () =>
  withGame((game, id) => {
    const initial = game.state(id);
    const presetId = initial.presets[0].id;
    game.command(id, 'mine', {kind: 'build', facility: 'mine', workers: [initial.team[4]]});
    assert.throws(() => game.command(id, 'busy-ready', {kind: 'prepare', presetId}));
    game.command(id, 'unwork', {kind: 'workers', facility: 'mine', workers: []});
    game.command(id, 'ready', {kind: 'prepare', presetId});
    assert.throws(() => game.command(id, 'work-ready', {kind: 'workers', facility: 'mine', workers: [initial.team[0]]}));
    assert.throws(() => game.command(id, 'breed-ready', {kind: 'breed-start', parents: [initial.team[3], initial.team[5]], eggCount: 1}));
    const player = game.store.player(id);
    player.nursery.phase = 'ready';
    game.store.savePlayer(player);
    assert.throws(() => game.command(id, 'manager-ready', {kind: 'hatch-start', manager: initial.team[0]}));
    game.command(id, 'explore', {kind: 'explore-start', region: 'forest', presetId, team: []});
    assert.throws(() => game.command(id, 'gym-exploring', {kind: 'gym-challenge', gym: 'gym-1'}));
    game.command(id, 'cancel', {kind: 'cancel-ready'});
    assert.throws(() => game.command(id, 'work-exploring', {kind: 'workers', facility: 'mine', workers: [initial.team[0]]}));
    game.command(id, 'stop', {kind: 'explore-stop'});
    game.command(id, 'work', {kind: 'workers', facility: 'mine', workers: [initial.team[0]]});
    assert.throws(() => game.command(id, 'explore-worker', {kind: 'explore-start', region: 'forest', team: [initial.team[0]]}));
  }));

test('an accepted gym battle prevents cancelling readiness or starting an exploration until completion', () =>
  withGame((game, id) => {
    const initial = game.state(id);
    assert.throws(() => game.command(id, 'not-ready', {kind: 'gym-challenge', gym: 'gym-1'}));
    game.command(id, 'ready', {kind: 'prepare', presetId: initial.presets[0].id});
    const result = game.command(id, 'gym', {kind: 'gym-challenge', gym: 'gym-1'});
    assert.throws(() => game.command(id, 'cancel-early', {kind: 'cancel-ready'}));
    assert.throws(() => game.command(id, 'explore-early', {kind: 'explore-start', region: 'forest', team: initial.team}));
    game.finishGym(result.battleId, undefined, 'test interruption');
    game.command(id, 'cancel', {kind: 'cancel-ready'});
    assert.equal(game.state(id).readyPresetId, null);
  }));

test('legacy teams become a saved preset without silently reserving workers', () =>
  withGame((game, id) => {
    const player = game.store.player(id);
    delete player.presets;
    delete player.readyPresetId;
    player.tactic = '保持原战术。';
    game.store.savePlayer(player);
    const migrated = game.state(id);
    assert.deepEqual(migrated.presets[0].team, player.team);
    assert.equal(migrated.presets[0].tactic, player.tactic);
    assert.equal(migrated.readyPresetId, null);
    game.command(id, 'grant-zh', {kind: 'debug', command: '/资源 金钱 200'});
    assert.equal(game.state(id).inventory.money, 5200);
  }));
