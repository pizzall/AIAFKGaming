// 站位与目标：把「目标词」翻译成引擎能接受的出战位置（1 或 2），并处理队友被占用、队友招式与保护。
//
// 引擎的规则：替换请求里仍有 active 标记的位置不能直接换入；同一只队友不能被两条命令同时选中；
// 相邻单体招式（normal/any）如果目标是队友要说「 2」，如果是敌人要说「 1」；队友被占就换另一只对手。

import type {TargetWord} from './tactics.ts';
import type {FieldPokemon, View} from './view.ts';

/** 对手没有出现在请求里，所以「两只对手」的站位固定为 1 与 2。 */
export const FOE_SLOTS = [1, 2] as const;

export function isFoeTarget(target: TargetWord | null): boolean {
  return (
    target === 'foe' ||
    target === 'lowestHp' ||
    target === 'highestHp' ||
    target === 'fastest' ||
    target === 'slowest' ||
    target === 'highestAttack' ||
    target === 'threat'
  );
}

/** 给定本方在场信息与占位集合，返回引擎要的「 1」「 2」或空串。 */
export function targetSuffix(move: any, target: TargetWord | null, view: View, self: FieldPokemon, claimed: Set<number>): string {
  if (!move) return '';
  if (['self', 'all', 'allAdjacentFoes', 'allAdjacent', 'foeSide', 'allySide', 'allyTeam'].includes(move.target)) return '';
  // 「让我方」/「帮我方」是帮队友的单体变化招式，请求里没有 move 字段，不能用「 2」指定队友站位。
  if (move.target === 'adjacentAlly' || move.target === 'adjacentAllyOrSelf') return '';
  if (!['normal', 'any', 'adjacentFoe'].includes(move.target)) return '';
  // 已知不足（Round 4）：目标只区分「队友/对手」，没有区分「另一只对手」，也没有被占用的站位回退到另一只。
  void isFoeTarget(target);
  for (const slot of FOE_SLOTS) if (!claimed.has(slot)) return ` ${slot}`;
  return ' 1';
}

/**
 * 选择要换入的位置：优先战术点名的宝可梦。
 * 引擎不允许换入「当前仍标成 active」的位置（单只倒下时替补常常紧挨着倒下位置），这里没有绕开。
 */
export function benchSlot(view: View, wanted: string | null, taken: Set<number>): number {
  const alive = view.bench.filter((partner) => !taken.has(partner.slot));
  const match = wanted ? alive.find((partner) => partner.species.replace(/-/g, '') === wanted.replace(/-/g, '')) : null;
  return (match ?? alive[0])?.slot ?? -1;
}
