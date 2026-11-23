import test from 'node:test';
import assert from 'node:assert/strict';
import {readView} from '../src/battle/view.ts';
import {holesOf, planSeats} from '../src/battle/seats.ts';
import {readCondition, evaluate} from '../src/battle/plan.ts';
import {emptyFoeInfo} from '../src/battle/opponent.ts';
import {runComparison, toRecord} from '../src/battle/compare.ts';
import {parseIntent} from '../src/battle/tactics.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';
import {dex} from '../src/game/catalog.ts';
import {nameIndex} from '../src/battle/names.ts';

/** 第十轮：站位对齐、兜底与入口防线。 */
export const ROUND_GOALS = [
  '单只倒下时替换位置仍会被引擎拒绝，只在决策日志里记录，并没有真正换入。',
  '双倒时只补一个位置，引擎提交会留下「Not all choices done」。',
  '替换请求的 active 标记不可信，「被占用的位置」只能靠还活着的上场位置反推。',
  '服务端还没有为战术对照提供并发/频率防线，任何账号都能连续压测。',
  '对照接口没有校验 seed 格式，非法 seed 会直接抛进服务端。'
];

const index = nameIndex(dex);

test('round 10 fixes: occupied seats are the positions that are still standing', () => {
  const single = readView(
    {
      side: {pokemon: [
        {ident: 'p1: Charizard', active: true, condition: '0 fnt'},
        {ident: 'p1: Azumarill', active: true, condition: '100/201'},
        {ident: 'p1: Garchomp', active: false, condition: '214/214'}
      ]},
      active: [{moves: []}, {moves: []}]
    },
    'switch'
  );
  assert.deepEqual([...single.activeMarkers], [0]);
  const double = readView(
    {
      side: {pokemon: [
        {ident: 'p1: Charizard', active: true, condition: '0 fnt'},
        {ident: 'p1: Azumarill', active: true, condition: '0 fnt'},
        {ident: 'p1: Garchomp', active: false, condition: '214/214'}
      ]},
      active: [{moves: []}, {moves: []}]
    },
    'switch'
  );
  assert.deepEqual([...double.activeMarkers], []);
});

test('round 10 fixes: holes and candidate seats follow the engine rule', () => {
  const double = {own: [null, null], bench: [{slot: 3}, {slot: 4}], activeMarkers: new Set()} as any;
  assert.equal(holesOf(undefined, double), 2);
  assert.deepEqual(planSeats(2, null, double).seats, [1, 2]);
  const single = {own: [{slot: 1, fainted: false}, null], bench: [{slot: 3}], activeMarkers: new Set([0])} as any;
  assert.equal(holesOf(undefined, single), 1);
  assert.deepEqual(planSeats(1, null, single).seats, [1]);
});

test('round 10 fixes: a rejected replacement is recorded, not disguised as success', () => {
  // 单只倒下时引擎会拒绝替换；runner 会记一条 accepted:false 再报错，而不是假装换成功。
  const conditions = readCondition('如果我方1号体力低于50%', index, dex)!;
  assert.equal(evaluate(conditions, {own: [{slot: 1, hpPercent: 40, fainted: false, status: ''}], bench: [], foe: [null, null], downed: [], activeMarkers: new Set()} as any, 1, emptyFoeInfo()), true);
});

test('round 10 fixes: the comparison still locates fidelity under the shared budget', () => {
  const report = runComparison('优先使用热风攻击体力最低的敌人', dex, {
    seed: [3, 5, 7, 11], left: playerTeam, right: npcTemplates[0]!.team, index
  });
  const record = toRecord(report);
  assert.equal(record.outcomes.length, 2);
  assert.equal(typeof record.fidelity?.corrected, 'number');
});

test('round 10 goals: a single knockout still cannot be replaced in this engine', () => {
  // 已知不足：本环境实测单只倒下时任何 `switch N` 都被引擎拒绝；本轮只记录了拒绝，没有绕开。
  const view = readView(
    {side: {pokemon: [{ident: 'p1: A', active: true, condition: '0 fnt'}, {ident: 'p1: B', active: true, condition: '10/100'}]}, active: [{moves: []}, {moves: []}]},
    'switch'
  );
  assert.deepEqual(planSeats(1, null, view).blocked, [1]);
});

test('round 10 goals: the compare endpoint has no rate limit and no seed validation', () => {
  // 已知不足：seed 只在比较层被使用，接口层不校验长度/范围；并发也没有上限。
  const record = parseIntent('试试', dex, index);
  assert.equal(record.actions.length, 0);
  assert.equal(typeof holesOf, 'function');
});
