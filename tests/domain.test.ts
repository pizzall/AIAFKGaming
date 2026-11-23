import test from 'node:test';
import assert from 'node:assert/strict';
import {settleActivity} from '../src/domain/activity.ts';
import {createDefenseSnapshot, resetGymSeason} from '../src/domain/gym.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';

test('activity completion uses server time and reports a reward once without a timer', () => {
  const input = {id: 'egg-batch', completeAt: 2000, status: 'pending' as const, result: {eggs: 5}};
  assert.throws(() => settleActivity(input, 1999), /NOT_READY/);
  const first = settleActivity(input, 2000);
  assert.equal(first.newlyCompleted, true);
  assert.equal(first.activity.settledAt, 2000);
  const second = settleActivity(first.activity, 3000);
  assert.equal(second.newlyCompleted, false);
  assert.equal(second.activity.settledAt, 2000);
  assert.equal(input.status, 'pending');
});

test('gym defense retains the exact winning roster and tactic after the live team changes', () => {
  const team = structuredClone(playerTeam);
  const defense = createDefenseSnapshot('player:leaf', team, '集中攻击');
  team[0].level = 100;
  team[0].moves[0] = 'Splash';
  assert.equal(defense.team[0].level, 60);
  assert.equal(defense.team[0].moves[0], 'Heat Wave');
  assert.equal(defense.tactic, '集中攻击');
  assert.throws(() => { defense.team[0].level = 1; });
});

test('a season replacement changes gym seats while preserving other player and economy data', () => {
  const old = createDefenseSnapshot('player:leaf', playerTeam, '进攻');
  const npc = createDefenseSnapshot('npc:gardener', npcTemplates[0].team, npcTemplates[0].tactic);
  const world = {gymSeats: [{gymKey: 'stone', defense: old}], money: 1234, pokemon: ['partner'], passXp: 40};
  const next = resetGymSeason(world, [npc]);
  assert.equal(next.gymSeats[0].defense.ownerKey, 'npc:gardener');
  assert.equal(next.money, 1234);
  assert.deepEqual(next.pokemon, ['partner']);
  assert.equal(next.passXp, 40);
  assert.equal(world.gymSeats[0].defense.ownerKey, 'player:leaf');
});
