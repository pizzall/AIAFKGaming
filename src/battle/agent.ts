// 把拆解出的战术意图接入真实引擎。决策只读取本方请求（request.side，引擎只发本方信息）、
// 自己的文本意图、以及前几个回合事件里出现的对手信息。

import type {Engine} from './engine.ts';
import {parseIntent, type ActionIntent, type Intent, type MoveIndex, type Negation} from './tactics.ts';
import {readView, type View} from './view.ts';
import {benchSlot, defaultMove, targetSuffix} from './layout.ts';
import {allows, rebuildPlan, type Plan} from './plan.ts';
import {emptyFoeInfo, foldFoeEvents, type FoeInfo} from './opponent.ts';

export interface DecisionTrace {
  sequence: number;
  side: 'p1';
  choice: string;
  /** 本次决策直接依据的文本意图（招式的原文与显示名）。 */
  used: string[];
  /** 本次决策中没有接进决策、或无法验证的信息。 */
  ignored: string[];
  reason: string;
}

export interface TacticsAgent {
  readonly kind: 'tactics';
  readonly intent: Intent;
  readonly plan: Plan;
  readonly decisions: DecisionTrace[];
  /** 每次决策前把上一回合的本方事件交给 agent；只读 `p2…` 行。 */
  observe(events: string[]): void;
  decide(request: any, requestState?: string): string;
}

function moveId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slotOf(partner: {moves: string[]}, wanted: string): number {
  const id = moveId(wanted);
  return partner.moves.findIndex((name) => moveId(name) === id);
}

export function createTacticsAgent(dex: typeof Engine.Dex.prototype, tactic: string, index?: MoveIndex): TacticsAgent {
  const intent = parseIntent(tactic, dex, index);
  const {plan, unavailable} = rebuildPlan({actions: intent.actions, conditions: intent.conditions, turn: 0, index, dex});
  const decisions: DecisionTrace[] = [];
  const cursors = new Map<number, number>();
  let foes: FoeInfo = emptyFoeInfo();
  let turn = 0;
  let sequence = 0;
  const ignored = () => [
    ...intent.negated.map((value) => `否定（不选）：${value.text}`),
    ...intent.exceptions.map((value) => `例外（只记录）：${value}`),
    ...intent.unknown.map((value) => `未识别：${value}`),
    ...plan.unverifiable.map((value) => `不可验证：${value.text}`),
    ...unavailable.map((value) => `${value.kind}（未解析）：${value.text}`),
    ...plan.claims.map((value) => `负向判断（无法验证）：${value.text}`)
  ];
  const isNegated = (negated: Negation[], action: ActionIntent) =>
    negated.some((value) => value.text === action.source || value.actions.includes(action.source));
  const queue = () => plan.actions.filter((action) => action.move && !action.conditional && !isNegated(intent.negated, action));
  const plannedSwitch = () => plan.actions.find((action) => action.switchTo && !isNegated(intent.negated, action)) ?? null;

  const chooseSwitches = (view: View, forceSwitch: boolean[]): {choice: string; used: string[]} => {
    const taken = new Set<number>();
    const wantedList = plan.actions.filter((action) => action.switchTo && !isNegated(intent.negated, action)).map((action) => action.switchTo!);
    const used: string[] = [];
    const slots = forceSwitch.length ? forceSwitch : [true];
    const choice = slots
      .map(() => {
        const wanted = wantedList.find((name) => !taken.has(benchSlot(view, name, taken)));
        const slot = benchSlot(view, wanted ?? null, taken);
        if (slot < 0) return 'pass';
        taken.add(slot);
        used.push(wanted ? `换入${wanted}（按战术）` : `换入${slot}号替补（按顺序）`);
        // 引擎的替换位置是 side.pokemon 的下标：slot 已经是 1 起算的出战下标。
        return `switch ${slot}`;
      })
      .join(', ');
    return {choice, used};
  };

  return {
    kind: 'tactics',
    intent,
    plan,
    decisions,
    observe(events: string[]): void {
      // 只收 `p2…` 行：对手出现了哪个招式、哪只倒下；请求里没有的这些信息只能从事件里学。
      foes = foldFoeEvents(foes, events);
    },
    decide(request: any, requestState?: string): string {
      sequence++;
      turn = Math.max(turn, Number(request.turn ?? 0) || 0);
      if (request.wait) return '';
      const view = readView(request, requestState);
      const forceSwitch: boolean[] = request.forceSwitch ?? (view.state === 'switch' ? [true] : []);
      if (forceSwitch.length) {
        const planned = plannedSwitch();
        const swapped = chooseSwitches(view, forceSwitch);
        for (const entry of view.own) if (entry) cursors.delete(entry.slot);
        decisions.push({
          sequence, side: 'p1', choice: swapped.choice, ignored: ignored(),
          used: planned ? [`换入${planned.switchTo}`] : [],
          reason: planned ? `按战术换入${planned.switchTo}` : '战术没有写换人目标，按顺序换入'
        });
        return swapped.choice;
      }
      const actions = queue();
      const claimed = new Set<number>();
      const unavailableFoes = new Set<number>();
      const used: string[] = [];
      const choice = view.own
        .map((partner) => {
          if (!partner) return 'pass';
          if (!actions.length) return defaultMove(request, partner, view, claimed, unavailableFoes);
          const cursor = cursors.get(partner.slot) ?? (partner.slot === 1 ? 0 : 1);
          for (let step = 0; step < actions.length; step++) {
            const action = actions[(cursor + step) % actions.length]!;
            const slot = slotOf(partner, action.move!);
            if (slot < 0) continue;
            const moves = request.active[partner.slot - 1]?.moves ?? [];
            if (moves[slot]?.disabled) continue;
            // 条件不成立就跳过：这就是「如果我方 1 号体力低于 50%，使用守住」在满血时不出手的原因。
            if (!allows(plan, action, view, turn, foes)) continue;
            cursors.set(partner.slot, (cursor + step + 1) % actions.length);
            used.push(`${action.source} → ${action.move}`);
            const suffix = targetSuffix(moves[slot], action.target, view, partner, claimed, unavailableFoes);
            const picks = Number(suffix.trim());
            if (!Number.isNaN(picks)) claimed.add(picks);
            return `move ${slot + 1}${suffix}`;
          }
          return defaultMove(request, partner, view, claimed, unavailableFoes);
        })
        .join(', ');
      decisions.push({
        sequence, side: 'p1', choice, used, ignored: ignored(),
        reason: used.length ? `按战术使用：${used.join('、')}` : '战术没有可执行招式，按默认策略'
      });
      return choice;
    }
  };
}
