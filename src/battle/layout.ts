// 站位与目标：把「目标词」翻译成引擎能接受的出战位置（1 或 2），处理队友被占用、替换与显式默认策略。
//
// 引擎的规则：
// - 替换命令里的位置是「出战位」（0/1 → 写 1/2），不是队伍下标；
// - 每只宝可梦的替换请求只能出现「还没上过场」的替补，且同一个位置不能出现两次；
// - 相邻单体招式（normal/any）打敌人要写「 1」，打队友要写「 2」；看不到对手队伍与站位。

import type {TargetWord} from './tactics.ts';
import type {FieldPokemon, View} from './view.ts';

/** 对手没有出现在请求里，站位固定为 1 与 2（相邻单体招式可以分别指向它们）。 */
export const FOE_SLOTS = [1, 2] as const;

export function isFoeTarget(target: TargetWord | null): boolean {
  return (
    target === 'foe' || target === 'lowestHp' || target === 'highestHp' || target === 'fastest' ||
    target === 'slowest' || target === 'highestAttack' || target === 'threat'
  );
}

/** 给请求里的招式找一个目标站位；`claimed` 是本回合已经被确认的站位（先到先得）。 */
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
  for (const slot of FOE_SLOTS) if (!claimed.has(slot) && !unavailable.has(slot)) return ` ${slot}`;
  return ' 1';
}

/** 换入的位置：引擎的下标是 side.pokemon 的顺序，不是出战位；这里直接返回下标 +1。 */
export function benchSlot(view: View, wanted: string | null, taken: Set<number>): number {
  const candidates = view.bench.filter((partner) => !taken.has(partner.slot));
  const match = wanted ? candidates.find((partner) => partner.species.replace(/-/g, '') === wanted.replace(/-/g, '')) : null;
  return (match ?? candidates[0])?.slot ?? -1;
}

/** 显式默认策略：请求里第一个可用招式，并且给它一个合法的目标。 */
export function defaultMove(
  request: any,
  partner: FieldPokemon,
  view: View,
  claimed: Set<number>,
  unavailable: Set<number>,
  requestState?: string
): string {
  // 替换请求里不能出招：这时返回空串，交给替换逻辑。
  if (requestState === 'switch') return '';
  const moves = request.active?.[partner.slot - 1]?.moves ?? [];
  const usableSlot = moves.findIndex((move: any) => !move.disabled && move.pp !== 0);
  // 所有招式都被禁用（如被封锁）时，出帧请求里的 1 号招式会让引擎报错，这里改出「挣扎」以外的默认。
  if (usableSlot < 0) return `move 1${moves.length ? targetSuffix(moves[0], null, view, partner, claimed, unavailable) : ''}`;
  return `move ${usableSlot + 1}${targetSuffix(moves[usableSlot], null, view, partner, claimed, unavailable)}`;
}
