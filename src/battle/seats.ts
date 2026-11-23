// 第十轮：替换位置 → 引擎出战位（只读本方请求）。
//
// 引擎的替换命令按「出战位」解释，而它拒收 `slot < 该队 active 长度` 的位置：
//  - 双倒（active 为空/两只 0 fnt）：两个位置都空，按 1、2 顺序补；
//  - 单只倒下：引擎以为另一个位置仍站人（即使请求里 active 为空），命令里的两个位置都会被拒。
//    本环境实测：单只倒下时任何 `switch N` 都会被引擎拒绝，所以这里如实给出「可能被拒」的候选，
//    由适配层记录「替换失败」而不是伪装成成功。
// 这里只读 `view`（来自本方请求），不碰对手。

import type {View} from './view.ts';

export interface SeatPlan {
  /** 候选出战位（按顺序）。 */
  seats: number[];
  /** 仍被引擎认定为站人的位置。 */
  blocked: number[];
  reason: 'planned' | 'order' | 'blocked';
}

/** 这次要补几个位置：双倒 2 个，其余 1 个；最多两个（双打）。 */
export function holesOf(forceSwitch: boolean[] | undefined, view: View): number {
  if (forceSwitch?.length) return forceSwitch.filter(Boolean).length;
  const standing = view.own.filter((mate) => mate && !mate.fainted).length;
  return Math.max(1, Math.min(2, 2 - Math.min(2, standing)));
}

/**
 * 候选出战位：从「还站着的上场位置数 + 1」开始，最多两个位置。
 * 双倒时 standing 为 0 → 1、2；单只倒下时 standing 为 1 → 2（会撞上引擎的 1 号位拒绝，如实记录）。
 */
export function planSeats(holes: number, wanted: string | null, view: View): SeatPlan {
  const match = wanted ? view.bench.find((mate) => mate.species.replace(/-/g, '') === wanted.replace(/-/g, '')) : null;
  // 本环境实测：只要替换时另一只还在场上，引擎就把两个位置都当成「有人」而拒收；
  // 所以最稳的候选是「引擎以为空着的第一个位置」——双倒时是 1，其余情况是先试 1、被拒再试 2。
  const blocked = view.activeMarkers.size ? [...view.activeMarkers].map((index) => index + 1) : [];
  const seats = [1, 2].slice(0, Math.max(1, Math.min(2, holes)));
  return {seats, blocked, reason: match ? 'planned' : 'order'};
}
