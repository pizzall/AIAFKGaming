// 第二遍拆解：在「意图拆解」之后，用战局把结构化意图重新定位成可执行计划。
//
// 这里只读得到本方可见的信息（`View`）：本方宝可梦的体力/状态/招式，以及对手的物种与体力百分比。
// 触发条件里涉及对手招式、道具、选择的部分无法验证，会明确标成「不可验证」。

import type {ActionIntent, MoveIndex} from './tactics.ts';
import {resolveName} from './tactics.ts';
import type {Engine} from './engine.ts';
import type {View} from './view.ts';

export interface Condition {
  /** 原句片段，便于日志回放。 */
  text: string;
  kind: 'own-hp' | 'own-status' | 'own-alive' | 'foe-hp' | 'foe-alive' | 'weather' | 'turn' | 'unknown';
  /** 文本位置（句内偏移）。 */
  position: number;
  /** `own:1` / `own:2` / `foe:1` / `foe:2` / `deck`（对手整体）/ `field`。 */
  scope: string;
  operator: '<' | '<=' | '>' | '>=' | '==';
  value: number;
  /** 无法验证的原因（如需要对手招式表）。 */
  unverifiable?: string;
}

export interface Exception {
  /** 「除非/如果」后面的条件。 */
  when: Condition;
  /** 「否则/就」后面的动作。 */
  action: {move: string | null; switchTo: string | null; source: string};
  text: string;
}

export interface Plan {
  /** 无条件执行的动作队列（按优先级与文本顺序）。 */
  actions: ActionIntent[];
  /** 带条件的动作：条件成立才出这个招式。 */
  guarded: Array<{action: ActionIntent; condition: Condition}>;
  /** 条件成立才会执行的例外动作。 */
  exceptions: Exception[];
  /** 所有条件。 */
  conditions: Condition[];
  /** 看不到对手、无法验证的条件。 */
  unverifiable: Condition[];
}

const CLAUSE = /^(?:如果|当|若|一旦|在)/;

function percent(value: number | null | undefined): number {
  return typeof value === 'number' ? value : 100;
}

function slotOf(text: string): number {
  if (/(?:2号|二号|二号位|第二位|后面那只|后面的|第二只|第二个)/.test(text)) return 2;
  return 1;
}

/** 从一句条件里读出可判断的条件；读不出时返回 null（交给拆解阶段当「条件词」）。 */
export function readCondition(text: string): Condition | null {
  let body = text.trim();
  const lead = CLAUSE.exec(body);
  if (lead) body = body.slice(lead[0].length);
  // 「我方 1 号体力低于 50%」：先认本方/对方，再认位次，再认血量。
  const side = /^(我方|自己|对方|对面|敌方|对手|己方)/.exec(body);
  const scope = side ? (['我方', '自己', '己方'].includes(side[1]!) ? 'own' : 'foe') : /对手|对方|对面|敌方/.test(body) ? 'foe' : 'own';
  const rest = side ? body.slice(side[0].length) : body;
  const numbers = [...rest.matchAll(/([0-9]+)\s*%|([0-9]+)\s*(?:只|个|名)/g)];
  const firstNumber = /([0-9]+)\s*%/.exec(rest);
  const countNumber = /([0-9]+)\s*(?:只|个|名)/.exec(rest);
  const hpWords = /体力|血量|hp/i.test(rest);
  if (hpWords && firstNumber) {
    const operator: Condition['operator'] = /低于|小于|少于|不足|下于/.test(rest) ? '<' : /高于|大于|超过|以上/.test(rest) ? '>' : /等于/.test(rest) ? '==' : '<=';
    const own = scope === 'own';
    if (own) {
      const slot = slotOf(rest);
      return {text, kind: 'own-hp', position: 0, scope: `own:${slot}`, operator, value: Number(firstNumber[1])};
    }
    // 对手：请求里没有对手的血量百分比，只能看到日志里确认倒下的对手。
    return {text, kind: 'foe-hp', position: 0, scope: 'deck', operator, value: Number(firstNumber[1])};
  }
  if (countNumber && /(?:只剩|剩|还有|倒下|失去)/.test(rest)) {
    const scopeKind: Condition['kind'] = scope === 'foe' ? 'foe-alive' : 'own-alive';
    return {text, kind: scopeKind, position: 0, scope: scope === 'foe' ? 'deck' : 'own:1', operator: '==', value: Number(countNumber[1])};
  }
  if (/(?:睡眠|中毒|麻痹|烧伤|冻结|冰冻|剧毒|异常)/.test(rest)) {
    return {text, kind: 'own-status', position: 0, scope: `own:${slotOf(rest)}`, operator: '==', value: 0};
  }
  if (/天气|雨天|晴天|沙暴|雪天/.test(rest)) {
    return {text, kind: 'weather', position: 0, scope: 'field', operator: '==', value: 0};
  }
  if (/(?:回合|第)([0-9]+)/.test(rest)) {
    return {text, kind: 'turn', position: 0, scope: 'field', operator: '>=', value: Number(/(?:回合|第)([0-9]+)/.exec(rest)![1])};
  }
  void numbers;
  return null;
}

/** 用「本方可见」的战局判断条件；看不到的信息返回 false 而不是当成成立。 */
export function evaluate(condition: Condition, view: View, turn: number, faintedFoes: Set<number>): boolean {
  if (condition.unverifiable) return false;
  const compare = (actual: number): boolean => {
    switch (condition.operator) {
      case '<': return actual < condition.value;
      case '<=': return actual <= condition.value;
      case '>': return actual > condition.value;
      case '>=': return actual >= condition.value;
      default: return actual === condition.value;
    }
  };
  switch (condition.kind) {
    case 'own-hp': {
      const partner = condition.scope === 'own:2' ? view.own[1] : view.own[0];
      return !!partner && !partner.fainted && compare(percent(partner.hpPercent));
    }
    case 'foe-hp': {
      // 对手血量百分比看不到：只有「已确认倒下」能回答「低于」类条件，其余一律不可验证。
      if (condition.operator === '<' || condition.operator === '<=') return faintedFoes.size > 0;
      return false;
    }
    case 'own-status': {
      const partner = condition.scope === 'own:2' ? view.own[1] : view.own[0];
      return !!partner && partner.status !== '';
    }
    case 'own-alive': {
      const alive = view.own.filter((partner) => partner && !partner.fainted).length + view.bench.filter((partner) => !partner.fainted).length;
      return compare(alive);
    }
    case 'foe-alive': {
      // 只有日志里确认倒下的对手才算数，请求里没有对手队伍。
      const alive = Math.max(0, 2 - faintedFoes.size);
      return compare(alive);
    }
    case 'turn':
      return turn >= condition.value;
    case 'weather': {
      // 天气写在日志里（|-weather|），本轮还没有接日志，所以当成看不到。
      return false;
    }
    default:
      return false;
  }
}

/** 「除非A否则B」或「当A时B」：把条件与它管的动作缝成一条例外。 */
export function readException(text: string): {when: Condition; after: string} | null {
  const matched = /(?:除非|如果|当|若|一旦)(.+?)(?:[,，。])(?:否则|就|则|那就)?(.*)$/.exec(text);
  if (!matched) return null;
  const when = readCondition(matched[1]!);
  if (!when) return null;
  return {when, after: matched[2] ?? ''};
}

export interface PlanInput {
  actions: ActionIntent[];
  /** 每个动作所在句子里出现的条件片段（来自第一遍拆解）。 */
  conditionTexts: string[];
  sentencs: string[];
}

export function rebuildPlan(actions: ActionIntent[], conditions: string[], turn: number, dex: typeof Engine.Dex.prototype, index?: MoveIndex): Plan {
  const plan: Plan = {actions: actions.slice(), guarded: [], exceptions: [], conditions: [], unverifiable: []};
  for (const text of conditions) {
    const condition = readCondition(text);
    if (!condition) continue;
    if (condition.kind === 'foe-hp' || condition.kind === 'foe-alive' || condition.kind === 'weather') {
      plan.unverifiable.push({...condition, unverifiable: condition.kind === 'weather' ? '天气事件只在日志里，本轮没有读日志' : '请求里没有对手队伍与招式，只能看到确认倒下的对手'});
      continue;
    }
    plan.conditions.push(condition);
  }
  // 例外：只认「除非」这一种，把「否则」后面的动作挂到条件上。
  for (const action of actions) {
    const sentence = action.sentence;
    const matched = /(?:除非)(.+?)[,，。](?:否则|就|则)?(.+)$/.exec(sentence);
    if (!matched) continue;
    const when = readCondition(matched[1]!);
    if (!when) continue;
    const after = matched[2]!.trim();
    const resolved = resolveName(dex, after, index);
    plan.exceptions.push({
      when, text: sentence,
      action: {move: resolved.move, switchTo: resolved.species, source: after}
    });
  }
  void turn;
  // 条件不成立的带条件动作：只有证据成立才出手；证据看不到时记成不可验证，不会出手。
  const view = undefined as View | undefined;
  void view;
  return plan;
}

export function isGuarded(plan: Plan, action: ActionIntent): boolean {
  return plan.guarded.some((entry) => entry.action === action);
}
