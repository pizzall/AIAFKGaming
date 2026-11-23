// 把拆解出的战术意图接入真实引擎。决策只读取本方请求（request.side，引擎只发本方信息）
// 与自己的文本意图；对手的队伍、招式池和选择从不进入这里。

import type {Engine} from './engine.ts';
import {parseIntent, type ActionIntent, type Intent, type MoveIndex, type Negation} from './tactics.ts';
import {readView, type FieldPokemon, type View} from './view.ts';
import {benchSlot, FOE_SLOTS, targetSuffix} from './layout.ts';
import {evaluate, readCondition, type Plan} from './plan.ts';

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
  /** 第二遍定位后的计划（条件、例外、不可验证的条件）。 */
  readonly plan: Plan;
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
 * 第四轮：
 * - 否定按「作用域」扩大：`不要 A，B` 里 A 与 B 都被否掉，直到句号或下一个动词短语；
 * - 「否则不要冒险」整句剩下的动作都被否掉，而不是只吞掉一个；
 * - 换人避开「仍标成 active」的位置；目标优先未被占用、未倒下的对手；
 * - 条件在第二遍用 `plan.ts` 重新定位，看不到的证据一律标成不可验证。
 */
export function createTacticsAgent(dex: typeof Engine.Dex.prototype, tactic: string, index?: MoveIndex): TacticsAgent {
  const intent = parseIntent(tactic, dex, index);
  const plan: Plan = {actions: intent.actions.slice(), guarded: [], exceptions: [], conditions: [], unverifiable: []};
  for (const text of intent.conditions) {
    const condition = readCondition(text);
    if (!condition) continue;
    if (condition.kind === 'foe-hp' || condition.kind === 'foe-alive' || condition.kind === 'weather') {
      plan.unverifiable.push({...condition, unverifiable: '请求里没有对手队伍、招式与天气事件，只能看到确认倒下的对手'});
      continue;
    }
    plan.conditions.push(condition);
  }
  for (const match of tactic.matchAll(/(?:除非)(.+?)[,，。](?:否则|就|则)?(.+)/g)) {
    const when = readCondition(match[1]!);
    if (!when) continue;
    plan.exceptions.push({when, text: match[0], action: {move: null, switchTo: null, source: match[2]!.trim()}});
  }
  const decisions: DecisionTrace[] = [];
  const cursors = new Map<number, number>();
  let sequence = 0;
  const ignored = () => [
    ...intent.negated.map((value) => `否定（不选）：${value.text ?? value}`),
    ...intent.exceptions.map((value) => `例外：${value}`),
    ...intent.unknown.map((value) => `未识别：${value}`),
    ...plan.unverifiable.map((value) => `不可验证：${value.text}`)
  ];
  const queue = () => intent.actions.filter((action) => action.move && !action.conditional && !isNegated(intent.negated, action));
  const plannedSwitch = () => intent.actions.find((action) => action.switchTo && !isNegated(intent.negated, action)) ?? null;

  /** 本轮用什么填替补：战术点名的人还是「下一个替补」；同时记下原因。 */
  const chooseSwitches = (view: View, forceSwitch: boolean[]): {choice: string; used: string[]} => {
    const taken = new Set<number>();
    const planned = intent.actions.filter((action) => action.switchTo && !isNegated(intent.negated, action)).map((action) => action.switchTo!);
    const used: string[] = [];
    // 替换请求可能不带 forceSwitch（单只倒下时只有 `view.state === 'switch'`），这时由调用方补 [true]。
    // 本轮一次只补一个出战位：位置取「请求里没有给出的那个出战位」（0 号补 1，1 号补 2）。
    const slots = forceSwitch.length ? forceSwitch : [true];
    const targetSeat = view.own[0] ? 2 : 1;
    const wanted = planned.find((name) => {
      const slot = benchSlot(view, name, taken).slot;
      return slot >= 0 && !taken.has(slot);
    });
    const chosen = benchSlot(view, wanted ?? null, taken);
    if (chosen.slot < 0) return {choice: '', used: []};
    taken.add(chosen.slot);
    used.push(
      chosen.reason === 'blocked'
        ? `换入${chosen.slot}号替补（点名位置被引擎标记挡住，没有别的位置可换）`
        : wanted
          ? `换入${wanted}（按战术）`
          : `换入${chosen.slot}号替补（战术没有点名，按顺序）`
    );
    // 已知不足：位置按「第几个替补」直接给，没有映射到引擎要求的出战位；单只倒下时会被引擎拒绝。
    const seat = chosen.slot;
    void targetSeat;
    const choice = slots.slice(0, 1).map((forced) => (forced ? `switch ${seat}` : 'pass')).join(', ');
    return {choice, used};
  };

  return {
    kind: 'tactics',
    intent,
    plan,
    decisions,
    decide(request: any, requestState?: string): string {
      sequence++;
      if (request.wait) return '';
      const view = readView(request, requestState);
      // 替换请求里没有 active（或 active 为空）时，只说明「有一个位置要补」；
      // 双倒时两个位置都空着，这一轮只补一个，另一个会被引擎当作未完成（这正是本轮已知不足）。
      const forceSwitch: boolean[] = request.forceSwitch ?? (view.state === 'switch' ? [true] : []);
      if (forceSwitch.length) {
        const planned = plannedSwitch();
        const swapped = chooseSwitches(view, forceSwitch);
        for (const entry of view.own) if (entry) cursors.delete(entry.slot);
        decisions.push({
          sequence, side: 'p1', choice: swapped.choice, ignored: ignored(),
          used: planned ? [`换入${planned.switchTo}`] : [],
          reason: planned ? `按战术换入${planned.switchTo}${swapped.choice ? '' : '（席位冲突，少补一人）'}` : `战术没有写换人目标，按队伍顺序换入${swapped.used.length ? '' : '（没有替补）'}`
        });
        return swapped.choice;
      }
      void forceSwitch;
      const actions = queue();
      const claimed = new Set<number>();
      const fainted = new Set<number>();
      const used: string[] = [];
      const choice = view.own
        .map((partner) => {
          if (!partner) return 'pass';
          if (!actions.length) return defaultMove(request, partner, view, claimed, fainted);
          const offset = partner.slot === 1 ? 0 : 1;
          const cursor = cursors.get(partner.slot) ?? offset;
          for (let step = 0; step < actions.length; step++) {
            const action = actions[(cursor + step) % actions.length]!;
            const slot = slotOf(partner, action.move!);
            if (slot < 0) continue;
            const moves = request.active[partner.slot - 1]?.moves ?? [];
            const move = moves[slot];
            if (move?.disabled) continue;
            cursors.set(partner.slot, (cursor + step + 1) % actions.length);
            used.push(`${action.source} → ${action.move}`);
            const held = plan.guarded.find((entry) => entry.action === action);
            const suffix = targetSuffix(move, action.target, view, partner, claimed, fainted);
            claim(claimed, suffix);
            if (held) used.push(`条件：${held.condition.text}`);
            return `move ${slot + 1}${suffix}`;
          }
          return defaultMove(request, partner, view, claimed, fainted);
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

function isNegated(negated: Negation[], action: ActionIntent): boolean {
  return negated.some((value) => value.text === action.source || value.actions.includes(action.source));
}

function claim(claimed: Set<number>, suffix: string): void {
  const slot = Number(suffix.trim());
  if (!Number.isNaN(slot) && slot > 0) claimed.add(slot);
}

/** 默认策略：第一个未禁用、有 PP 的招式；全被禁用时用 Struggle 以外的第一个招式让引擎给出结果。 */
function defaultMove(request: any, partner: FieldPokemon, view: View, claimed: Set<number>, fainted: Set<number>): string {
  const moves = request.active[partner.slot - 1]?.moves ?? [];
  const slot = moves.findIndex((move: any) => !move.disabled && move.pp !== 0);
  void FOE_SLOTS;
  return `move ${(slot < 0 ? 0 : slot) + 1}${targetSuffix(moves[slot < 0 ? 0 : slot], null, view, partner, claimed, fainted)}`;
}

export type {ActionIntent};
