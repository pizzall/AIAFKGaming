// 把拆解出的战术意图接入真实引擎。决策只读取本方请求（request.side，引擎只发本方信息）、
// 自己的文本意图、以及前几个回合事件里出现的对手信息（对手招式、倒下、能力变化、物种与体力）。

import type {Engine} from './engine.ts';
import {parseIntent, type ActionIntent, type Intent, type MoveIndex, type Negation} from './tactics.ts';
import {readView, type FieldPokemon, type View} from './view.ts';
import {benchSlot, defaultMove, targetSuffix} from './layout.ts';
import {allows, rebuildPlan, type Plan} from './plan.ts';
import {emptyFoeInfo, syncFoeEvents, type FoeKnown} from './opponent.ts';
import {compareFoes, type TargetDecision} from './targets.ts';
import {emptyPolicy, type DefaultPolicy} from './defaults.ts';

export interface DecisionTrace {
  sequence: number;
  side: 'p1';
  choice: string;
  /** 本次决策直接依据的文本意图（招式的原文与显示名）。 */
  used: string[];
  /** 本次决策中没有接进决策、或无法验证的信息。 */
  ignored: string[];
  /** 目标比较的依据与放弃项。 */
  targets: string[];
  reason: string;
}

export interface TacticsAgent {
  readonly kind: 'tactics';
  readonly intent: Intent;
  readonly plan: Plan;
  readonly decisions: DecisionTrace[];
  readonly policy: DefaultPolicy;
  /** 每次决策前把「整段本方事件」交给 agent：缺口回合也能补齐，不再只吃增量。 */
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

const FOE_TARGETS = new Set(['lowestHp', 'highestHp', 'fastest', 'slowest', 'highestAttack', 'threat', 'foe', 'foeSecond', 'foeBoth']);

export function createTacticsAgent(dex: typeof Engine.Dex.prototype, tactic: string, index?: MoveIndex): TacticsAgent {
  const intent = parseIntent(tactic, dex, index);
  const {plan, unavailable} = rebuildPlan({actions: intent.actions, conditions: intent.conditions, turn: 0, index, dex});
  const policy = emptyPolicy();
  const decisions: DecisionTrace[] = [];
  const cursors = new Map<number, number>();
  let known: FoeKnown = emptyFoeInfo();
  let consumed = 0;
  let turn = 0;
  let sequence = 0;
  if (!intent.actions.length && !tactic.trim()) policy.empty++;
  if (!intent.actions.length && tactic.trim()) policy.unresolved++;
  const ignored = () => [
    ...intent.negated.map((value) => `否定（不选）：${value.text}${value.condition ? `（除非${value.condition}）` : ''}`),
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

  /** 目标词 → 对手站位；「队友」走 targetSuffix 里的队友分支。 */
  const resolveTarget = (
    action: ActionIntent,
    partner: FieldPokemon,
    view: View,
    move: any,
    claimed: Set<number>,
    unavailableFoes: Set<number>
  ): {suffix: string; trace: TargetDecision | null} => {
    if (!action.target || !FOE_TARGETS.has(action.target) || !['normal', 'any', 'adjacentFoe'].includes(String(move?.target))) {
      return {suffix: targetSuffix(move, action.target, view, partner, claimed, unavailableFoes), trace: null};
    }
    // 请求里没有对手，只能用日志里累积的对手身份、体力百分比与能力变化来比较。
    const foes = [1, 2].map((slot) => {
      const seen = known.roster.get(slot);
      return {slot: slot as 1 | 2, hpPercent: seen?.hpPercent ?? 100, fainted: known.fainted.has(slot as 1 | 2), species: seen?.species ?? ''};
    });
    const decision = compareFoes(action.target, {dex, foes, claimed, known, move, attack: partner.atk ?? 0});
    return {suffix: ` ${decision.target.slot}`, trace: decision};
  };

  const chooseSwitches = (view: View, forceSwitch: boolean[]): {choice: string; used: string[]} => {
    const taken = new Set<number>();
    const wantedList = plan.actions.filter((action) => action.switchTo && !isNegated(intent.negated, action)).map((action) => action.switchTo!);
    const used: string[] = [];
    const slots = forceSwitch.length ? forceSwitch : [true];
    const choice = slots
      .map((forced, seat) => {
        if (!forced) return 'pass';
        const wanted = wantedList.find((name) => !taken.has(benchSlot(view, name, taken)));
        const chosen = benchSlot(view, wanted ?? null, taken);
        if (chosen < 0) return 'pass';
        taken.add(chosen);
        // 引擎的替换命令按「引擎下标」解释；双倒时两个位置要各给一个。已知不足（Round 8）：
        // 单只倒下时这里的下标（如 2）会被引擎当成「1 号位」而拒绝。最多补两个位置。
        if (seat > 1) return '';
        used.push(wanted ? `换入${wanted}（按战术）` : `换入${chosen}号替补（按顺序）`);
        return `switch ${chosen}`;
      })
      .filter((value) => value !== '')
      .join(', ');
    return {choice, used};
  };

  return {
    kind: 'tactics',
    intent,
    plan,
    decisions,
    policy,
    observe(events: string[]): void {
      // 整段事件 + 已消费条数：没有请求的回合（例如替换）不会丢一段。
      const synced = syncFoeEvents(known, events, consumed);
      known = synced.info;
      consumed = synced.consumed;
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
          sequence, side: 'p1', choice: swapped.choice, ignored: ignored(), targets: [], used: planned ? [`换入${planned.switchTo}`] : [],
          reason: planned ? `按战术换入${planned.switchTo}` : '战术没有写换人目标，按顺序换入'
        });
        return swapped.choice;
      }
      const actions = queue();
      const claimed = new Set<number>();
      const unavailableFoes = new Set<number>([...known.fainted]);
      const used: string[] = [];
      const targets: string[] = [];
      const choice = view.own
        .map((partner) => {
          if (!partner) return 'pass';
          if (!actions.length) {
            const reason = !tactic.trim() ? 'empty' : intent.actions.length ? 'unavailable' : 'unresolved';
            policy[reason]++;
            return defaultMove(request, partner, view, claimed, unavailableFoes, requestState);
          }
          const cursor = cursors.get(partner.slot) ?? (partner.slot === 1 ? 0 : 1);
          let guardedMisses = 0;
          for (let step = 0; step < actions.length; step++) {
            const action = actions[(cursor + step) % actions.length]!;
            const slot = slotOf(partner, action.move!);
            if (slot < 0) continue;
            const moves = request.active[partner.slot - 1]?.moves ?? [];
            if (moves[slot]?.disabled) continue;
            // 条件不成立就跳过：这就是「如果我方 1 号体力低于 50%，使用守住」在满血时不出手的原因。
            if (!allows(plan, action, view, turn, known)) {
              guardedMisses++;
              continue;
            }
            cursors.set(partner.slot, (cursor + step + 1) % actions.length);
            used.push(`${action.source} → ${action.move}`);
            const resolved = resolveTarget(action, partner, view, moves[slot], claimed, unavailableFoes);
            if (resolved.trace) targets.push(...resolved.trace.basis, ...resolved.trace.unscored.map((value) => `放弃：${value}`));
            const picks = Number(resolved.suffix.trim());
            if (!Number.isNaN(picks)) claimed.add(picks);
            return `move ${slot + 1}${resolved.suffix}`;
          }
          if (guardedMisses) policy.guarded++;
          else policy.unavailable++;
          return defaultMove(request, partner, view, claimed, unavailableFoes, requestState);
        })
        .join(', ');
      decisions.push({
        sequence, side: 'p1', choice, used, targets, ignored: ignored(),
        reason: used.length ? `按战术使用：${used.join('、')}` : '战术没有可执行招式，按默认策略'
      });
      return choice;
    }
  };
}
