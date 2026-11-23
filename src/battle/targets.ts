// 目标比较：把「体力最低」「速度最快」「威胁最大」「另一只」落到引擎的对手站位（1 或 2）。
//
// 能看到的信息：对手的物种、体力百分比、身上状态与能力变化（来自本方可见日志），
// 以及招式本身的类型与威力（来自引擎数据）。看不到的信息：对手的招式池、道具、特性（本轮）。
// 比较不了的依据会显式写进 `unscored`，不会把「比较不了」当成「随便挑」。

import type {Engine} from './engine.ts';
import type {TargetWord} from './tactics.ts';
import type {FoeKnown} from './opponent.ts';

export interface FoeTarget {
  slot: 1 | 2;
  score: number;
  reason: string;
}

export interface TargetDecision {
  target: FoeTarget;
  /** 用到的依据。 */
  basis: string[];
  /** 本轮无法比较而放弃的依据（例如对手速度）。 */
  unscored: string[];
}

export interface FoeView {
  slot: 1 | 2;
  hpPercent: number;
  fainted: boolean;
  species: string;
}

export interface CompareInput {
  dex: typeof Engine.Dex.prototype;
  /** 对手两只的物种与体力百分比（来自 view 或日志）。 */
  foes: FoeView[];
  /** 已经在本回合被另一只队友选中的站位。 */
  claimed: Set<number>;
  known: FoeKnown;
  /** 招式数据：用来估计「威胁」。 */
  move: any;
  /** 攻击方的攻击/特攻（本方请求里有）。 */
  attack: number;
}

/** 招式威胁：基础威力 × 属性倍率；变化招式记 0（不猜它的实际收益）。 */
export function moveThreat(dex: typeof Engine.Dex.prototype, move: any, foeTypes: string[]): number {
  if (!move || !foeTypes.length) return 0;
  if (Number(move.basePower) <= 0) return 0;
  const multiplier = foeTypes.reduce(
    (product, type) => product * Number(dex.getEffectiveness(String(move.type), {getTypes: () => [type]}) ?? 1),
    1
  );
  return Number(move.basePower) * multiplier;
}

function threatOf(input: CompareInput, species: string): number {
  const data = input.dex.species.get(species);
  return moveThreat(input.dex, input.move, data.exists ? [...data.types] : []);
}

/**
 * 目标比较。优先级：已倒下 > 已被队友占用；其余按目标词打分。
 * 「威胁最大」用「我的招式打它最疼」估计；「攻击最高」在没有对手攻击值时用同一个近似并记录。
 */
export function compareFoes(word: TargetWord | null, input: CompareInput): TargetDecision {
  const basis: string[] = [];
  const unscored: string[] = [];
  const alive = input.foes.filter((foe) => !foe.fainted && !input.claimed.has(foe.slot));
  const pool = alive.length ? alive : input.foes.filter((foe) => !foe.fainted);
  if (!pool.length) return {target: {slot: 1, score: 0, reason: '没有目标'}, basis, unscored: ['两只对手都已倒下']};
  if (word === 'foeSecond' || word === 'foeBoth') unscored.push('「另一只/前两个」这类复数写法本轮还不支持按数量展开');
  const score = (foe: FoeView): number => {
    switch (word) {
      case 'lowestHp':
        basis.push(`${foe.slot}号体力 ${foe.hpPercent}%`);
        return -foe.hpPercent;
      case 'highestHp':
        basis.push(`${foe.slot}号体力 ${foe.hpPercent}%`);
        return foe.hpPercent;
      case 'fastest':
        // 请求里没有对手速度：只有日志里出现「速度提高」时才敢比较，否则放弃。
        if (!input.known.boosts.has('spe')) {
          unscored.push('对手速度看不到，无法比较「速度最快」，按书写顺序取 1 号');
          return 0;
        }
        basis.push(`1号速度变化 ${input.known.boosts.get('spe')}`);
        return input.known.boosts.get('spe') ?? 0;
      case 'slowest':
        unscored.push('对手速度看不到，无法比较「最慢」');
        return 0;
      case 'highestAttack':
        unscored.push('对手攻击值看不到，改用「我方招式对它的伤害倍率」近似');
        return threatOf(input, foe.species);
      case 'threat': {
        const value = threatOf(input, foe.species);
        basis.push(`${foe.slot}号：我方招式伤害估计 ×${value.toFixed(0)}`);
        return value;
      }
      default:
        return 0;
    }
  };
  const ranked = pool.map((foe) => ({slot: foe.slot, score: score(foe)})).sort((a, b) => b.score - a.score);
  const first = ranked[0]!;
  return {target: {...first, reason: word ?? 'foe'}, basis, unscored};
}

export type {TargetWord};
