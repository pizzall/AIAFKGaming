import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameClock} from '../src/game/clock.ts';
import {GameService} from '../src/game/service.ts';
import {gameConfig} from '../src/game/catalog.ts';

test('one game clock checkpoints speed changes without retroactive jumps and preserves legacy offsets', () => {
  let real = 1800000000000;
  const clock = new GameClock(() => real);
  const player = {clockOffset: 3600000};
  const start = clock.now(player);
  clock.setRate(player, 2);
  assert.equal(clock.now(player), start);
  real += 10000;
  assert.equal(clock.now(player), start + 20000);
  clock.setRate(player, 1000);
  assert.equal(clock.now(player), start + 20000);
  real += 1000;
  assert.equal(clock.now(player), start + 1020000);
  clock.advance(player, 60000);
  assert.equal(clock.now(player), start + 1080000);
  assert.equal(clock.read(player).rate, 1000);
  clock.setRate(player, 1);
  real += 1000;
  assert.equal(clock.now(player), start + 1081000);
  const snapshot = {...player};
  for (const rate of [0, -1, 1001, 1.5, NaN, Infinity]) assert.throws(() => clock.setRate(player, rate));
  assert.deepEqual(player, snapshot);
});

test('two times speed drives exploration, factories, fruit and both nursery phases through the same timeline', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-clock-modules-'));
  let fastReal = 1800000000000,
    normalReal = fastReal;
  const fast = new GameService(join(directory, 'fast.sqlite'), {testMode: true, now: () => fastReal});
  const normal = new GameService(join(directory, 'normal.sqlite'), {testMode: true, now: () => normalReal});
  try {
    const id = fast.register('clock_modules', 'password123').playerId;
    const team = fast.state(id).team;
    fast.command(id, 'mine', {kind: 'build', facility: 'mine', workers: [team[4]]});
    fast.command(id, 'explore', {kind: 'explore-start', region: 'forest', team: team.slice(0, 3)});
    fast.command(id, 'plant', {kind: 'plant', plot: 0, resource: 'oranberry'});
    fast.command(id, 'parents', {kind: 'breed-start', parents: [team[3], team[5]], eggCount: 2});
    normal.store.savePlayer(structuredClone(fast.store.player(id)));
    fast.command(id, 'speed', {kind: 'test-speed', speed: 2});
    const claim = (game: GameService) => {
      while (game.state(id).catchingUp) {}
      return game.store.player(id);
    };
    fastReal += 1800000;
    normalReal += 3600000;
    assert.equal(claim(fast).nursery.phase, 'ready');
    assert.equal(claim(normal).nursery.phase, 'ready');
    fast.command(id, 'hatch', {kind: 'hatch-start'});
    normal.command(id, 'hatch', {kind: 'hatch-start'});
    fastReal += 1800000;
    normalReal += 3600000;
    const a = claim(fast),
      b = claim(normal);
    for (const key of ['inventory', 'pokemon', 'exploration', 'facilities', 'plots', 'nursery', 'rng', 'serial'] as const) {
      assert.deepEqual(a[key], b[key], key);
    }
    assert.equal(a.nursery.phase, 'complete');
    assert.ok(a.inventory.ore > 0 && a.plots[0].buffer > 0);
  } finally {
    fast.close();
    normal.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('half-HP recovery takes five real minutes at two times speed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-clock-recovery-'));
  let real = 1800000000000;
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true, now: () => real});
  try {
    const id = game.register('clock_recovery', 'password123').playerId;
    const player = game.store.player(id);
    player.team = [player.team[0]];
    player.pokemon[0].hp = 50;
    player.pokemon[0].maxHp = 100;
    game.store.savePlayer(player);
    game.command(id, 'speed', {kind: 'test-speed', speed: 2});
    game.command(id, 'rest', {kind: 'rest'});
    assert.equal(game.state(id).recoveryPreview.realSeconds, 300);
    real += 299999;
    assert.equal(game.state(id).pokemon[0].hp, 50);
    real++;
    assert.equal(game.state(id).pokemon[0].hp, 100);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('speed is per-account and persistent, manual jumps keep the rate, sessions use real time and normal startup restores one', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-clock-persist-'));
  let real = 1800000000000;
  const start = real,
    file = join(directory, 'game.sqlite');
  let game = new GameService(file, {testMode: true, now: () => real});
  try {
    const a = game.register('clock_a', 'password123'),
      b = game.register('clock_b', 'password123');
    const expires = (game.store.db.prepare('SELECT expires FROM sessions WHERE player_id=?').get(a.playerId) as any).expires;
    game.command(a.playerId, 'speed', {kind: 'test-speed', speed: 1000});
    real += 1000;
    assert.equal(game.state(a.playerId).serverTime, start + 1000000);
    assert.equal(game.state(b.playerId).serverTime, start + 1000);
    game.command(a.playerId, 'jump', {kind: 'debug', command: '/加速 1小时'});
    assert.equal(game.state(a.playerId).serverTime, start + 4600000);
    assert.equal(game.state(a.playerId).clock.rate, 1000);
    assert.equal(game.session(a.token), a.playerId);
    assert.equal((game.store.db.prepare('SELECT expires FROM sessions WHERE player_id=?').get(a.playerId) as any).expires, expires);
    game.close();
    real += 2000;
    game = new GameService(file, {testMode: true, now: () => real});
    assert.equal(game.state(a.playerId).serverTime, start + 6600000);
    assert.equal(game.state(a.playerId).clock.rate, 1000);
    game.close();
    real += 1000;
    game = new GameService(file, {testMode: false, now: () => real});
    real += 60000;
    assert.equal(game.state(a.playerId).clock.rate, 1);
    assert.equal(game.state(a.playerId).serverTime, start + 7660000);
    assert.throws(() => game.command(a.playerId, 'forbidden', {kind: 'test-speed', speed: 2}));
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('returning to one times speed remains available during a long exploration catch-up', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-clock-catchup-'));
  let real = 1800000000000;
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true, now: () => real});
  const batch = gameConfig.settlementBatch;
  try {
    gameConfig.settlementBatch = 1;
    const id = game.register('clock_catchup', 'password123').playerId;
    game.command(id, 'start', {kind: 'explore-start', region: 'forest', team: game.state(id).team});
    game.command(id, 'fast', {kind: 'test-speed', speed: 1000});
    real += 3600000;
    const before = game.state(id);
    assert.equal(before.catchingUp, true);
    game.command(id, 'normal', {kind: 'test-speed', speed: 1});
    const after = game.state(id);
    assert.equal(after.clock.rate, 1);
    assert.equal(after.serverTime, before.serverTime);
    assert.equal(after.catchingUp, true);
    assert.ok(after.exploration.cursor >= before.exploration.cursor);
  } finally {
    gameConfig.settlementBatch = batch;
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});
