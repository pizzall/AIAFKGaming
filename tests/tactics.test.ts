import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntent, normalizeText} from '../src/battle/tactics.ts';
import {runBattle, makeBattle, chooseFromRequest} from '../src/battle/runner.ts';
import {createTacticsAgent} from '../src/battle/agent.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';
import {dex} from '../src/game/catalog.ts';
import {nameIndex} from '../src/battle/names.ts';
import {readView} from '../src/battle/view.ts';

/** 每轮都会更新：先列出本轮认为做得不够好的地方，再在测试里逐条验证是否修好。 */
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
function drive(tactic: string) {
  const battle = makeTacticsBattle();
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
  // 已知不足（Round 4）：例外只记录，「除非能够结束战斗」不会变成可执行的前提。
  assert.ok(!intent.actions.some((action) => action.source.includes('结束战斗')));
});

test('round 2 fixes: a negation only removes the action it covers', () => {
  const intent = parse('不要冒险使用喷射火焰，用守住保护自己');
  assert.ok(intent.negated.includes('喷射火焰'));
  assert.ok(!intent.negated.includes('守住'));
});

test('round 2 fixes: Chinese move and species names resolve through the zh-hans index', () => {
  assert.equal(parse('1是使用守住').actions[0]?.move, 'Protect');
  assert.equal(parse('1是使用喷射火焰').actions[0]?.move, 'Flamethrower');
  assert.equal(parse('换上加鲁克').actions[0]?.switchTo, 'Blastoise');
});

test('round 2 fixes: a switch in the same sentence comes after the move', () => {
  const intent = parse('优先使用守住，然后换上加鲁克');
  const first = intent.actions.find((action) => action.move === 'Protect');
  const second = intent.actions.find((action) => action.switchTo);
  assert.ok(first && second);
  assert.ok(first.priority < second.priority);
});

test('round 2 goals: exceptions are still only recorded', () => {
  const intent = parse('1是使用守住，2是使用喷射火焰');
  const order = intent.actions.slice().sort((a, b) => a.priority - b.priority).map((action) => action.move);
  assert.deepEqual(order, ['Protect', 'Flamethrower']);
});

test('round 3 fixes: the action queue advances instead of sticking to the first move', () => {
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '1是使用守住，2是使用喷射火焰', index);
  const first = agent.decide(structuredClone(battle.p1.activeRequest), 'move');
  assert.equal(first.split(', ')[0], 'move 4');
  // 队列推进后，下一次同一只宝可梦会轮到自己队列里的下一个招式（这里血量仍满，用读出的视角检查会出的招式）。
  const view = readView(structuredClone(battle.p1.activeRequest), 'move');
  assert.equal(view.own[0]?.moves[3], 'Protect');
  assert.equal(view.own[1]?.moves[0], 'Play Rough');
});

test('round 3 fixes: a target word picks 1 or 2 only for foe/ally, and covers the quick target', () => {
  const battle = makeTacticsBattle();
  const agent = createTacticsAgent(dex, '1是使用水流喷射', index);
  const choice = agent.decide(structuredClone(battle.p1.activeRequest), 'move');
  // 队列里没有喷火龙会的招式，它按默认策略出 1 号招式；2 号位（阿兔露）认领水流喷射，作为单体招式必须带目标。
  // 已知不足（Round 4）：喷火龙不能用队列里的「守住」，默认策略也不看战术。
  assert.equal(choice.split(', ')[0], 'move 1');
  assert.ok(choice.split(', ')[1]!.startsWith('move 2 1'));
  // 已知不足：目标只区分队友/对手，「另一只敌人」仍记成 \"foe\"。
  assert.equal(parse('1是使用水流喷射攻击另一只敌人').actions[0]?.target, 'foe');
});

test('round 3 goals: replacing a fallen Pokémon next to its slot is rejected by the engine', () => {
  const {rejected} = drive('1是使用守住，2是使用喷射火焰');
  // 已知不足：单只倒下、替补紧跟着倒下位置时，引擎拒绝换人，战斗停在报错上。
  assert.match(rejected, /switch/);
});

test('round 3 goals: unsupported tactic text falls back without an explicit default', () => {
  const {rejected} = drive('试试');
  assert.match(rejected, /switch|Can't move/);
  assert.equal(parse('试试').actions.length, 0);
});

test('round 3 goals: opponent moves are never visible, so their negations cannot be checked', () => {
  const view = readView({side: {pokemon: [{ident: 'p1: Charizard', condition: '100/100'}]}, active: [{moves: []}]}, 'move');
  assert.deepEqual(view.foe, [null, null]);
  // 已知不足：负向判断（「不会带守住」）既不是「不要」类否定，也不是条件词，整句被忽略；
  // 系统看不到对手的招式，也无法验证这句话。
  const intent = parse('对方不会带守住');
  assert.equal(intent.conditions.length, 0);
  assert.equal(intent.negated.length, 0);
  assert.equal(intent.actions.length, 0);
});

test('round 3 goals: normalization keeps Chinese punctuation for the parser', () => {
  assert.deepEqual(normalizeText('Ｈｅａｔ　Ｗａｖｅ，２是守住'), 'Heat Wave,2是守住');
});
