import {readFileSync} from 'node:fs';
import {Engine} from '../battle/engine.ts';

function csv(file: string): string[][] {
  const text = readFileSync(new URL(`../../data/raw/pokeapi/${file}.csv`, import.meta.url), 'utf8');
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (char === '\n' && !quoted) {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.slice(1);
}

function dictionary(table: string, namesTable: string, dexSection?: string): Record<string, string> {
  const rows = csv(namesTable);
  const chinese = new Map(rows.filter((row) => row[1] === '12').map((row) => [Number(row[0]), row[2]]));
  const english = new Map(rows.filter((row) => row[1] === '9').map((row) => [Number(row[0]), row[2]]));
  const result: Record<string, string> = {};
  for (const row of csv(table)) {
    const name = chinese.get(Number(row[0]));
    if (!name) continue;
    result[Engine.toID(row[1])] = name;
    if (english.has(Number(row[0]))) result[Engine.toID(english.get(Number(row[0])))] = name;
  }
  if (dexSection) {
    for (const entry of (Engine.Dex.mod('gen9') as any)[dexSection].all()) {
      const name = chinese.get(entry.num);
      if (name) result[entry.id] = name;
    }
  }
  return result;
}

const variants = JSON.parse(readFileSync(new URL('../../data/pokemon.json', import.meta.url), 'utf8'));
const speciesNames: Record<string, string> = {};
for (const entry of JSON.parse(readFileSync(new URL('../../data/species.json', import.meta.url), 'utf8'))) {
  speciesNames[Engine.toID(entry.identifier)] = entry.name_zh_hans;
}
for (const entry of variants) {
  const data = Engine.Dex.species.get(entry.identifier);
  if (!entry.name_zh_hans || !data.exists) continue;
  speciesNames[data.id] = entry.name_zh_hans;
  speciesNames[Engine.toID(entry.identifier)] = entry.name_zh_hans;
}
export const chineseNames: Record<string, Record<string, string>> = {
  species: speciesNames,
  moves: dictionary('moves', 'move_names', 'moves'),
  abilities: dictionary('abilities', 'ability_names', 'abilities'),
  natures: dictionary('natures', 'nature_names'),
  items: dictionary('items', 'item_names'),
  types: dictionary('types', 'type_names')
};
export const actionNames: Record<string, string> = {
  rest: '恢复探索体力',
  debug: '测试调整',
  'gym-challenge': '报名道馆挑战',
  team: '更新当前队伍',
  'preset-save': '保存编队预设',
  'preset-delete': '删除编队预设',
  prepare: '进入备战',
  'cancel-ready': '取消备战',
  wishlist: '更新捕获心愿单',
  'explore-start': '开始探索',
  'explore-stop': '停止探索',
  buy: '购买道具',
  sell: '出售资源',
  build: '建设产业',
  workers: '调整岗位',
  upgrade: '扩建设施',
  plant: '种植树果',
  harvest: '收获树果',
  'remove-tree': '移除果树',
  'breed-start': '开始配对产蛋',
  'hatch-start': '开始整盒孵化',
  equip: '调整携带道具',
  'item-use': '使用仓库道具',
  train: '分配努力值',
  moves: '调整招式',
  evolve: '手动进化'
};
export function chineseName(kind: string, value: string): string {
  return chineseNames[kind]?.[Engine.toID(value)] ?? value;
}
export function readableLog(value: string, resources: Record<string, any>): string {
  if (value.startsWith('已保存编队预设：')) return value;
  const resourceName = (key: string) => resources[key]?.name ?? chineseName('items', key);
  let result = value.replace(/^已完成：(.+)$/, (_, key) => `已完成：${actionNames[key] ?? key}`);
  if (result.startsWith('心愿捕获成功：')) {
    result = result.replace(/Lv\.(\d+)/g, '$1级').replace(/（([a-z0-9]+)）/g, (_, key) => `（${resourceName(key)}）`);
  }
  result = result
    .replace(/\/pokemon\s+(\S+)\s+(\d+)/g, (_, name, level) => `获得${chineseName('species', name)}，等级${level}`)
    .replace(/\/grant\s+(\S+)\s+(\d+)/g, (_, key, amount) => `增加资源：${resourceName(key)} ${amount}`)
    .replace(/\/level\s+all\s+/g, '全体等级：')
    .replace(/\/time\s+(\d+)([smhd])/g, (_, amount, unit) => `推进时间${amount}${({s: '秒', m: '分钟', h: '小时', d: '天'} as any)[unit]}`)
    .replace(/\/heal/g, '恢复探索体力')
    .replace(/\/season\s+next/g, '刷新下一赛季');
  return result;
}
