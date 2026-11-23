import {readFileSync} from 'node:fs';
import {chineseName} from './localization.ts';

export interface Machine {
  number: number;
  resource: string;
  itemId: number;
  moveId: number;
  move: string;
  sourceVersionGroup: number;
}
export const machines: Machine[] = JSON.parse(
  readFileSync(new URL('../../data/derived/machines-gen9.json', import.meta.url), 'utf8')
).machines;
const compatibility = new Map<string, string[]>();

export function machineMoves(dex: any, species: string): string[] {
  const key = `${dex.currentMod}:${species}`;
  if (!compatibility.has(key)) {
    const moves = new Set<string>();
    for (const entry of dex.species.getFullLearnset(species)) {
      for (const [move, sources] of Object.entries(entry.learnset) as [string, string[]][]) {
        if (sources.some((source) => source === '9M')) moves.add(move);
      }
    }
    compatibility.set(key, [...moves]);
  }
  return compatibility.get(key)!;
}

const stats: Record<string, string> = {atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', accuracy: '命中', evasion: '闪避'};
const conditions: Record<string, string> = {
  brn: '灼伤',
  par: '麻痹',
  psn: '中毒',
  tox: '剧毒',
  slp: '睡眠',
  frz: '冰冻',
  flinch: '畏缩',
  confusion: '混乱',
  leechseed: '寄生种子'
};
const targets: Record<string, string> = {
  normal: '任一相邻目标',
  adjacentFoe: '相邻对手',
  allAdjacentFoes: '全部相邻对手',
  allAdjacent: '除自身外的所有相邻宝可梦',
  self: '自身',
  any: '任意其他宝可梦',
  allySide: '己方场地',
  foeSide: '对方场地',
  all: '全场',
  randomNormal: '随机相邻对手',
  adjacentAlly: '相邻队友',
  adjacentAllyOrSelf: '自身或相邻队友',
  allies: '己方全体',
  scripted: '由招式效果决定'
};
const flags: Record<string, string> = {
  contact: '接触',
  sound: '声音',
  punch: '拳类',
  bite: '咬类',
  bullet: '球与弹',
  wind: '风',
  slicing: '切割',
  pulse: '波动',
  dance: '舞蹈',
  charge: '蓄力',
  recharge: '使用后休息',
  protect: '可被守住阻挡'
};
const special: Record<string, string> = {
  protect: '本回合保护自身免受多数攻击，连续使用更易失败。',
  detect: '本回合看穿并避开多数攻击，连续使用更易失败。',
  endure: '本回合受到攻击时至少保留1点生命值，连续使用更易失败。',
  substitute: '消耗最大生命值的1/4制造替身，替身代替自身承受部分攻击和效果。',
  leechseed: '种下寄生种子，每回合吸取目标最大生命值的1/8；对草属性无效。',
  rest: '回复全部生命值并解除原有异常，随后进入睡眠。',
  splash: '通常不会产生效果。',
  transform: '变身为目标，复制其外形、属性、能力变化及招式等信息。'
};
function effectText(effect: any, who: string): string[] {
  if (!effect) return [];
  const texts: string[] = [];
  if (effect.status && conditions[effect.status]) texts.push(`${who}陷入${conditions[effect.status]}`);
  if (effect.volatileStatus && conditions[effect.volatileStatus]) texts.push(`${who}陷入${conditions[effect.volatileStatus]}`);
  for (const [stat, amount] of Object.entries(effect.boosts ?? {}) as [string, number][]) {
    if (stats[stat]) texts.push(`${who}${stats[stat]}${amount > 0 ? '提高' : '降低'}${Math.abs(amount)}级`);
  }
  return texts;
}
export function buildMoveCatalog(dex: any) {
  return Object.fromEntries(
    dex.moves
      .all()
      .filter((m: any) => m.gen <= 9 && !m.isZ && !m.isMax)
      .map((m: any) => {
        const effects = special[m.id] ? [special[m.id]] : effectText(m, m.target === 'self' ? '自身' : '目标');
        if (!special[m.id]) {
          effects.push(...effectText(m.self, '自身'));
          for (const secondary of m.secondaries ?? []) {
            const text = [...effectText(secondary, '目标'), ...effectText(secondary.self, '自身')].join('，');
            if (text) effects.push(`${secondary.chance ?? 100}%概率：${text}。`);
          }
          if (m.heal) effects.push(`回复自身最大生命值的${m.heal[0]}/${m.heal[1]}。`);
          if (m.drain) effects.push(`回复所造成伤害的${m.drain[0]}/${m.drain[1]}。`);
          if (m.recoil) effects.push(`承受所造成伤害的${m.recoil[0]}/${m.recoil[1]}作为反作用伤害。`);
          if (m.multihit)
            effects.push(Array.isArray(m.multihit) ? `连续攻击${m.multihit[0]}–${m.multihit[1]}次。` : `连续攻击${m.multihit}次。`);
        }
        const name = chineseName('moves', m.id),
          type = chineseName('types', m.type);
        return [
          m.id,
          {
            key: m.id,
            name: /[\u3400-\u9fff]/.test(name) ? name : `招式${m.num}`,
            type,
            category: ({Physical: '物理', Special: '特殊', Status: '变化'} as any)[m.category],
            power: m.basePower || null,
            powerText:
              m.category === 'Status'
                ? '不适用'
                : m.basePower
                  ? String(m.basePower)
                  : m.damage === 'level'
                    ? '等同等级'
                    : typeof m.damage === 'number'
                      ? `固定${m.damage}`
                      : '特殊计算',
            accuracy: m.accuracy === true ? null : m.accuracy,
            pp: m.pp,
            priority: m.priority,
            target: targets[m.target] ?? '由效果决定',
            flags: Object.keys(m.flags)
              .filter((key) => m.flags[key] && flags[key])
              .map((key) => flags[key]),
            effects
          }
        ];
      })
  );
}
