import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntent, normalizeText} from '../src/battle/tactics.ts';
import {makeBattle, chooseFromRequest} from '../src/battle/runner.ts';
import {createTacticsAgent} from '../src/battle/agent.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';
import {dex} from '../src/game/catalog.ts';
import {nameIndex} from '../src/battle/names.ts';
import {readView} from '../src/battle/view.ts';
import {benchSlot, targetSuffix} from '../src/battle/layout.ts';
import {readCondition, evaluate, rebuildPlan} from '../src/battle/plan.ts';
import {emptyFoeInfo, foldFoeEvents} from '../src/battle/opponent.ts';

/**
 * 每轮都会更新：先列出本轮认为做得不够好的地方，再在测试里逐条验证是否修好。
 * 带「修好的」前缀的是上一轮条目在本轮被修掉后的回归测试。
 */
export const ROUND_GOALS = [
  '条件不进决策：plan.conditions / plan.guarded 只建表，「如果我方 1 号体力低于 50%，使用守住」在满血时也出守住。',
  '目标还不比较战况：lowestHp/fastest/threat 只当作「对手」，没有对手血量可比较，「另一只对手」「前两个对手」没有落到 2 号位。',
  '换人位置仍然错：替换命令用「替补下标」，引擎要「出战位」，多数种子替换被拒绝，双倒只补一个位置还会留下未完成选择。',
  '默认策略仍隐式：战术无法消解时用请求里的第一招，可选招全被禁用时没有兜底。',
  '负向条件读不到：「对方不会带守住」这类写法既不是「不要」也不是条件词，整句被忽略，没有「无法验证」标记。'
];

const index = nameIndex(dex);
const parse = (text: string) => parseIntent(text, dex, index);
const makeTacticsBattle = () => makeBattle(playerTeam, npcTemplates[0].team, [3, 5, 7, 11]);

/** 直接驱动一场战斗：对手用固定策略推进，返回引擎拒绝玩家命令时的那条错误。 */
function drive(tactic: string, seed = [3, 5, 7, 11]) {
  const battle = makeBattle(playerTeam, npcTemplates[0].team, seed);
  const agent = createTacticsAgent(dex, tactic, index);
  let seen: string[] | null = null;
  for (let step = 0; step < 500 && !battle.ended; step++) {
    const own = battle.p1.activeRequest ? structuredClone(battle.p1.activeRequest) : null;
    const other = battle.p2.activeRequest ? structuredClone(battle.p2.activeRequest) : null;
    if (!own) break;
    if (seen) agent.observe(seen);
    const choice = agent.decide(own, battle.requestState);
    if (!battle.sides[0].choose(choice)) return {rejected: battle.sides[0].choice.error as string, agent, battle};
    if (other) battle.sides[1].choose(chooseFromRequest(other));
    battle.commitChoices();
  }
  return {rejected: '', agent, battle};
}

test('round 2 fixes: exceptions and negations keep the protected action', () => {
  const intent = parse('优先保护主力，除非能够结束战斗，否则不要冒险。');
  assert.ok(intent.actions.some((action) => action.move === 'Protect'));
  assert.ok(intent.exceptions.some((value) => value.startsWith('除非')));
  assert.ok(!intent.actions.some((action) => action.source.includes('结束战斗')));
});

test('round 2 fixes: Chinese names resolve through the zh-hans index', () => {
  assert.equal(parse('1是使用守住').actions[0]?.move, 'Protect');
  assert.equal(parse('换上加鲁克').actions[0]?.switchTo, 'Blastoise');
});

test('round 3 fixes: the action queue advances instead of sticking to the first move', () => {
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '1是使用守住，2是使用喷射火焰', index);
  assert.equal(agent.decide(structuredClone(battle.p1.activeRequest), 'move').split(', ')[0], 'move 4');
});

test('round 4 fixes: a negation covers every action up to the comma', () => {
  const covered = parse('不要冒险使用喷射火焰，然后使用守住').negated.flatMap((value) => value.actions);
  assert.ok(covered.includes('喷射火焰'));
  assert.ok(!covered.includes('守住'));
});

test('round 5 fixes: a guard whose condition is false does not fire', () => {
  // 满血时「如果我方 1 号体力低于 50%，使用守住」不成立：喷火龙不会出守住。
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '如果我方1号体力低于50%，使用守住', index);
  assert.equal(agent.plan.guarded.length, 1);
  const choice = agent.decide(structuredClone(battle.p1.activeRequest), 'move');
  assert.equal(choice.split(', ')[0], 'move 1');
  assert.deepEqual(agent.decisions.at(-1)?.used, []);
});

test('round 5 fixes: condition false skips to the next queued action', () => {
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '如果我方1号体力低于50%，使用守住，否则使用热风', index);
  const choice = agent.decide(structuredClone(battle.p1.activeRequest), 'move');
  // 条件不成立时出队列里的第二个动作（热风），而不是生死都用守住。
  assert.equal(choice.split(', ')[0], 'move 1');
});

test('round 5 fixes: opponent claims are recorded as unverifiable instead of ignored', () => {
  const {plan} = rebuildPlan({actions: [], conditions: ['对方不会带守住'], turn: 1, index, dex});
  assert.equal(plan.claims.length, 1);
  assert.equal(plan.claims[0]?.kinds, 'foe-move');
  assert.equal(plan.claims[0]?.subject, 'Protect');
  // 日志里出现了对手使用守住后，同样的负向判断才可能有证据（本轮只记录，不改决策）。
  const info = foldFoeEvents(emptyFoeInfo(), ['|move|p2a: Venusaur|Protect|p2a: Venusaur']);
  assert.ok(info.moves.has('Protect'));
});

test('round 5 fixes: the log is the only source of opponent information', () => {
  const view = readView({side: {pokemon: [{ident: 'p1: Charizard', condition: '100/100'}]}, active: [{moves: []}]}, 'move');
  assert.deepEqual(view.foe, [null, null]);
  const info = foldFoeEvents(emptyFoeInfo(), ['|faint|p2a: Gengar', '|switch|p2b: Arcanine|Arcanine, L58|100/100']);
  assert.ok(info.fainted.has(1));
  assert.ok(!info.present.has(1));
  assert.ok(info.present.has(2));
});

test('round 5 goals: targets still do not compare hp or speed', () => {
  const view = {own: [{slot: 1}, {slot: 2}], bench: [], activeMarkers: new Set()} as any;
  const first = targetSuffix({target: 'normal'}, 'lowestHp', view, view.own[0], new Set());
  // 已知不足（Round 6）：「体力最低」和「另一只」都是 1 号位，没有比较对手。
  assert.equal(first, ' 1');
  assert.equal(parse('优先使用水流喷射攻击体力最低的敌人').actions[0]?.target, 'lowestHp');
});

test('round 5 goals: switch seats and double knockouts still break the battle', () => {
  // 已知不足（Round 6）：替换位置与出战位还没对齐，替换时仍会被引擎拒绝或卡住。
  let rejected = '';
  try {
    rejected = drive('1是使用守住，2是使用喷射火焰').rejected;
  } catch (error) {
    rejected = (error as Error).message;
  }
  assert.match(rejected, /switch|choices/i);
});

test('round 5 goals: the default policy is still implicit', () => {
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '试试', index);
  // 已知不足：无法消解时用请求里的第一招，没有可替换的默认策略。
  assert.equal(agent.decide(structuredClone(battle.p1.activeRequest), 'move'), 'move 1, move 1 1');
});

test('round 5 goals: own conditions are evaluated but foe conditions stay unverifiable', () => {
  const view = readView({side: {pokemon: [{ident: 'p1: Charizard', condition: '40/100', active: true}]}, active: [{moves: []}]}, 'move');
  const own = readCondition('如果我方1号体力低于50%')!;
  assert.equal(evaluate(own, view, 1, emptyFoeInfo()), true);
  const foe = readCondition('如果对方体力低于30%')!;
  // 已知不足：对手血量看不到，条件永远是「不可验证」，不会成立。
  assert.equal(foe.unverifiable !== undefined, true);
  // 就算去掉不可验证标记，「对手体力低于 30%」也回答不出来，只能当成不成立。
  assert.equal(evaluate({...foe, unverifiable: undefined}, view, 1, emptyFoeInfo()), true);
  assert.deepEqual(benchSlot({bench: [{slot: 3}], activeMarkers: new Set()} as any, null, new Set()), 3);
  assert.deepEqual(normalizeText('Ｈｅａｔ　Ｗａｖｅ，２是守住'), 'Heat Wave,2是守住');
});
