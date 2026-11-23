import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameService} from '../src/game/service.ts';
import {experienceAt, gameConfig, refreshPartner} from '../src/game/catalog.ts';

function withGame(run: (game: GameService, id: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'afk-inventory-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true, now: () => 1800000000000});
  try {
    run(game, game.register('warehouse', 'password123').playerId);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
}

test('packing enforces six slots, 99 per stack and aggregate warehouse stock atomically, then returns supplies once', () =>
  withGame((game, id) => {
    game.command(id, 'stock', {kind: 'debug', command: '/资源 精灵球 500'});
    const initial = game.state(id),
      team = initial.team.slice(0, 1);
    const invalid = [
      Array.from({length: 7}, () => ({resource: 'pokeball', quantity: 1})),
      [{resource: 'pokeball', quantity: 100}],
      [{resource: 'pokeball', quantity: 0}],
      [{resource: 'pokeball', quantity: 1.5}],
      [{resource: 'money', quantity: 1}],
      [{resource: ['pokeball'], quantity: 1}],
      [
        {resource: 'potion', quantity: 6},
        {resource: 'potion', quantity: 6}
      ]
    ];
    for (const [index, supplies] of invalid.entries()) {
      assert.throws(() => game.command(id, `bad-${index}`, {kind: 'explore-start', region: 'forest', team, supplies}));
      assert.equal(game.state(id).exploration, null);
      assert.deepEqual(game.state(id).inventory, initial.inventory);
    }
    const input = {
      kind: 'explore-start',
      region: 'forest',
      team,
      supplies: [
        {resource: 'pokeball', quantity: 99},
        {resource: 'pokeball', quantity: 99},
        {resource: 'potion', quantity: 10}
      ]
    };
    game.command(id, 'pack', input);
    game.command(id, 'pack', input);
    const packed = game.state(id);
    assert.equal(packed.inventory.pokeball, initial.inventory.pokeball - 198);
    assert.equal(packed.inventory.potion, 0);
    assert.equal(packed.exploration.supplies.length, 6);
    game.state(id);
    game.state(id);
    game.command(id, 'unrelated', {kind: 'wishlist', species: []});
    assert.deepEqual(game.state(id).ledger, packed.ledger, 'unchanged packed stock cannot mint ledger gains on refresh');
    assert.equal(packed.ledger.filter((entry: any) => entry.reason === '开始探索').length, 0, 'location transfers are not consumption');
    assert.throws(() => game.command(id, 'repack', input));
    game.command(id, 'return', {kind: 'explore-stop'});
    game.command(id, 'return', {kind: 'explore-stop'});
    assert.deepEqual(game.state(id).inventory, initial.inventory);
    assert.equal(game.state(id).exploration, null);
  }));

test('exploration spends only packed balls and keeps exploring after the bag empties despite a stocked warehouse', () =>
  withGame((game, id) => {
    game.command(id, 'level', {kind: 'debug', command: '/等级 全体 100'});
    game.command(id, 'ultra', {kind: 'debug', command: '/资源 高级球 100'});
    game.command(id, 'wish', {kind: 'wishlist', species: ['bulbasaur', 'caterpie', 'pidgey', 'pikachu', 'hoothoot']});
    const before = game.state(id);
    game.command(id, 'start', {
      kind: 'explore-start',
      region: 'forest',
      team: before.team.slice(0, 1),
      supplies: [{resource: 'pokeball', quantity: 2}]
    });
    game.command(id, 'time', {kind: 'debug', command: '/加速 20分钟'});
    let after = game.state(id);
    while (after.catchingUp) after = game.state(id);
    assert.equal(after.inventory.ultraball, 100);
    assert.equal(after.inventory.pokeball, before.inventory.pokeball - 2);
    assert.equal(after.exploration.supplies.filter(Boolean).length, 0);
    assert.ok(after.exploration.summary.wins > 2);
    assert.equal(
      after.ledger
        .filter((entry: any) => entry.reason === '挂机结算')
        .reduce((sum: number, entry: any) => sum + (entry.deltas.pokeball ?? 0), 0),
      -2
    );
  }));

test('legacy explorations get an empty bag and cannot silently consume warehouse medicine or balls', () =>
  withGame((game, id) => {
    const player = game.store.player(id),
      p = player.pokemon[0],
      start = 1800000000000;
    p.exp = experienceAt(p.species, 100);
    refreshPartner(p);
    p.hp = 20;
    player.wishlist = ['bulbasaur', 'caterpie', 'pidgey', 'pikachu', 'hoothoot'];
    player.exploration = {
      region: 'forest',
      team: [p.id],
      cursor: start - 120000,
      startedAt: start - 120000,
      recoveryUntil: null,
      summary: {wins: 0, losses: 0, captures: 0, xp: 0, recoverySeconds: 0}
    };
    game.store.savePlayer(player);
    const state = game.state(id);
    assert.equal(state.inventory.potion, 10);
    assert.equal(state.inventory.pokeball, 30);
    assert.equal(state.exploration.supplies.filter(Boolean).length, 0);
    assert.equal(state.exploration.summary.captures, 0);
  }));

test('packed medicine is consumed and the best packed ball is preferred over lower tiers', () =>
  withGame((game, id) => {
    game.command(id, 'level', {kind: 'debug', command: '/等级 全体 100'});
    game.command(id, 'ultra', {kind: 'debug', command: '/资源 高级球 5'});
    game.command(id, 'great', {kind: 'debug', command: '/资源 超级球 5'});
    const p = game.store.player(id);
    p.pokemon[0].hp = 20;
    game.store.savePlayer(p);
    game.command(id, 'wish', {kind: 'wishlist', species: ['bulbasaur', 'caterpie', 'pidgey', 'pikachu', 'hoothoot']});
    game.command(id, 'start', {
      kind: 'explore-start',
      region: 'forest',
      team: [p.pokemon[0].id],
      supplies: [
        {resource: 'ultraball', quantity: 1},
        {resource: 'greatball', quantity: 1},
        {resource: 'pokeball', quantity: 1},
        {resource: 'potion', quantity: 1}
      ]
    });
    game.command(id, 'time', {kind: 'debug', command: '/加速 2分钟'});
    const result = game.state(id);
    assert.equal(result.exploration.supplies[0], null);
    assert.equal(result.exploration.supplies[1].quantity, 1);
    assert.equal(result.exploration.supplies[2].quantity, 1);
    assert.equal(result.exploration.supplies[3], null);
    assert.equal(result.inventory.potion, 9);
    assert.ok(result.pokemon[0].hp > 20);
  }));

test('wild drops go directly to the warehouse even when all six exploration slots are full', () =>
  withGame((game, id) => {
    const dropRate = gameConfig.extraItemDropRate;
    try {
      gameConfig.extraItemDropRate = 1;
      game.command(id, 'level', {kind: 'debug', command: '/等级 全体 100'});
      game.command(id, 'no-capture', {kind: 'wishlist', species: []});
      game.command(id, 'balls', {kind: 'debug', command: '/资源 精灵球 1000'});
      game.command(id, 'start', {
        kind: 'explore-start',
        region: 'forest',
        team: game.state(id).team.slice(0, 1),
        supplies: Array.from({length: 6}, () => ({resource: 'pokeball', quantity: 99}))
      });
      game.command(id, 'time', {kind: 'debug', command: '/加速 2分钟'});
      const result = game.state(id);
      assert.equal(result.inventory.sitrusberry, 1);
      assert.equal(result.exploration.supplies.filter(Boolean).length, 6);
      assert.equal(
        result.exploration.supplies.reduce((sum: number, slot: any) => sum + slot.quantity, 0),
        594
      );
    } finally {
      gameConfig.extraItemDropRate = dropRate;
    }
  }));

test('packed supplies persist across service restart without being debited a second time', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-pack-persist-'));
  const path = join(directory, 'game.sqlite');
  let game = new GameService(path, {now: () => 1800000000000});
  try {
    const id = game.register('packed', 'password123').playerId;
    game.command(id, 'start', {
      kind: 'explore-start',
      region: 'forest',
      team: game.state(id).team,
      supplies: [{resource: 'pokeball', quantity: 30}]
    });
    game.close();
    game = new GameService(path, {now: () => 1800000000000});
    assert.equal(game.state(id).inventory.pokeball, 0);
    assert.equal(game.state(id).exploration.supplies[0].quantity, 30);
    game.command(id, 'return', {kind: 'explore-stop'});
    assert.equal(game.state(id).inventory.pokeball, 30);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('Gen9 machines consume one compatible copy, reject invalid recipients and never overwrite equipped moves', () =>
  withGame((game, id) => {
    const before = game.state(id),
      bulbasaur = before.pokemon[0],
      charmander = before.pokemon[1];
    game.command(id, 'tm', {kind: 'debug', command: '/资源 技能机125 2'});
    assert.throws(() => game.command(id, 'incompatible', {kind: 'item-use', resource: 'tm9_125', partner: bulbasaur.id}));
    assert.equal(game.state(id).inventory.tm9_125, 2);
    const other = game.register('foreign', 'password123').playerId;
    assert.throws(() => game.command(other, 'foreign', {kind: 'item-use', resource: 'tm9_125', partner: charmander.id}));
    const input = {kind: 'item-use', resource: 'tm9_125', partner: charmander.id};
    game.command(id, 'learn', input);
    game.command(id, 'learn', input);
    const learned = game.state(id).pokemon[1];
    assert.ok(learned.learnedMoves.includes('Flamethrower'));
    assert.deepEqual(learned.moves, charmander.moves);
    assert.equal(game.state(id).inventory.tm9_125, 1);
    assert.throws(() => game.command(id, 'already-known', input));
    assert.equal(game.state(id).inventory.tm9_125, 1);
    game.command(id, 'protect', {kind: 'debug', command: '/资源 技能机007 1'});
    game.command(id, 'job', {kind: 'build', facility: 'mine', workers: [charmander.id]});
    assert.throws(() => game.command(id, 'working', {kind: 'item-use', resource: 'tm9_007', partner: charmander.id}));
    assert.equal(game.state(id).inventory.tm9_007, 1);
    assert.ok(!game.state(id).pokemon[1].learnedMoves.includes('Protect'));
  }));

test('warehouse healing rejects full HP, fainted and occupied partners, and exploration blocks remote equipment', () =>
  withGame((game, id) => {
    const p = game.store.player(id),
      partner = p.pokemon[0];
    partner.hp = 1;
    game.store.savePlayer(p);
    game.command(id, 'heal', {kind: 'item-use', resource: 'potion', partner: partner.id});
    assert.equal(game.state(id).pokemon[0].hp, partner.maxHp);
    assert.equal(game.state(id).inventory.potion, 9);
    assert.throws(() => game.command(id, 'full', {kind: 'item-use', resource: 'potion', partner: partner.id}));
    assert.equal(game.state(id).inventory.potion, 9);
    game.command(id, 'held', {kind: 'debug', command: '/资源 吃剩的东西 1'});
    game.command(id, 'start', {kind: 'explore-start', region: 'forest', team: [partner.id], supplies: []});
    assert.throws(() => game.command(id, 'remote-heal', {kind: 'item-use', resource: 'potion', partner: partner.id}));
    assert.throws(() => game.command(id, 'remote-equip', {kind: 'equip', resource: 'leftovers', partner: partner.id}));
    assert.equal(game.state(id).inventory.leftovers, 1);
    game.command(id, 'stop', {kind: 'explore-stop'});
    const down = game.store.player(id);
    down.pokemon[0].hp = 0;
    game.store.savePlayer(down);
    assert.throws(() => game.command(id, 'fainted', {kind: 'item-use', resource: 'potion', partner: partner.id}));
    assert.equal(game.state(id).inventory.potion, 9);
  }));

test('public move details match Gen9 numeric data and machines retain their version-specific identity', () =>
  withGame((game) => {
    const catalog = game.catalog();
    assert.equal(catalog.moves.tackle.power, 40);
    assert.equal(catalog.moves.tackle.accuracy, 100);
    assert.equal(catalog.moves.tackle.pp, 35);
    assert.equal(catalog.moves.tackle.category, '物理');
    assert.equal(catalog.moves.protect.power, null);
    assert.equal(catalog.moves.protect.accuracy, null);
    assert.equal(catalog.moves.protect.priority, 4);
    assert.equal(catalog.moves.flamethrower.power, 90);
    assert.equal(catalog.machines.length, 229);
    assert.equal(catalog.machines.find((m) => m.number === 7)!.move, 'protect');
    assert.equal(catalog.machines.find((m) => m.number === 125)!.move, 'flamethrower');
  }));
