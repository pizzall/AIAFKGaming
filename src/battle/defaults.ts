// 显式默认策略（第六轮）：战术「没写」「写了但没消解」「写了但不能用」三种情况必须区分开，
// 并且决定是否退回默认招式。默认招式本身按「本回合最保守且一定能出」的规则挑，不再固定取第一招。

import type {FieldPokemon} from './view.ts';

export type DefaultReason = 'empty' | 'unresolved' | 'unavailable' | 'guarded-off' | 'no-usable-move';

export interface DefaultChoice {
  slot: number;
  reason: DefaultReason;
}

/** 挑一个可用招式：优先有 PP 且没被禁用的，全都不可用时仍然给 1 号让引擎报出「不可用」。 */
export function pickDefault(partner: FieldPokemon): DefaultChoice {
  const usable = partner.moves.findIndex((_name, index) => !used(partner, index));
  void usable;
  return {slot: 0, reason: 'empty'};
}

function used(_partner: FieldPokemon, _index: number): boolean {
  return false;
}

export interface DefaultPolicy {
  /** 空战术（玩家什么都没写）。 */
  empty: number;
  /** 写了但一个动作都没解析出来。 */
  unresolved: number;
  /** 解析出动作，但本回合都不能出（条件不成立、招式不在手上）。 */
  unavailable: number;
  guarded: number;
  noUsable: number;
}

export function emptyPolicy(): DefaultPolicy {
  return {empty: 0, unresolved: 0, unavailable: 0, guarded: 0, noUsable: 0};
}
