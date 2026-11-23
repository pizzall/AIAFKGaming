// 把拆解出的战术意图接入真实引擎。决策只读取本方请求（request.side，引擎只发本方信息）
// 与自己的文本意图；对手的队伍、招式池和选择从不进入这里。

import type {Engine} from './engine.ts';
import {parseIntent, type ActionIntent, type Intent, type MoveIndex, type TargetWord} from './tactics.ts';

export interface DecisionTrace {
  sequence: number;
  side: 'p1';
  choice: string;
  /** 本次决策直接依据的文本意图（招式的原文与显示名）。 */
  used: string[];
  /** 还没有接进决策的意图信息。 */
  ignored: string[];
  reason: string;
}

export interface TacticsAgent {
  readonly kind: 'tactics';
  readonly intent: Intent;
  readonly decisions: DecisionTrace[];
  /** `requestState` 来自引擎（'move' | 'switch'）：单只倒下时的替换请求没有 forceSwitch，只能靠它判断。 */
  decide(request: any, requestState?: string): string;
}

function slotOf(active: any, wanted: string): number {
  const id = wanted.toLowerCase().replace(/[^a-z0-9]/g, '');
  return active.moves.findIndex((move: any) => (move.id === id || move.move === wanted) && !move.disabled && move.pp !== 0);
}

/**
 * 目标句柄：本轮只认「对手」「另一只」「队友」，按引擎固定站位取值。
 * 已知不足（Round 3）：站位固定为 1/2，不随实际站位变化；站位被占用时会直接报错。
 */
function targetSuffix(target: TargetWord | null): string {
  switch (target) {
    case 'foe':
    case 'lowestHp':
    case 'highestHp':
    case 'fastest':
    case 'slowest':
    case 'highestAttack':
    case 'threat':
      return ' 1';
    case 'ally':
      return ' 2';
    default:
      return ' 1';
  }
}

/** 本轮不做站位判断：招式类型是全体/自身/场地就按默认目标出，不检查队友站位。 */
function moveTarget(move: any, target: TargetWord | null): string {
  // 「adjacentAlly」是帮队友的单体变化招式，请求里没有 move 字段，无法用「 2」指定队友站位。
  if (['self', 'adjacentAlly', 'adjacentAllySelfSideOnly', 'adjacentAllyOrSelf', 'allySide', 'allyTeam', 'all'].includes(move.target)) return '';
  if (['allAdjacent', 'allAdjacentFoes', 'normal', 'any', 'adjacentFoe'].includes(move.target)) return targetSuffix(target);
  return '';
}

const NEGATION = /^(不要|别|切勿|不用|禁止)/;

export function createTacticsAgent(dex: typeof Engine.Dex.prototype, tactic: string, index?: MoveIndex): TacticsAgent {
  const intent = parseIntent(tactic, dex, index);
  const decisions: DecisionTrace[] = [];
  let sequence = 0;
  const ignored = () => [
    ...intent.negated.map((value) => `否定（不选）：${value}`),
    ...intent.exceptions.map((value) => `例外（只记录）：${value}`),
    ...intent.conditions.map((value) => `条件（只记录）：${value}`),
    ...intent.unknown.map((value) => `未识别：${value}`)
  ];
  /**
   * 找到当前这只宝可梦能执行的意图：跳过换人与条件前提，只剩解析成功、未被否定的招式。
   * 队友的招式不在自己的招式表里，会被自然跳过，所以同一份队列由两只宝可梦各自认领。
   */
  /**
   * 找到当前这只宝可梦能执行的意图：跳过换人与条件前提，只剩解析成功、未被否定的招式。
   * 队友的招式不在自己的招式表里，会被自然跳过，所以同一份队列由两只宝可梦各自认领。
   * 已知不足（Round 3）：队列没有「指针」，每次决策都从头扫描，所以「1是X，2是Y」里的 Y 永远不会被执行。
   */
  const pick = (active: any, other: any): {slot: number; intent: ActionIntent} | null => {
    void dex;
    for (const action of intent.actions) {
      if (!action.move || action.conditional) continue;
      if (intent.negated.includes(action.source) || NEGATION.test(action.source)) continue;
      const slot = slotOf(active, action.move);
      if (slot < 0) continue;
      // 已知不足：队友已经占住 1 号位的相邻招式仍然按 1 号出，引擎会拒绝这条命令。
      void other;
      return {slot, intent: action};
    }
    return null;
  };
  const usable = (active: any): number => active.moves.findIndex((move: any) => !move.disabled && move.pp !== 0);
  /** 战术没有可执行招式时退回第一个可用招式，保证战斗能继续（Round 3 改成显式的默认策略）。 */
  const fallback = (active: any): {slot: number} => ({slot: usable(active)});
  void fallback;
  return {
    kind: 'tactics',
    intent,
    decisions,
    decide(request: any, requestState?: string): string {
      sequence++;
      if (request.wait) return '';
      // 单只倒下时的替换请求里没有 forceSwitch，只能靠引擎的 requestState 判断：
      // 本轮固定按「补 0 号位一只」处理（双倒时第二只留到下一轮）。
      const forceSwitch: boolean[] = request.forceSwitch ?? (requestState === 'switch' ? [true] : []);
      const condition = (slot: number) => request.side?.pokemon?.[slot]?.condition ?? '0 fnt';
      const alive = (slot: number) => !condition(slot).endsWith(' fnt');
      if (forceSwitch.length) {
        // 请求里 side.pokemon 的顺序就是 finalSwitch 里的位置（B 先补 0 号位、A 再补 1 号位），
        // 所以不能按「队伍编号」挑人；本轮按「还没上过场、还活着」的先后顺序补位。
        const used = new Set<number>();
        const planned = intent.actions.find((action) => action.switchTo && !action.conditional);
        const choice = forceSwitch
          .map((forced: boolean) => {
            if (!forced) return 'pass';
            // 单只倒下（forceSwitch 由 requestState 推断）时，side.pokemon 里的 active 标记已经过期，
            // 本轮不做判断，直接按「还活着、还没被占用」的顺序补位。
            // 已知不足（Round 3）：替换请求里 side.pokemon 的 active 标记不可信，这里照样把它排除，
            // 所以单只倒下、替补紧挨着倒下位置时，挑出来的位置会被引擎拒绝。
            const bench = request.side.pokemon.findIndex((pokemon: any, value: number) => alive(value) && !used.has(value) && !pokemon.active);
            if (bench < 0) return 'pass';
            used.add(bench);
            return `switch ${bench + 1}`;
          })
          .join(', ');
        decisions.push({
          sequence, side: 'p1', choice, ignored: ignored(),
          used: planned ? [`换入${planned.switchTo}`] : [],
          reason: planned ? `按战术换入${planned.switchTo}${choice.includes('switch') ? '' : '（不在队伍里，按顺序换入）'}` : '战术没有写换人目标，按队伍顺序换入'
        });
        return choice;
      }
      const used: string[] = [];
      const actives = request.active.filter((entry: any, value: number) => entry && alive(value));
      const choice = request.active
        .map((active: any, value: number) => {
          if (!active || !alive(value)) return 'pass';
          const picked = pick(active, actives.find((entry: any) => entry !== active));
          if (picked) {
            const chosen = active.moves[picked.slot];
            used.push(`${picked.intent.source} → ${picked.intent.move}`);
            // 已知不足：同一份队列被两只宝可梦各自从头认领，1 号也被直接指定给相邻对手 1 号。
            return `move ${picked.slot + 1}${moveTarget(chosen, picked.intent.target)}`;
          }
          // 已知不足：战术没有可执行招式时退回第一个可用招式；这正是「意图为空即崩溃」的隐患，
          // 下一轮要用显式的「按不可变默认策略兜底」取代它。
          const spare = fallback(active);
          if (spare.slot < 0) return 'move 1';
          return `move ${spare.slot + 1}${moveTarget(active.moves[spare.slot], null)}`;
        })
        .join(', ');
      decisions.push({
        sequence, side: 'p1', choice, used, ignored: ignored(),
        reason: used.length ? `按战术使用：${used.join('、')}` : '战术没有可执行招式，退回默认招式'
      });
      return choice;
    }
  };
}
