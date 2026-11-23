import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameService} from '../src/game/service.ts';

test('accounts persist independently and duplicate commands do not mint resources', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-game-'));
  let game: GameService | undefined;
  try {
    game = new GameService(join(directory, 'game.sqlite'), {testMode: true, now: () => 1000000});
    const a = game.register('player_a', 'password123');
    const b = game.register('player_b', 'password123');
    const before = game.state(a.playerId).inventory.money;
    const command = {kind: 'debug', command: '/grant money 1000'};
    game.command(a.playerId, 'grant-once', command);
    game.command(a.playerId, 'grant-once', command);
    assert.equal(game.state(a.playerId).inventory.money, before + 1000);
    assert.equal(game.state(b.playerId).inventory.money, before);
    assert.throws(() => game!.command(a.playerId, 'grant-once', {kind: 'debug', command: '/grant money 1'}));
    game.close();
    game = new GameService(join(directory, 'game.sqlite'), {testMode: false, now: () => 1000000});
    assert.equal(game.login('player_a', 'password123').playerId, a.playerId);
    assert.equal(game.state(a.playerId).inventory.money, before + 1000);
    assert.throws(() => game!.login('player_a', 'wrongpassword'));
    assert.throws(() => game!.command(a.playerId, 'disabled', {kind: 'debug', command: '/grant money 1000'}));
  } finally {
    game?.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('test time belongs to one account and drives exploration, factories, crops and whole-box hatching', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-idle-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true, now: () => 1800000000000});
  try {
    const a = game.register('idle_a', 'password123').playerId;
    const b = game.register('idle_b', 'password123').playerId;
    const roster = game.state(a).pokemon;
    game.command(a, 'money', {kind: 'debug', command: '/grant money 100000'});
    game.command(a, 'build', {kind: 'build', facility: 'mine', workers: [roster[4].id]});
    game.command(a, 'start', {kind: 'explore-start', region: 'forest', team: roster.slice(0, 3).map((p: any) => p.id)});
    game.command(a, 'plant', {kind: 'plant', plot: 0, resource: 'oranberry'});
    game.command(a, 'parents', {kind: 'breed-start', parents: [roster[3].id, roster[5].id], eggCount: 2});
    game.command(a, 'time1', {kind: 'debug', command: '/time 1h'});
    while (game.state(a).catchingUp) {}
    game.command(a, 'hatch', {kind: 'hatch-start'});
    game.command(a, 'time2', {kind: 'debug', command: '/time 3h'});
    while (game.state(a).catchingUp) {}
    const state = game.state(a);
    assert.ok(state.inventory.ore > 0);
    assert.ok(state.exploration.summary.wins + state.exploration.summary.losses > 0);
    assert.ok(state.plots[0].buffer > 0);
    assert.equal(state.nursery.phase, 'complete');
    const count = state.pokemon.length;
    game.state(a);
    assert.equal(game.state(a).pokemon.length, count);
    assert.equal(game.state(b).clockOffset, 0);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('economy rejects invalid purchases atomically and important stock refreshes by account game time', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-economy-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true, now: () => 1800000000000});
  try {
    const id = game.register('economy_a', 'password123').playerId;
    const money = game.state(id).inventory.money;
    assert.throws(() => game.command(id, 'poor', {kind: 'buy', resource: 'leftovers', quantity: 1}));
    assert.equal(game.state(id).inventory.money, money);
    assert.throws(() => game.command(id, 'negative', {kind: 'buy', resource: 'pokeball', quantity: -5}));
    game.command(id, 'grant', {kind: 'debug', command: '/grant money 100000'});
    game.command(id, 'first', {kind: 'buy', resource: 'leftovers', quantity: 1});
    const after = game.state(id).inventory.money;
    assert.throws(() => game.command(id, 'sold-out', {kind: 'buy', resource: 'leftovers', quantity: 1}));
    assert.equal(game.state(id).inventory.money, after);
    assert.equal(game.state(id).inventory.leftovers, 1);
    game.command(id, 'hour', {kind: 'debug', command: '/time 1h'});
    game.command(id, 'second', {kind: 'buy', resource: 'leftovers', quantity: 1});
    assert.equal(game.state(id).inventory.leftovers, 2);
    game.command(id, 'canonical', {kind: 'debug', command: '/grant LightClay 2'});
    assert.equal(game.state(id).inventory.lightclay, 2);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});
