import test from 'node:test';
import assert from 'node:assert/strict';
import {chineseNames, readableLog} from '../src/game/localization.ts';
import {speciesCatalog} from '../src/game/catalog.ts';
import {findSpecies, battleLines, battleOutcome} from '../web/game/display.js';

test('local original data supplies Chinese names and a searchable public species catalog', () => {
  assert.equal(chineseNames.moves.tackle, '撞击');
  assert.equal(chineseNames.abilities.overgrow, '茂盛');
  assert.equal(chineseNames.natures.adamant, '固执');
  assert.equal(chineseNames.items.leftovers, '吃剩的东西');
  assert.equal(speciesCatalog.length, 1025);
  assert.equal(findSpecies(speciesCatalog, '025')[0].name, '皮卡丘');
  assert.equal(findSpecies(speciesCatalog, '伊布')[0].number, 133);
  assert.equal(findSpecies(speciesCatalog, '不存在的名字').length, 0);
});

test('log localization preserves Chinese actions and player names while translating structured legacy data', () => {
  const resources = {money: {name: '金钱'}, pokeball: {name: '精灵球'}};
  assert.equal(readableLog('已完成：进入备战', resources), '已完成：进入备战');
  assert.equal(readableLog('已完成：prepare', resources), '已完成：进入备战');
  assert.equal(readableLog('已保存编队预设：money。', resources), '已保存编队预设：money。');
  assert.equal(readableLog('心愿捕获成功：皮卡丘 Lv.5（pokeball）。', resources), '心愿捕获成功：皮卡丘 5级（精灵球）。');
  assert.equal(readableLog('测试指令：/grant leftovers 2', resources), '测试指令：增加资源：吃剩的东西 2');
});

test('battle display translates actions, targets, conditions and Mega without exposing raw protocol', () => {
  const lines = battleLines(
    [
      '|turn|1',
      '|move|p1a: Charizard|Flamethrower|p2a: Venusaur',
      '|-damage|p2a: Venusaur|50/100 par',
      '|-ability|p2a: Venusaur|Overgrow',
      '|-mega|p1a: Charizard|Charizard|Charizardite Y',
      '|faint|p2a: Venusaur'
    ],
    chineseNames
  );
  const text = lines.join(' ');
  assert.match(text, /喷火龙/);
  assert.match(text, /喷射火焰/);
  assert.match(text, /妙蛙花/);
  assert.match(text, /麻痹/);
  assert.match(text, /超级进化/);
  assert.ok(!/[a-zA-Z]/.test(text), text);
});

test('gym outcome describes the viewer side and never treats a defender win as a challenger win', () => {
  assert.equal(battleOutcome({status: 'completed', viewerSide: 'p1', winnerSide: 'p1'}).label, '挑战获胜');
  assert.equal(battleOutcome({status: 'completed', viewerSide: 'p1', winnerSide: 'p2'}).label, '挑战未获胜');
  assert.equal(battleOutcome({status: 'completed', viewerSide: 'p2', winnerSide: 'p2'}).label, '防守成功');
  assert.equal(battleOutcome({status: 'completed', viewerSide: 'p2', winnerSide: 'p1'}).label, '防守失利');
  assert.equal(battleOutcome({status: 'completed', viewerSide: 'p1', winnerSide: null}).label, '双方战平');
  assert.equal(battleOutcome({status: 'running', viewerSide: 'p1'}).label, '对战中');
  assert.equal(battleOutcome({status: 'error', viewerSide: 'p1'}).label, '执行异常');
  const stale = battleOutcome({status: 'completed', viewerSide: 'p1', winnerSide: 'p1', stale: true});
  assert.equal(stale.label, '席位结算已失效');
  assert.ok(!stale.detail.includes('已接任'));
});
