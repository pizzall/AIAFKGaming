import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {createAppServer} from '../src/server.ts';

test('authenticated game routes isolate accounts, run gyms and protect test controls', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-http-'));
  const server = createAppServer({dataDirectory: directory, testMode: true});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function register(username: string) {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password: 'password123'})
    });
    assert.equal(response.status, 201);
    return response.headers.getSetCookie()[0].split(';')[0];
  }
  async function command(cookie: string, input: any) {
    return fetch(`${base}/api/game/command`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Cookie: cookie},
      body: JSON.stringify({commandId: randomUUID(), ...input})
    });
  }
  try {
    assert.deepEqual(await (await fetch(`${base}/api/auth/session`)).json(), {authenticated: false});
    assert.equal((await fetch(`${base}/api/game/state`)).status, 401);
    assert.equal((await fetch(`${base}/api/game/catalog`)).status, 401);
    const a = await register('http_a');
    const b = await register('http_b');
    const catalog = (await (await fetch(`${base}/api/game/catalog`, {headers: {Cookie: a}})).json()) as any;
    assert.equal(catalog.species.length, 1025);
    assert.equal(catalog.names.abilities.overgrow, '茂盛');
    assert.equal(catalog.moves.protect.priority, 4);
    assert.equal(catalog.machines.length, 229);
    const first = ((await (await fetch(`${base}/api/game/state`, {headers: {Cookie: a}})).json()) as any).pokemon[0];
    assert.equal((await command(a, {kind: 'rename', partner: first.id, nickname: '小伙伴'})).status, 200);
    assert.equal((await command(b, {kind: 'rename', partner: first.id, nickname: '别人'})).status, 400);
    assert.equal(((await (await fetch(`${base}/api/game/state`, {headers: {Cookie: a}})).json()) as any).pokemon[0].nickname, '小伙伴');
    assert.equal((await command(a, {kind: 'debug', command: '/资源 技能机007 1'})).status, 200);
    assert.equal((await command(a, {kind: 'item-use', resource: 'tm9_007', partner: first.id})).status, 200);
    const learned = (await (await fetch(`${base}/api/game/state`, {headers: {Cookie: a}})).json()) as any;
    assert.equal(learned.inventory.tm9_007, 0);
    assert.ok(learned.pokemon[0].learnedMoves.includes('Protect'));
    assert.equal((await command(a, {kind: 'test-speed', speed: 2})).status, 200);
    assert.equal(((await (await fetch(`${base}/api/game/state`, {headers: {Cookie: a}})).json()) as any).clock.rate, 2);
    assert.equal(((await (await fetch(`${base}/api/game/state`, {headers: {Cookie: b}})).json()) as any).clock.rate, 1);
    assert.equal((await command(a, {kind: 'test-speed', speed: 1001})).status, 400);
    assert.equal((await command(a, {kind: 'test-speed', speed: 1})).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/auth/session`, {headers: {Cookie: a}})).json(), {authenticated: true});
    assert.equal((await command(a, {kind: 'debug', command: '/level all 100'})).status, 200);
    assert.equal((await command(a, {kind: 'prepare', presetId: 'default'})).status, 200);
    const accepted = (await (await command(a, {kind: 'gym-challenge', gym: 'gym-1'})).json()) as any;
    assert.ok(accepted.battleId);
    assert.equal((await fetch(`${base}/api/battles/${accepted.battleId}`)).status, 404);
    assert.equal((await fetch(`${base}/api/game/battles/${accepted.battleId}`, {headers: {Cookie: b}})).status, 403);
    let battle: any;
    for (let i = 0; i < 100; i++) {
      battle = await (await fetch(`${base}/api/game/battles/${accepted.battleId}`, {headers: {Cookie: a}})).json();
      if (['completed', 'error'].includes(battle.status)) break;
      await pause(100);
    }
    assert.equal(battle.status, 'completed', battle.error);
    assert.equal(battle.winnerSide, 'p1');
    assert.ok(!JSON.stringify(battle).includes('privateSnapshot'));
    assert.ok(!JSON.stringify(battle).includes('npcTactic'));
    const state = (await (await fetch(`${base}/api/game/state`, {headers: {Cookie: a}})).json()) as any;
    assert.equal(state.gyms[0].ownerId, state.id);
    assert.equal(state.battles.find((entry: any) => entry.id === accepted.battleId).winnerSide, battle.winnerSide);
    assert.equal(state.rng, undefined);
    assert.equal(state.gyms[0].defense, undefined);
    const csrf = await fetch(`${base}/api/game/command`, {
      method: 'POST',
      headers: {Cookie: a, Origin: 'https://unrelated.invalid', 'Content-Type': 'application/json'},
      body: '{}'
    });
    assert.equal(csrf.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, {recursive: true, force: true});
  }
});
