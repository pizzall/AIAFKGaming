// 第二遍拆解：在「意图拆解」之后，用战局把结构化意图重新定位成可执行计划。
//
// 第四轮只建了条件表，决策层还没有读它；第五轮把条件接进决策：
//  - 条件成立 → 出手；不成立 → 跳过这个动作，继续看队列；
//  - 看不到了的（对手招式、对手只数、天气）→ 明确「不可验证」，不会当成成立；
//  - 例外「除非 A 否则 B」→ 条件成立时才执行 B。
// 这里只读得到本方可见的信息：本方宝可梦的体力/状态/招式，以及日志里出现过的对手招式与倒下。

import type {ActionIntent, MoveIndex} from './tactics.ts';
import {resolveName} from './tactics.ts';
import type {Engine} from './engine.ts';
import type {View} from './view.ts';
import type {FoeInfo} from './opponent.ts';

export interface Condition {
  /** 原句片段，便于日志回放。 */
  text: string;
  kind: 'own-hp' | 'own-status' | 'own-alive' | 'foe-hp' | 'foe-alive' | 'foe-known' | 'foe-move' | 'weather' | 'turn' | 'unknown';
  /** 文本位置（句内偏移）。 */
  position: number;
  /** `own:1` / `own:2` / `deck`（对手整体）/ `field`。 */
  scope: string;
  operator: '<' | '<=' | '>' | '>=' | '==';
  value: number;
  /** 条件里的招式/宝可梦名（已消解）。 */
  subject?: string;
  /** 无法验证的原因。 */
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
  /** 条件成立才会执行的动作。 */
  guarded: Array<{action: ActionIntent; condition: Condition}>;
  /** 条件成立才会执行的例外动作。 */
  exceptions: Exception[];
  conditions: Condition[];
  unverifiable: Condition[];
  /** 指向对手行为的负向判断（如「对方不会带守住」），本轮也只能标记「不可验证」。 */
  claims: Array<{text: string; kinds: 'foe-move' | 'foe-hp' | 'unknown'; subject?: string; value: boolean; unverifiable: string}>;
}

const CLAUSE = /^(?:如果|当|若|一旦|在)/;

function slotOf(text: string): number {
  return /(?:2号|二号|二号位|第二位|后面那只|后面的|第二只|第二个)/.test(text) ? 2 : 1;
}

/** 从一句条件里读出可判断的条件；读不出时返回 null。 */
export function readCondition(text: string, index?: MoveIndex, dex?: typeof Engine.Dex.prototype): Condition | null {
  let body = text.trim();
  const lead = CLAUSE.exec(body);
  if (lead) body = body.slice(lead[0].length);
  const own = /^(?:我方|自己|己方|我方[12一二两]号?)/.exec(body);
  const foe = /^(?:对方|对面|敌方|对手|对方(?:[12一二两]号?))/.exec(body);
  const scope = own ? 'own' : 'foe';
  const rest = (own ?? foe) ? body.slice((own ?? foe)![0].length) : body;
  const percent = /([0-9]+)\s*%/.exec(rest);
  if (/(?:体力|血量|hp)/i.test(rest) && percent) {
    const operator: Condition['operator'] = /低于|小于|少于|不足/.test(rest) ? '<' : /高于|大于|超过/.test(rest) ? '>' : /等于/.test(rest) ? '==' : '<=';
    if (scope === 'own') {
      return {text, kind: 'own-hp', position: 0, scope: `own:${slotOf(rest)}`, operator, value: Number(percent[1])};
    }
    return {text, kind: 'foe-hp', position: 0, scope: 'deck', operator, value: Number(percent[1]), unverifiable: '对手血量百分比看不到，只能确认倒下'};
  }
  const count = /([0-9]+)\s*(?:只|个|名)/.exec(rest);
  if (count && /(?:只剩|剩|还有|倒下|失去|都不在)/.test(rest)) {
    return scope === 'foe'
      ? {text, kind: 'foe-alive', position: 0, scope: 'deck', operator: '==', value: Number(count[1]), unverifiable: '对手只数要等日志里的倒下事件，当前看不到'}
      : {text, kind: 'own-alive', position: 0, scope: 'own:1', operator: '==', value: Number(count[1])};
  }
  if (/(?:睡眠|中毒|麻痹|烧伤|冻结|冰冻|剧毒|异常)/.test(rest)) {
    return {text, kind: 'own-status', position: 0, scope: `own:${slotOf(rest)}`, operator: '==', value: 0};
  }
  if (/(?:倒下|失守)/.test(rest) && scope === 'foe') {
    return {text, kind: 'foe-alive', position: 0, scope: 'deck', operator: '==', value: 0, unverifiable: '对手是否倒下只能在日志里确认'};
  }
  if (/天气|雨天|晴天|沙暴|雪天/.test(rest)) {
    return {text, kind: 'weather', position: 0, scope: 'field', operator: '==', value: 0, unverifiable: '天气事件只在本方可见日志里，本轮没有接日志'};
  }
  if (/(?:回合|第)([0-9]+)/.test(rest)) {
    return {text, kind: 'turn', position: 0, scope: 'field', operator: '>=', value: Number(/(?:回合|第)([0-9]+)/.exec(rest)![1])};
  }
  void dex;
  void index;
  return null;
}

/** 用「本方可见」的战局判断条件；看不到的信息返回 false，而不是当成成立。 */
export function evaluate(condition: Condition, view: View, turn: number, foes: FoeInfo): boolean {
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
      return !!partner && !partner.fainted && compare(partner.hpPercent);
    }
    case 'foe-hp':
      // 只有「已确认倒下」能回答「低于」类条件。
      return condition.operator === '<' || condition.operator === '<=' ? foes.fainted.size === 0 : false;
    case 'own-status': {
      const partner = condition.scope === 'own:2' ? view.own[1] : view.own[0];
      return !!partner && partner.status !== '';
    }
    case 'own-alive': {
      const alive = view.own.filter((partner) => partner && !partner.fainted).length + view.bench.filter((partner) => !partner.fainted).length;
      return compare(alive);
    }
    case 'foe-alive':
      return compare(Math.max(0, 2 - foes.fainted.size));
    case 'foe-move':
      // 「对方会带守住」：只有日志里出现过这个招式才算「会」。
      return foes.moves.has(condition.subject ?? '');
    case 'foe-known':
      return (condition.value === 1) === (foes.moves.size > 0);
    case 'turn':
      return turn >= condition.value;
    default:
      return false;
  }
}

export interface PlanInput {
  actions: ActionIntent[];
  conditions: string[];
  turn: number;
  index?: MoveIndex;
  dex?: typeof Engine.Dex.prototype;
}

/** 负向判断：「对方不会带X」写的是「看不到的证据」；本轮只能记成不可验证。 */
function claimSubjects(text: string): string[] {
  const matched = /(?:对方|对手|对面|敌方)(?:不会|没带|没有|不带|不走)([\u4e00-\u9fff]{2,6})/.exec(text);
  if (!matched) return [];
  // 正则只能切到「带守住」这类整段，再按 2–5 字窗口切一遍，逐个尝试消解。
  const chars = Array.from(matched[1]!);
  const result: string[] = [];
  for (let length = chars.length; length >= 2; length--) result.push(chars.slice(0, length).join(''), chars.slice(-length).join(''));
  return [...new Set(result)];
}

export function readClaim(text: string, index?: MoveIndex, dex?: typeof Engine.Dex.prototype): Plan['claims'][number] | null {
  for (const candidate of claimSubjects(text)) {
    const subject = dex ? resolveName(dex, candidate, index).move : null;
    if (subject) return {text, kinds: 'foe-move', subject, value: false, unverifiable: '对局请求里没有对手招式表，只能等日志里出现该招式'};
  }
  return text.includes('不会') && /(?:对方|对手|对面|敌方)/.test(text)
    ? {text, kinds: 'unknown', value: false, unverifiable: '对局请求里没有对手招式表，无法验证这句话'}
    : null;
}

export function rebuildPlan(input: PlanInput): {plan: Plan; unavailable: Array<{kind: string; text: string}>} {
  const plan: Plan = {actions: input.actions.slice(), guarded: [], exceptions: [], conditions: [], unverifiable: [], claims: []};
  const unavailable: Array<{kind: string; text: string}> = [];
  for (const text of input.conditions) {
    const condition = readCondition(text, input.index, input.dex);
    if (condition) {
      if (condition.unverifiable) {
        plan.unverifiable.push(condition);
        unavailable.push({kind: `条件（${condition.kind}）`, text});
      } else plan.conditions.push(condition);
    } else {
      unavailable.push({kind: '条件词', text});
    }
  }
  // 负向判断可以从「条件片段」或动作句子里出现，所以两处都要扫一遍。
  for (const text of [...input.conditions, ...input.actions.map((action) => action.sentence)]) {
    const claim = readClaim(text, input.index, input.dex);
    if (claim && !plan.claims.some((value) => value.text === claim.text)) plan.claims.push(claim);
  }
  for (const action of input.actions) {
    // 句子里带条件的动作挂上这个条件，条件不成立就不出这个动作。
    const sentence = action.sentence;
    const guardedText = /((?:如果|当|若|一旦)[^,，。]*(?:[,，。])?)/.exec(sentence)?.[1];
    if (guardedText) {
      const condition = readCondition(guardedText, input.index, input.dex);
      if (condition && !condition.unverifiable) plan.guarded.push({action, condition});
    }
    // 「除非 A 否则 B」：条件成立时才做 B；本轮只做到「记下来」。
    const unless = /除非(.+?)[,，。](?:否则|就|则)?(.+)$/.exec(sentence);
    if (unless) {
      const when = readCondition(unless[1]!, input.index, input.dex);
      if (when) plan.exceptions.push({when, text: sentence, action: {move: null, switchTo: null, source: unless[2]!.trim()}});
    }
  }
  return {plan, unavailable};
}

/** 决策层用：这个动作挂的条件是否成立。 */
export function allows(plan: Plan, action: ActionIntent, view: View, turn: number, foes: FoeInfo): boolean {
  const guarded = plan.guarded.find((entry) => entry.action === action);
  return guarded ? evaluate(guarded.condition, view, turn, foes) : true;
}
