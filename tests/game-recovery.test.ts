import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameService} from '../src/game/service.ts';

test('full HP skips recovery and leaves an active exploration running', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-recovery-full-'));
  const game = new GameService(join(directory, 'game.sqlite'), {now: () => 1800000000000});
  try {
    const id = game.register('rest_full', 'password123').playerId;
    const team = game.state(id).team;
    game.command(id, 'start', {kind: 'explore-start', region: 'forest', team});
    game.command(id, 'rest', {kind: 'rest'});
    const state = game.state(id);
    assert.equal(state.centerUntil, null);
    assert.equal(state.exploration.recoveryUntil, null);
    assert.equal(state.recoveryPreview.seconds, 0);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('half HP needs ten minutes and recovery keeps its original members when the preset changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-recovery-members-'));
  let now = 1800000000000;
  const game = new GameService(join(directory, 'game.sqlite'), {now: () => now});
  try {
    const id = game.register('rest_half', 'password123').playerId;
    const player = game.store.player(id);
    player.team = player.team.slice(0, 2);
    for (const partner of player.pokemon) {
      partner.maxHp = 100;
      partner.hp = 50;
    }
    game.store.savePlayer(player);
    const completesAt = now + 600000;
    game.command(id, 'rest', {kind: 'rest'});
    assert.equal(game.state(id).centerUntil, completesAt);
    now += 60000;
    game.command(id, 'repeat', {kind: 'rest'});
    assert.equal(game.state(id).centerUntil, completesAt);
    game.command(id, 'swap', {kind: 'team', team: [player.pokemon[2].id], tactic: ''});
    now = completesAt - 1;
    assert.equal(game.state(id).pokemon[0].hp, 50);
    now++;
    const state = game.state(id);
    assert.equal(state.pokemon[0].hp, 100);
    assert.equal(state.pokemon[1].hp, 100);
    assert.equal(state.pokemon[2].hp, 50, 'unrelated partners are not healed');
    assert.equal(state.centerUntil, null);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('legacy recovery freezes its fallback members on first read before a new team preset is saved', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-recovery-legacy-'));
  let now = 1800000000000;
  const game = new GameService(join(directory, 'game.sqlite'), {now: () => now});
  try {
    const id = game.register('rest_legacy', 'password123').playerId;
    const player = game.store.player(id);
    player.team = [player.pokemon[0].id];
    player.pokemon[0].hp = 1;
    player.pokemon[1].hp = 1;
    player.centerUntil = now + 600000;
    delete player.centerTeam;
    game.store.savePlayer(player);
    assert.deepEqual(game.state(id).centerTeam, player.team);
    game.command(id, 'swap', {kind: 'team', team: [player.pokemon[1].id], tactic: ''});
    now += 600000;
    const result = game.state(id);
    assert.equal(result.pokemon[0].hp, result.pokemon[0].maxHp);
    assert.equal(result.pokemon[1].hp, 1);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('exploration recovery records actual duration, resumes the route and fully fainted teams need twenty minutes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-recovery-route-'));
  let now = 1800000000000;
  const game = new GameService(join(directory, 'game.sqlite'), {now: () => now});
  try {
    const id = game.register('rest_route', 'password123').playerId;
    const player = game.store.player(id);
    player.pokemon.forEach((partner) => {
      partner.hp = 50;
      partner.maxHp = 100;
    });
    game.store.savePlayer(player);
    game.command(id, 'start', {kind: 'explore-start', region: 'forest', team: player.team});
    game.command(id, 'rest', {kind: 'rest'});
    assert.equal(game.state(id).exploration.recoveryUntil, now + 600000);
    now += 600000;
    const resumed = game.state(id);
    assert.equal(resumed.exploration.region, 'forest');
    assert.equal(resumed.exploration.recoveryUntil, null);
    assert.equal(resumed.exploration.summary.recoverySeconds, 600);
    const fainted = game.store.player(id);
    fainted.pokemon.forEach((partner) => {
      partner.hp = 0;
    });
    game.store.savePlayer(fainted);
    game.command(id, 'full-rest', {kind: 'rest'});
    assert.equal(game.state(id).exploration.recoveryUntil, now + 1200000);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});
