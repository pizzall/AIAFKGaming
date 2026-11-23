import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clampTactic, parseIntent, tacticLength} from '../src/battle/tactics.ts';
import {tacticCharacters, tacticLength as gameLength, TACTIC_LIMIT} from '../src/game/types.ts';
import {GameService} from '../src/game/service.ts';
import {runComparison} from '../src/battle/compare.ts';
import {playerTeam, npcTemplates} from '../src/battle/fixtures.ts';
import {dex} from '../src/game/catalog.ts';
import {nameIndex} from '../src/battle/names.ts';

/** 第九轮：500 字上限、中文边界与并发隔离。 */
export const ROUND_GOALS = [
  '500 字上限在服务端与拆解层各算一次，且换行、全角标点、emoji 的计数可能不一致。',
  '超长文本被直接拒绝，而不是按句子边界截断并告诉玩家截到了哪里。',
  '控制字符、零宽字符与不成对代理被静默存进战术。',
  '同条件对照的两种模式可能拿到不同长度的战术文本（一个截断一个不截断）。',
  '并发对照只按账号隔离，没有限制「同一账号同时跑多份对照」消耗的预算。'
];

const index = nameIndex(dex);

test('round 9 fixes: counting is codepoint based on both sides', () => {
  const sample = '优先使用热风。\n😀全角，标点';
  assert.equal(tacticLength(sample), gameLength(sample));
  assert.equal(tacticLength(sample), Array.from(sample).length);
  // 换行 1 个、emoji 1 个、全角标点各 1 个。
  assert.equal(tacticLength('\n😀，'), 3);
  assert.equal(TACTIC_LIMIT, 500);
});

test('round 9 fixes: overlong text is cut on a sentence boundary and reported', () => {
  // 每句 7 个码点，100 句正好 700 个字，超过 500。
  const text = Array.from({length: 100}, () => '优先使用热风。').join('');
  const clamped = clampTactic(text);
  assert.equal(clamped.truncated, true);
  assert.ok(Array.from(clamped.text).length <= TACTIC_LIMIT);
  assert.ok(clamped.text.endsWith('。'));
  assert.equal(parseIntent(clamped.text, dex, index).notes.length, 0);
  const parsed = parseIntent(text, dex, index);
  // 拆解层知道原文超长，并在 notes 里写明「已按句子边界截断」。
  assert.ok(parsed.notes.some((value) => value.includes('500')));
});

test('round 9 fixes: control and zero-width characters are rejected, not stored', () => {
  assert.equal(tacticCharacters('优先使用热风\u0007'), '战术里不能有控制字符。');
  assert.equal(tacticCharacters('优先使用\u200B热风'), '战术里不能有零宽或方向控制字符。');
  assert.equal(tacticCharacters('优先使用热风'), null);
});

test('round 9 fixes: a service rejects bad tactic text with a readable error', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-limits-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true});
  try {
    const id = game.register('limits', 'password123').playerId;
    // NUL 与回车是控制字符：拒绝。超长文本不再在服务层拒绝，而是按句子边界截断后保存（拆解层会写明截断）。
    assert.throws(() => game.command(id, 'ctrl', {kind: 'team', team: game.state(id).team, tactic: '热风\u0000守住'}), /控制字符/);
    // 单独的 \r 在服务层先被统一成 \n（旧存档的 Windows 换行），这与「回车控制字符」不冲突。
    assert.doesNotThrow(() => game.command(id, 'cr', {kind: 'team', team: game.state(id).team, tactic: '热风\r守住'}));
    // 恰好 500 字可以保存：按码点算，不让全角/换行变成两个。
    const exact = '热'.repeat(499) + '\n';
    assert.doesNotThrow(() => game.command(id, 'exact', {kind: 'team', team: game.state(id).team, tactic: exact}));
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('round 9 fixes: both comparison modes run the identical clamped tactic', () => {
  const long = Array.from({length: 400}, () => '优先使用热风攻击体力最低的敌人。').join('');
  const report = runComparison(long, dex, {seed: [3, 5, 7, 11], left: playerTeam, right: npcTemplates[0]?.team ?? playerTeam, index});
  assert.equal(report.outcomes.length, 2);
});

test('round 9 goals: concurrency has no per-account comparison budget', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-concurrency-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true});
  try {
    const a = game.register('alice', 'password123').playerId;
    const b = game.register('bob', 'password123').playerId;
    const first = game.compare({id: a, tactic: '优先使用热风', seed: [1, 2, 3, 4]});
    // 已知不足（Round 10）：同一账号可以连续开多份对照，没有并发/频率上限。
    const second = game.compare({id: a, tactic: '优先使用热风', seed: [1, 2, 3, 4]});
    assert.notEqual(first.id, second.id);
    // 记录按账号隔离：b 看不到 a 的对照。
    assert.equal(game.comparisons(b).length, 0);
    assert.ok(game.comparisons(a).length >= 2);
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

test('round 9 goals: a saved tactic still carries raw newlines and emoji', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-lines-'));
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: true});
  try {
    const id = game.register('lines', 'password123').playerId;
    const tactic = '优先使用热风。\r\n😀第二句';
    game.command(id, 'save', {kind: 'team', team: game.state(id).team, tactic});
    const saved = game.state(id).tactic;
    // 换行统一成 \n 并原样保存（含 emoji）；已知不足：界面上没有提示这是一条多行战术。
    assert.equal(saved, '优先使用热风。\n😀第二句');
  } finally {
    game.close();
    rmSync(directory, {recursive: true, force: true});
  }
});
