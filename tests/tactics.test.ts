import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntent, normalizeText} from '../src/battle/tactics.ts';
import {runBattle, makeBattle, chooseFromRequest} from '../src/battle/runner.ts';
import {createTacticsAgent} from '../src/battle/agent.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';
import {dex} from '../src/game/catalog.ts';
import {nameIndex} from '../src/battle/names.ts';
import {readView} from '../src/battle/view.ts';
import {benchSlot, targetSuffix} from '../src/battle/layout.ts';
import {readCondition, evaluate} from '../src/battle/plan.ts';

/**
 * 每轮都会更新：先列出本轮认为做得不够好的地方，再在测试里逐条验证是否修好。
 * 这里放的是「本轮开始时的清单」；修好的条目用「修好的」命名保留为回归。
 */
export const ROUND_GOALS = [
  '否定作用域太窄：「不要冒险」只吞掉后面第一个动作；「否则不要冒险」整句剩下的动作不会被吞。',
  '目标只分会/不会队友，没有比较对手的血量、速度、威胁，也没有处理「前两个对手」「另一只对手」。',
  '换入位置不防「仍标成 active」的位置：单只倒下且替补紧跟在后面时，引擎会直接拒绝换人。',
  '"试试"这类无法消解的战术文字没有显式默认策略，退回第一招且没有可选招时会被引擎拒绝。',
  '请求里没有对手的招式与选择：文本写到"对方不会带守住"时，系统无法验证这类否定条件，也没有当作条件记录。'
];

const index = nameIndex(dex);
const parse = (text: string) => parseIntent(text, dex, index);
const makeTacticsBattle = () => makeBattle(playerTeam, npcTemplates[0].team, [3, 5, 7, 11]);

/** 直接驱动一场战斗：对手用固定策略推进，返回引擎拒绝玩家命令时的那条错误。 */
function drive(tactic: string, seed = [3, 5, 7, 11]) {
  const battle = makeBattle(playerTeam, npcTemplates[0].team, seed);
  const agent = createTacticsAgent(dex, tactic, index);
  for (let step = 0; step < 500 && !battle.ended; step++) {
    const own = battle.p1.activeRequest ? structuredClone(battle.p1.activeRequest) : null;
    const other = battle.p2.activeRequest ? structuredClone(battle.p2.activeRequest) : null;
    if (!own) break;
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
  assert.equal(parse('1是使用喷射火焰').actions[0]?.move, 'Flamethrower');
  assert.equal(parse('换上加鲁克').actions[0]?.switchTo, 'Blastoise');
});

test('round 3 fixes: the action queue advances instead of sticking to the first move', () => {
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '1是使用守住，2是使用喷射火焰', index);
  assert.equal(agent.decide(structuredClone(battle.p1.activeRequest), 'move').split(', ')[0], 'move 4');
});

test('round 4 fixes: a negation covers every action up to the comma', () => {
  const intent = parse('不要冒险使用喷射火焰，然后使用守住');
  const covered = intent.negated.flatMap((value) => value.actions);
  assert.ok(covered.includes('喷射火焰'));
  // 「然后」结束否定域：守住继续执行。
  assert.ok(!covered.includes('守住'));
});

test('round 4 fixes: "否则不要" swallows the rest of the sentence', () => {
  const intent = parse('当对方倒下时，否则不要冒险使用守住，然后使用喷射火焰');
  const covered = intent.negated.flatMap((value) => value.actions);
  assert.ok(covered.includes('守住'));
});

test('round 4 fixes: a planned switch that lands on a blocked seat falls back to the next bench', () => {
  const view = {
    state: 'switch', own: [null, null], foe: [null, null],
    bench: [3, 4, 5].map((slot) => ({slot, ident: `p1: m${slot}`, species: 'X', hpPercent: 100, fainted: false, status: '', atk: null, spe: null, moves: []})),
    downed: [], activeMarkers: new Set([0, 1, 2])
  } as any;
  const chosen = benchSlot(view, null, new Set());
  assert.equal(chosen.slot, 4);
  // 前三个替补都被「仍标成 active」挡住，所以换到了 4 号位——不再直接撞上被占用的位置。
  assert.equal(chosen.reason, 'order');
  // 已知不足（Round 5）：换人位置仍然直接给「替补下标」，不是引擎要求的「出战位」。
});

test('round 4 fixes: target 1 is skipped once claimed by the other ally', () => {
  const view = {own: [{slot: 1}, {slot: 2}], bench: [], activeMarkers: new Set()} as any;
  const move = {target: 'normal'};
  const first = targetSuffix(move, null, view, view.own[0], new Set());
  const second = targetSuffix(move, null, view, view.own[1], new Set([1]));
  assert.equal(first, ' 1');
  assert.equal(second, ' 2');
});

test('round 4 goals: quick target and ally targets still ignore the stance', () => {
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '1是使用水流喷射', index);
  const choice = agent.decide(structuredClone(battle.p1.activeRequest), 'move');
  assert.equal(choice.split(', ')[0], 'move 1');
  assert.ok(choice.split(', ')[1]!.startsWith('move 2 1'));
});

test('round 4 goals: unsupported text still falls back without an explicit default', () => {
  assert.equal(parse('试试').actions.length, 0);
  assert.equal(parse('随便打打').actions.length, 0);
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '试试', index);
  // 已知不足（Round 5）：这里会用第一招，并且不会在可选招全被禁用时兜底。
  assert.equal(agent.decide(structuredClone(battle.p1.activeRequest), 'move'), 'move 1, move 1 1');
});

test('round 4 goals: opponent claims cannot be verified', () => {
  const intent = parse('对方不会带守住');
  assert.equal(intent.conditions.length, 0);
  assert.equal(intent.actions.length, 0);
  const view = readView({side: {pokemon: [{ident: 'p1: Charizard', condition: '100/100'}]}, active: [{moves: []}]}, 'move');
  assert.deepEqual(view.foe, [null, null]);
  // 本轮修好一半：这类条件被读成「对手体力」条件，但因为看不到对手血量被标成不可验证、不会当成成立。
  const condition = readCondition('对方体力低于30%')!;
  assert.equal(condition.kind, 'foe-hp');
  assert.equal(evaluate({...condition, unverifiable: '看不到对手'}, view, 1, new Set()), false);
  // 已知不足（Round 5）：「对方不会带守住」这种负向写法仍然不是条件，系统也没有报告「无法验证」。
  assert.equal(parse('对方不会带守住').conditions.length, 0);
});

test('round 4 goals: conditions are parsed but only own-hp ones are evaluated', () => {
  const view = readView(
    {side: {pokemon: [{ident: 'p1: Charizard', condition: '40/100', active: true}]}, active: [{moves: []}]},
    'move'
  );
  const own = readCondition('如果我方1号体力低于50%')!;
  assert.equal(own.kind, 'own-hp');
  assert.equal(evaluate(own, view, 1, new Set()), true);
  // 已知不足：条件成立时并没有改变行动队列，决策层还没有读 plan.guarded。
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '如果我方1号体力低于50%，使用守住', index);
  assert.equal(agent.decide(structuredClone(battle.p1.activeRequest), 'move'), 'move 4, move 4');
});

test('round 4 goals: switching is still rejected by the engine on most seeds', () => {
  let rejected = '';
  try {
    rejected = drive('1是使用守住，2是使用喷射火焰').rejected;
  } catch (error) {
    rejected = (error as Error).message;
  }
  assert.match(rejected, /switch|choices/i);
  // 已知不足（Round 5）：替换位置仍然用「替补下标」，没有换成引擎要求的出战位。
  assert.deepEqual(normalizeText('Ｈｅａｔ　Ｗａｖｅ，２是守住'), 'Heat Wave,2是守住');
});
