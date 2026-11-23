import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle, runBattle, chooseFromRequest, validateTeam} from '../src/battle/runner.ts';
import {playerTeam, npcTemplates, selectNpcTemplate} from '../src/battle/fixtures.ts';

test('six-member doubles retain actual levels and omit opponent team preview', () => {
  const battle = makeBattle(playerTeam, npcTemplates[0].team);
  assert.equal(battle.p1.pokemon.length, 6);
  assert.equal(battle.p2.pokemon.length, 6);
  assert.equal(battle.p1.active.length, 2);
  assert.equal(battle.p1.pokemon[0].level, 60);
  assert.equal(battle.p1.activeRequest.side.pokemon.length, 6);
  assert.ok(!JSON.stringify(battle.p1.activeRequest).includes('Venusaur'));
  assert.ok(!battle.log.some((line: string) => line.startsWith('|poke|') || line.startsWith('|teampreview')));
  assert.ok(battle.p1.activeRequest.active[0].canMegaEvo);
  assert.ok(!battle.p1.activeRequest.active[0].canTerastallize);
  assert.ok(!battle.p1.activeRequest.active[0].canDynamax);
  assert.throws(() => validateTeam(playerTeam.map((m, i) => i ? m : {...m, item: 'Firium Z'})));
});

test('Mega transforms inside the real engine and other mechanic commands are rejected', () => {
  const battle = makeBattle(playerTeam, npcTemplates[0].team);
  const invalid = battle.choose('p1', 'move 1 terastallize 1, move 1 1');
  assert.equal(invalid, false);
  assert.equal(battle.choose('p1', 'move 1 dynamax 1, move 1 1'), false);
  assert.equal(battle.choose('p1', 'move 1 zmove 1, move 1 1'), false);
  battle.makeChoices('move 1 mega, move 1 1', chooseFromRequest(battle.p2.activeRequest));
  assert.ok(battle.log.some((line: string) => line.includes('|-mega|')));
  assert.ok(!battle.log.some((line: string) => line.includes('|-terastallize|') || line.includes('|-start|Dynamax')));
});

test('zero-EV entrants are valid but illegal stats and abilities remain rejected', () => {
  assert.doesNotThrow(() => validateTeam(playerTeam));
  assert.throws(() => validateTeam(playerTeam.map((member, i) => i ? member : {...member, evs: {hp: 252, atk: 252, spe: 252}})));
  assert.throws(() => validateTeam(playerTeam.map((member, i) => i ? member : {...member, ability: 'Wonder Guard'})));
});

test('fixed agents finish a seeded battle and return only player-one protocol events', () => {
  const first = runBattle({seed: [1, 2, 3, 4], npcIndex: 0});
  const second = runBattle({seed: [1, 2, 3, 4], npcIndex: 0});
  assert.equal(first.status, 'completed');
  assert.ok(first.turns > 0);
  assert.equal(first.agentKind, 'scripted');
  assert.ok(first.events.some(line => line.startsWith('|win|') || line.startsWith('|tie|')));
  assert.deepEqual(first.events, second.events);
  assert.ok(first.decisions.length > 1);
  assert.ok(first.decisions.every(value => value.accepted));
  assert.ok(!first.events.some(line => line.startsWith('|split|') || line.startsWith('|request|')));
});

test('NPC selection clones a whole template and forced replacements do not duplicate a reserve', () => {
  assert.equal(selectNpcTemplate(0).key, npcTemplates[0].key);
  assert.equal(selectNpcTemplate(1).key, npcTemplates[1].key);
  const copy = selectNpcTemplate(0);
  copy.team[0].level = 1;
  assert.notEqual(npcTemplates[0].team[0].level, 1);
  const request = {forceSwitch: [true, true], side: {pokemon: [
    {active: true, condition: '0 fnt'}, {active: true, condition: '0 fnt'},
    {active: false, condition: '100/100'}, {active: false, condition: '100/100'}
  ]}};
  assert.equal(chooseFromRequest(request), 'switch 3, switch 4');
});
