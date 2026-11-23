// 站位与目标：把「目标词」翻译成引擎能接受的出战位置（1 或 2），并处理队友被占用、队友招式、替换与默认策略。

import type {TargetWord} from './tactics.ts';
import type {FieldPokemon, View} from './view.ts';

/** 对手没有出现在请求里，站位固定为 1 与 2。 */
export const FOE_SLOTS = [1, 2] as const;

export function isFoeTarget(target: TargetWord | null): boolean {
  return (
    target === 'foe' || target === 'lowestHp' || target === 'highestHp' || target === 'fastest' ||
    target === 'slowest' || target === 'highestAttack' || target === 'threat'
  );
}

/** 给定本方在场信息、未命中名单与占位集合，返回引擎要的「 1」「 2」或空串（先到先得）。 */
export function targetSuffix(
  move: any,
  target: TargetWord | null,
  view: View,
  self: FieldPokemon,
  claimed: Set<number>,
  unavailable: Set<number> = new Set()
): string {
  if (!move) return '';
  if (['self', 'all', 'allAdjacentFoes', 'allAdjacent', 'foeSide', 'allySide', 'allyTeam'].includes(move.target)) return '';
  // 队友招式在请求里没有 move 字段，不能写「 2」；本轮不处理「帮我方」类招式。
  if (move.target === 'adjacentAlly' || move.target === 'adjacentAllyOrSelf') return '';
  if (!['normal', 'any', 'adjacentFoe'].includes(move.target)) return '';
  if (target === 'ally') {
    const ally = view.own.find((entry) => entry && entry.slot !== self.slot);
    return ally && !claimed.has(ally.slot) ? ` ${ally.slot}` : '';
  }
  // 对手的招式与选择看不到，所以只按「已确认倒下的对手」排除目标；被占用的对手换另一只。
  for (const slot of FOE_SLOTS) if (!claimed.has(slot) && !unavailable.has(slot)) return ` ${slot}`;
  return ' 1';
}

export interface BenchChoice {
  slot: number;
  reason: 'planned' | 'order' | 'blocked';
  /** 被引擎标记挡住的位置（在新一轮请求里不能直接换入）。 */
  blocked: number[];
}

/**
 * 选择要换入的位置（`taken` 里存的是引擎下标）：
 * 1. 优先战术点名的宝可梦；
 * 2. 引擎不许换入「仍标成 active」的位置，所以先挑没有被标记、没有被占用的替补；
 * 3. 全部被标记时退回第一个替补（引擎会拒绝，但不至于选一个已经被占用的位置）。
 * 本轮已知不足：位置是按「第几个替补」不断往后挪，而不是按引擎真正要求补的那个出战位。
 */
export function benchSlot(view: View, wanted: string | null, taken: Set<number>): BenchChoice {
  const candidates = view.bench.filter((partner) => !taken.has(partner.slot - 1));
  const free = candidates.filter((partner) => !view.activeMarkers.has(partner.slot - 1));
  const match = wanted ? free.find((partner) => partner.species.replace(/-/g, '') === wanted.replace(/-/g, '')) : null;
  if (match) return {slot: match.slot, reason: 'planned', blocked: []};
  if (free[0]) return {slot: free[0].slot, reason: wanted ? 'blocked' : 'order', blocked: []};
  const first = candidates[0];
  return first ? {slot: first.slot, reason: 'blocked', blocked: [first.slot - 1]} : {slot: -1, reason: 'order', blocked: []};
}

/** 只看得见的对手信息：本方视角里看不到对手的招式、选择与道具。 */
export function faintedFoes(fainted: Set<number>): Set<number> {
  return new Set(fainted);
}
