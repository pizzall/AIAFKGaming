import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntent, normalizeText} from '../src/battle/tactics.ts';
import {runBattle, makeBattle} from '../src/battle/runner.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';
import {createTacticsAgent} from '../src/battle/agent.ts';
import {dex} from '../src/game/catalog.ts';
import {nameIndex} from '../src/battle/names.ts';

/** 每轮都会更新：先列出本轮认为做得不够好的地方，再在测试里逐条验证是否修好。 */
export const ROUND_GOALS = [
  '否定只吞掉「不要」后面第一个动作词，但它管住的往往是一整句里剩下的动作；「否则不要冒险」只会吞掉「冒险」，不会吞掉真正的动作。',
  '两个招式都写在同一个数字下时，只有最前面的那个能在每个回合生效；后面的预设永远不会被执行，行动队列没有推进。',
  '目标词只认「对手」「另一只」「队友」，没有真正的「体力最低」「速度最快」：本轮所有人都打 1 号位。',
  '换人只在倒下时按文本顺序换；「换上」写在战术里也不会在主回合主动换人，也不会按速度/体力选对位。',
  '中文招式名混合了宝可梦（「喷火龙的地震」）时无法消解，物种名也没有建立索引，玩家写昵称更是完全无法命中。'
];

const index = nameIndex(dex);
const parse = (text: string) => parseIntent(text, dex, index);
const makeTacticsBattle = () => makeBattle(playerTeam, npcTemplates[0].team, [3, 5, 7, 11]);

test('round 2 fixes: exceptions and negations keep the protected action', () => {
  const intent = parse('优先保护主力，除非能够结束战斗，否则不要冒险。');
  assert.ok(intent.actions.some((action) => action.move === 'Protect'));
  assert.ok(intent.exceptions.some((value) => value.startsWith('除非')));
  // 已知不足（Round 3）：例外只记录，「除非能够结束战斗」不会变成可执行的前提。
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

test('round 2 goals: a second move under the same number never runs', () => {
  const agent = createTacticsAgent(dex, '1是使用守住，2是使用喷射火焰', index);
  const order = agent.intent.actions.slice().sort((a, b) => a.priority - b.priority).map((action) => action.move);
  assert.deepEqual(order, ['Protect', 'Flamethrower']);
  // 已知不足：1 号总是「守住」，2 号「喷射火焰」永远不会轮到，因为每一轮都从头扫描队列。
  const battle = runBattle({seed: [3, 5, 7, 11], npcIndex: 0, agent: 'tactics', playerTactic: '1是使用守住，2是使用喷射火焰'});
  const used = battle.playerDecisions!.flatMap((decision) => decision.used);
  assert.ok(used.length > 0);
  assert.ok(used.every((value) => value.startsWith('守住')));
});

test('round 2 goals: target words are recorded but every attack still picks the first opponent', () => {
  const intent = parse('1是使用水流喷射攻击体力最低的敌人');
  assert.equal(intent.actions[0]?.target, 'lowestHp');
  // 已知不足：目标只用来决定站位 1/2；哪个对手体力最低、速度最快都不参与决策，队友之间也不做站位判断。
  const agent = createTacticsAgent(dex, '1是使用水流喷射攻击体力最低的敌人', index);
  const battle = makeTacticsBattle();
  assert.equal(agent.decide(structuredClone(battle.p1.activeRequest)).split(', ')[0], 'move 1 1');
});

test('round 2 goals: a planned switch only happens when forced', () => {
  // 已知不足：换人只会在倒下后按顺序替换，不会按战术主动换人。
  const trace = runBattle({seed: [3, 5, 7, 11], npcIndex: 0, agent: 'tactics', playerTactic: '1是使用守住，然后换上加鲁克'});
  assert.ok(trace.playerDecisions!.some((decision) => decision.reason.includes('按战术换入')));
  // 每一次换人都发生在引擎要求替换的时候，被记录下来的是「按战术换入」的理由。
  const switches = trace.playerDecisions!.filter((decision) => decision.choice.includes('switch'));
  assert.ok(switches.length > 0);
  assert.ok(switches.every((decision) => decision.reason.includes('按战术换入')));
});

test('round 2 goals: a species mixed into the move name resolves to the species, not the move', () => {
  // 已知不足（Round 3）：「喷火龙的地震」仍然只认成上下场的宝可梦，招式被丢掉。
  assert.equal(parse('优先使用喷火龙的地震').actions[0]?.move, null);
  assert.deepEqual(normalizeText('Ｈｅａｔ　Ｗａｖｅ，２是守住'), 'Heat Wave,2是守住');
  // 「流喷射」少了首字，中文名字消解不会做拼写模糊，留给 Round 3。
  assert.equal(parse('1是使用水流喷射攻击体力最低的敌人').actions[0]?.move, null);
});
