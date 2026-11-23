import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntent, normalizeText} from '../src/battle/tactics.ts';
import {runBattle} from '../src/battle/runner.ts';

/** 每轮都会更新：先列出本轮认为做得不够好的地方，再在测试里逐条验证是否修好。 */
export const ROUND_GOALS = [
  '条件遗漏：「优先保护主力，除非能够结束战斗」里的「除非能够结束战斗」被拆成例外后没有接入决策。',
  '否定误读：带否定的句子整句丢弃，导致「不要冒险」之外的动作一起消失。',
  '目标词不执行：「攻击体力最低的敌人」里的目标词记下来了，但决策总是打相邻对手一号。',
  '优先级颠倒：换人与招式同句时，换人排在第一位，总是先换人才出招。',
  '中文招式名全部无法消解：引擎只认英文原名，战术里的中文招式名从未命中。'
];

const slots = (tactic: string) => parseIntent(tactic).actions.map((action) => action.source);

test('round 1 baseline: conditions, exceptions and negations are recorded but never applied', () => {
  const intent = parseIntent('优先保护主力，除非能够结束战斗，否则不要冒险。');
  assert.ok(intent.exceptions.some((value) => value.startsWith('除非')));
  assert.ok(intent.negations.some((value) => value.startsWith('不要')));
  // 本轮已知不足：例外与否定都只记录，不改变排序或取舍；「保护主力」也没有被拆成「保护」。
  assert.equal(intent.actions.length, 0);
  const trace = runBattle({seed: [9, 9, 9, 9], npcIndex: 0, agent: 'tactics', playerTactic: '优先保护主力，除非能够结束战斗，否则不要冒险。'});
  assert.equal(trace.agentKind, 'tactics');
  assert.ok(trace.playerDecisions!.every((value) => value.ignored.some((item) => item.startsWith('例外'))));
});

test('round 1 baseline: a sentence with a negation loses all of its actions', () => {
  const intent = parseIntent('不要冒险使用喷射火焰');
  assert.equal(intent.actions.length, 0);
});

test('round 1 baseline: documented target words never change the chosen target', () => {
  const intent = parseIntent('优先使用热风攻击体力最低的敌人');
  // 本轮已知不足：目标词写在句子末尾时，动词模式要求后接停顿，整句没有产生动作，目标词也随之丢失。
  assert.equal(intent.actions.length, 0);
  const trace = runBattle({seed: [5, 5, 5, 5], npcIndex: 0, agent: 'tactics', playerTactic: '优先使用热风攻击体力最低的敌人'});
  assert.ok(trace.playerDecisions!.some((value) => value.reason === '使用第一个可用招式'));
});

test('round 1 baseline: numbers beat order, but switches and moves share the same number', () => {
  const intent = parseIntent('优先使用热风，1是保护，保护好后换上加鲁克');
  const switchAction = intent.actions.find((action) => action.switchTo);
  assert.equal(switchAction?.source, '加鲁克');
  assert.equal(switchAction?.priority, 1);
});

test('round 1 baseline: Chinese move names are not resolved at all', () => {
  const intent = parseIntent('我的莎莉亚用日光束攻击体力最低的敌人');
  assert.ok(slots('我的莎莉亚用日光束攻击体力最低的敌人').every((value) => !['日光束', 'Solar Beam'].includes(value)));
  assert.deepEqual(normalizeText('Ｈｅａｔ　Ｗａｖｅ，２是守住'), 'Heat Wave,2是守住');
});
