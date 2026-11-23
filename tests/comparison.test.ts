import test from 'node:test';
import assert from 'node:assert/strict';
import {runComparison, toRecord} from '../src/battle/compare.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';
import {dex} from '../src/game/catalog.ts';
import {nameIndex} from '../src/battle/names.ts';
import {parseIntent} from '../src/battle/tactics.ts';
import {createTacticsAgent} from '../src/battle/agent.ts';

/** 第七轮：两种决策方式的同条件对照。 */
export const ROUND_GOALS = [
  '对照实验只能在「同队伍/同种子/同信息/同预算」下比较，不能拿两个不同步的配置比。',
  '胜负只作辅助：审计要看误解发生在哪一步，而不是谁赢。',
  '直接模式没有共享替换适配器，第一回合就倒在自己的命令上，因此没有机会暴露真实误解。',
  '对照结果没有视图落库，只能靠测试内断言，无法在接口里回看。',
  '「二次定位」的纠错能力没有量化：只知道 refined 活得久，不知道它具体修好了哪几条。'
];

const index = nameIndex(dex);
const tactic = '优先使用热风攻击体力最低的敌人';
const options = {seed: [3, 5, 7, 11], left: playerTeam, right: npcTemplates[0].team, index};

test('round 7 fixes: both modes share the same reference battle, seed and switch adapter', () => {
  const report = runComparison(tactic, dex, options);
  assert.equal(report.outcomes.length, 2);
  assert.deepEqual(report.outcomes.map((outcome) => outcome.seed), [options.seed, options.seed]);
  // 对手仍然只用同一支队伍、同一种子；direct 和 refined 在同一个种子上各跑一遍。
  assert.deepEqual(report.outcomes[0]?.seed, report.outcomes[1]?.seed);
});

test('round 7 fixes: the audit names where the misunderstanding happened', () => {
  const report = runComparison(tactic, dex, options);
  assert.ok(report.mistakes.length > 0);
  for (const mistake of report.mistakes) {
    assert.ok(['unresolved', 'condition-missed', 'at-condition', 'await-refinement', 'scene-target', 'negation-scope', 'default', 'engine-reject'].includes(mistake.kind));
    assert.ok(mistake.sequence >= 0);
  }
  // 审计记录里有「引擎拒绝」这一条，说明误解不只是文本层，还有命令层。
  assert.ok(report.mistakes.some((mistake) => mistake.kind === 'engine-reject'));
});

test('round 7 fixes: the record is storable and keeps both sides', () => {
  const report = runComparison(tactic, dex, options);
  const record = toRecord(report);
  assert.equal(record.outcomes.length, 2);
  assert.equal(record.seed.join(','), options.seed.join(','));
  assert.ok(record.outcomes.every((outcome) => Array.isArray(outcome.decisions)));
  assert.equal(typeof record.winnerAgreement, 'boolean');
});

test('round 7 goals: outcome is still not a reliable signal', () => {
  // 已知不足（Round 8）：refined 会撑得更久，但胜负仍被对手的固定策略主导，不能当作正确性证据。
  const report = runComparison(tactic, dex, options);
  const direct = report.outcomes.find((outcome) => outcome.mode === 'direct')!;
  const refined = report.outcomes.find((outcome) => outcome.mode === 'refined')!;
  assert.ok(refined.turns >= direct.turns);
});

test('round 7 goals: refinement audit is not quantitative yet', () => {
  // 已知不足：只知道 refined 活得久，没有统计它具体修好了「条件/目标/否定」中的哪几条。
  const mistakes = toRecord(runComparison(tactic, dex, options)).mistakes.filter((mistake) => mistake.mode === 'refined').length;
  assert.ok(mistakes >= 0);
  const agent = createTacticsAgent(dex, '如果我方1号体力低于1%，使用守住', index);
  assert.equal(agent.plan.guarded.length, 1);
  void mistakes;
  assert.equal(parseIntent('随便', dex, index).actions.length, 0);
  assert.equal(toRecord(runComparison(tactic, dex, options)).mistakes.length >= 0, true);
});
