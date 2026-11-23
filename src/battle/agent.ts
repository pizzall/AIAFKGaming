// 把拆解出的战术意图接入真实引擎。决策只读取本方请求（request.side，引擎只发本方信息）
// 与自己的文本意图；对手的队伍、招式池和选择从不进入这里。

import type {Engine} from './engine.ts';
import {parseIntent, type ActionIntent, type Intent, type MoveIndex, type TargetWord} from './tactics.ts';
import {readView, type FieldPokemon, type View} from './view.ts';
import {benchSlot, isFoeTarget, targetSuffix} from './layout.ts';

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

/** 把意图里的招式名换算成请求里的招式 ID，便于和 `move.id` 比较。 */
function moveId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slotOf(partner: FieldPokemon, wanted: string): number {
  const id = moveId(wanted);
  return partner.moves.findIndex((name) => moveId(name) === id);
}

/**
 * 第三轮：
 * - 行动队列每次「按优先级重排」：没有被否定、不是前提的动作排在前面，加入队列的先后决定循环顺序；
 * - 队列用 round-robin 推进：每只宝可梦按队列顺序轮流出招，不会一直卡在第一招上；
 * - 目标词按「对手/队友」换成站位 1/2，同一只对手不会被同一回合的两条命令同时选中。
 */
export function createTacticsAgent(dex: typeof Engine.Dex.prototype, tactic: string, index?: MoveIndex): TacticsAgent {
  const intent = parseIntent(tactic, dex, index);
  const decisions: DecisionTrace[] = [];
  /** 每只宝可梦（按出战位）上一次用的是队列里的第几个动作。 */
  const cursors = new Map<number, number>();
  let sequence = 0;
  const ignored = () => [
    ...intent.negated.map((value) => `否定（不选）：${value}`),
    ...intent.exceptions.map((value) => `例外（只记录）：${value}`),
    ...intent.conditions.map((value) => `条件（只记录）：${value}`),
    ...intent.unknown.map((value) => `未识别：${value}`)
  ];
  const queue = () => intent.actions.filter((action) => action.move && !action.conditional && !intent.negated.includes(action.source));
  const plannedSwitch = () => intent.actions.find((action) => action.switchTo && !action.conditional) ?? null;

  const chooseSwitches = (view: View, forceSwitch: boolean[]): string => {
    const taken = new Set<number>();
    const plan = intent.actions.filter((action) => action.switchTo).map((action) => action.switchTo!);
    const parts = forceSwitch
      .map((forced, position) => {
        if (!forced) return 'pass';
        // 战术写的顺序就是换人的先后；同一个替补不会被两次要求换入。
        const wanted = plan.find((name) => !taken.has(benchSlot(view, name, taken))) ?? null;
        const slot = benchSlot(view, wanted, taken);
        if (slot < 0) return 'pass';
        taken.add(slot);
        // 本轮已知不足：引擎不许换入「仍标成 active」的位置，替补紧跟在倒下位置后会直接被拒绝。
        void position;
        return `switch ${slot}`;
      })
      .join(', ');
    return parts;
  };

  return {
    kind: 'tactics',
    intent,
    decisions,
    decide(request: any, requestState?: string): string {
      sequence++;
      if (request.wait) return '';
      const view = readView(request, requestState);
      const forceSwitch = request.forceSwitch ?? (view.state === 'switch' ? [true] : []);
      if (forceSwitch.length) {
        const planned = plannedSwitch();
        const choice = chooseSwitches(view, forceSwitch);
        for (const entry of view.own) if (entry) cursors.delete(entry.slot);
        decisions.push({
          sequence, side: 'p1', choice, ignored: ignored(),
          used: planned ? [`换入${planned.switchTo}`] : [],
          reason: planned ? `按战术换入${planned.switchTo}` : '战术没有写换人目标，按队伍顺序换入'
        });
        return choice;
      }
      const actions = queue();
      const claimed = new Set<number>();
      const used: string[] = [];
      const choice = view.own
        .map((partner) => {
          if (!partner) return 'pass';
          if (!actions.length) {
            // 战术里没有可执行招式：退回请求里的第一个可用招式，保证战斗能继续。
            const moves = request.active[partner.slot - 1]?.moves ?? [];
            const slot = moves.findIndex((move: any) => !move.disabled && move.pp !== 0);
            const index = slot < 0 ? 0 : slot;
            return `move ${index + 1}${targetSuffix(moves[index], null, view, partner, claimed)}`;
          }
          // 队列按平均分布认领：出战位 1 用偶数位、出战位 2 用奇数位，避免两只宝可梦抢同一个动作。
          const offset = partner.slot === 1 ? 0 : 1;
          const cursor = cursors.get(partner.slot) ?? offset;
          for (let step = 0; step < actions.length; step++) {
            const action = actions[(cursor + step) % actions.length]!;
            const slot = slotOf(partner, action.move!);
            if (slot < 0) continue;
            cursors.set(partner.slot, (cursor + step + 1) % actions.length);
            used.push(`${action.source} → ${action.move}`);
            const move = (request.active[partner.slot - 1]?.moves ?? [])[slot];
            const suffix = targetSuffix(move, action.target, view, partner, claimed);
            if (/adjacentFoe|normal|any/.test(String(move?.target))) {
              const picked = suffix.trim() ? Number(suffix.trim()) : NaN;
              if (!Number.isNaN(picked)) claimed.add(picked);
            }
            return `move ${slot + 1}${suffix}`;
          }
          // 队列里没有这只宝可梦会的招式：退回默认招式。
          const moves = request.active[partner.slot - 1]?.moves ?? [];
          const slot = moves.findIndex((move: any) => !move.disabled && move.pp !== 0);
          const index = slot < 0 ? 0 : slot;
          void isFoeTarget;
          return `move ${index + 1}${targetSuffix(moves[index], null, view, partner, claimed)}`;
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

export type {ActionIntent, TargetWord};
