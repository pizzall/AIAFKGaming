import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameService} from '../src/game/service.ts';
import {advancePlayer} from '../src/game/idle.ts';
import {dex, gameConfig, refreshPartner, experienceAt, makePartner} from '../src/game/catalog.ts';

test('one long offline period and multiple claims preserve RNG, captures, losses and experience', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-equivalent-'));
  const start = 1800000000000;
  const game = new GameService(join(directory, 'game.sqlite'), {now: () => start});
  try {
    const id = game.register('equivalence', 'password123').playerId;
    const base = game.store.player(id);
    base.exploration = {
      region: 'forest',
      team: base.team,
      cursor: start,
      startedAt: start,
      recoveryUntil: null,
      supplies: [
        {resource: 'pokeball', quantity: 30},
        {resource: 'potion', quantity: 10}
      ],
      summary: {wins: 0, losses: 0, captures: 0, xp: 0, recoverySeconds: 0}
    };
    base.inventory.pokeball -= 30;
    base.inventory.potion -= 10;
    base.wishlist = ['bulbasaur', 'caterpie', 'pidgey', 'pikachu', 'hoothoot'];
    const whole = structuredClone(base);
    const chunks = structuredClone(base);
    do {
      advancePlayer(whole, start + 6 * 3600000);
    } while (whole.catchingUp);
    for (let hour = 1; hour <= 6; hour++) {
      do {
        advancePlayer(chunks, start + hour * 3600000);
      } while (chunks.catchingUp);
    }
    assert.deepEqual(whole, chunks);
    const broken = structuredClone(base);
    broken.pokemon.forEach((partner) => {
      partner.hp = 0;
    });
    const limit = gameConfig.settlementBatch;
    gameConfig.settlementBatch = 1;
    try {
      advancePlayer(broken, start + 3 * 3600000);
      assert.equal(broken.catchingUp, true, 'a recovery that already ended must not hide remaining offline time');
    } finally {
      gameConfig.settlementBatch = limit;
    }
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('exploration retains HP and consumed items but resets PP and status for every encounter', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-items-'));
  const start = 1800000000000;
  const game = new GameService(join(directory, 'game.sqlite'), {now: () => start});
  try {
    const id = game.register('consumables', 'password123').playerId;
    const base = game.store.player(id);
    const partner = base.pokemon[0];
    partner.exp = experienceAt(partner.species, 100);
    refreshPartner(partner);
    base.inventory.potion = 0;
    base.wishlist = [];
    base.rng = 4096;
    base.exploration = {
      region: 'forest',
      team: [partner.id],
      cursor: start,
      startedAt: start,
      recoveryUntil: null,
      summary: {wins: 0, losses: 0, captures: 0, xp: 0, recoverySeconds: 0}
    };
    const berry = structuredClone(base);
    berry.pokemon[0].heldItem = 'oranberry';
    berry.pokemon[0].hp = 1;
    advancePlayer(berry, start + 120000);
    assert.equal(berry.pokemon[0].heldItem, '', 'consumed held items must leave the persistent individual');
    const exhausted = structuredClone(base);
    exhausted.pokemon[0].moves = ['Tackle'];
    exhausted.pokemon[0].pp.Tackle = 0;
    exhausted.pokemon[0].status = 'slp';
    const fresh = structuredClone(exhausted);
    fresh.pokemon[0].status = '';
    fresh.pokemon[0].pp.Tackle = dex.moves.get('Tackle').pp;
    advancePlayer(exhausted, start + 120000);
    advancePlayer(fresh, start + 120000);
    assert.equal(exhausted.pokemon[0].hp, fresh.pokemon[0].hp, 'old PP and status cannot affect exploration outcomes');
    assert.equal(exhausted.pokemon[0].pp.Tackle, dex.moves.get('Tackle').pp);
    assert.equal(exhausted.pokemon[0].status, '');
    const explosive = structuredClone(base);
    const voltorb = makePartner(explosive, 'voltorb', 100, 'test');
    voltorb.moves = ['Self-Destruct'];
    explosive.pokemon = [voltorb];
    explosive.exploration!.team = [voltorb.id];
    explosive.rng = 4096;
    advancePlayer(explosive, start + 120000);
    assert.equal(explosive.pokemon[0].hp, 0, 'self-sacrifice moves must execute their original costs');
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});
