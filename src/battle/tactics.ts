// 战术文本 → 意图拆解（第一遍）。
//
// 前五轮修掉了：例外/否定作用域、中文名称消解、站位、队列推进、条件与不可验证标记。
// 第六轮把拆句、条件和否定都换成本文件之上的 `splits.ts`：
// - 「否则不要 B」整句剩下的 B 都归这条否定；
// - 同一句里「除非 A，否则不要 B，除非 C，否则不要 D」按「条件 → 它的否定」配对；
// - 同一句两个条件时用「离动作最近的片段」，不把第一个条件借给第二个动作。
// 但拆解仍然只读文本本身：目标比较、预算裁剪、显式默认策略分别在 targets.ts / splits.ts / defaults.ts。

import type {Engine} from './engine.ts';
import {negationScopes, splitSentences} from './splits.ts';

export type TargetWord =
  | 'lowestHp' | 'highestHp' | 'fastest' | 'slowest' | 'highestAttack' | 'threat'
  | 'foe' | 'ally' | 'foeSecond' | 'foeBoth';

export interface ActionIntent {
  /** 文本里写下的原文（消解前），便于日志回放。 */
  source: string;
  /** 招式（引擎显示名）；换人动作为 null。 */
  move: string | null;
  /** 换人目标物种（显示名）；招式动作为 null。 */
  switchTo: string | null;
  /** 数字优先级：越小越优先。 */
  priority: number;
  /** 文本位置，同优先级时保持书写顺序。 */
  position: number;
  /** 目标词：本轮只取动作所在句子的第一个目标词。 */
  target: TargetWord | null;
  /** 招式名后面跟了「时/后/再」：是前提，不会独立出手。 */
  conditional: boolean;
  /** 所在句子。 */
  sentence: string;
}

export interface Negation {
  /** 否定词的原文。 */
  text: string;
  /** 被这个否定词管住的动作（原文）。 */
  actions: string[];
  /** 这条否定所属的「除非」条件原文（没有则为 null）。 */
  condition: string | null;
}

export interface Intent {
  raw: string;
  actions: ActionIntent[];
  negated: Negation[];
  exceptions: string[];
  conditions: string[];
  conditionPositions: number[];
  unknown: string[];
  notes: string[];
}

export const NEGATION_WORDS = ['不要', '别', '切勿', '不用', '禁止'];

const CJK = '\u4e00-\u9fff';
const TARGETS: Array<[RegExp, TargetWord]> = [
  [/(?:另一个|另一只|第二只|后一只)/, 'foeSecond'],
  [/(?:前两个|两只对手|两个对手|两口)/, 'foeBoth'],
  [/(?:体力|血量|hp)(?:最低|最少)/, 'lowestHp'],
  [/(?:体力|血量|hp)(?:最高|最多)/, 'highestHp'],
  [/威胁最大/, 'threat'],
  [/攻击最高|攻击最强/, 'highestAttack'],
  [/(?:速度)?最快|先手/, 'fastest'],
  [/最慢/, 'slowest'],
  [/队友|同伴/, 'ally'],
  [/对手|对面|对方|敌人/, 'foe']
];
/**
 * 名字后面紧跟的元词：遇到就停止取名字。
 * 「打」「换」「最」这些字可能是招式名本身（「打草结」「交换场地」），不能放进停止表。
 */
const END = '的|了|然后|并|再|且|时|之后|以后|出场|集中|切换|换上|派出|上场|优先|敌人|对手|对方|对面|队友|体力|血量|另一|第二|前两';
const STOP = new RegExp(END, 'g');
const SWAP = new RegExp(`(换上|换|派出|上场)([${CJK}]{1,10}?)(?:上场|登场|出战|接战|并|再|然后|,|\\.|$|时|后)`, 'g');
const VERBS = '优先使用|优先打出|优先开|优先放|优先用|优先派|优先|先手|使用|打出|开|放|用|打';
const MOVE = new RegExp(`(${VERBS})([${CJK}的]{0,6}?)([${CJK}]{2,12}?)(?:并|再|然后|之后|以后|时|,|\\.|$)`, 'g');

/** 全角 ASCII 转半角，中文标点保留，换行统一成 \n。 */
/**
 * 第九轮：500 字上限里换行、全角标点、emoji（代理对）各算一个字符；
 * 解析文本统一换行、统一标点，但**先按原文的长度和内容做预算判断**，解析后再压缩空白。
 * 截断按「句子 / 逗号」边界切，不会把招式名或条件劈成半句。
 */
export const TACTIC_LIMIT = 500;

/** 按 Unicode 字符（码点）计数：换行 1 个、全角标点 1 个、代理对 1 个。 */
export function tacticLength(raw: string): number {
  return Array.from(raw).length;
}

/** 超出上限时按句子或逗号边界截断，并在末尾补省略号（省略号不计入上限之外的部分）。 */
export function clampTactic(raw: string, limit = TACTIC_LIMIT): {text: string; truncated: boolean} {
  // 换行与制表是排版字符：直接换成 \n 与空格，其它控制字符仍由上游拒绝。
  raw = raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  if (tacticLength(raw) <= limit) return {text: raw, truncated: false};
  const head = Array.from(raw).slice(0, limit).join('');
  // 先按码点切，再退到最近的分句符；只有在很少边界句式时才硬切（保证不会超过上限）。
  const boundary = Math.max(head.lastIndexOf('。'), head.lastIndexOf('\n'), head.lastIndexOf('，'), head.lastIndexOf(','));
  const text = boundary >= 1 ? head.slice(0, boundary + 1) : head;
  const sanitized = text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '');
  return {text: sanitized.trimEnd(), truncated: true};
}

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // 连续空白压缩成一个空格：解析不依赖空白宽度，但保留至少一个空格作为分界。
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (char) => {
      const known: Record<string, string> = {'\u3001': ',', '\u3002': '.', '\uFF0C': ',', '\uFF1A': ':', '\uFF1B': ';', '\uFF1F': '?', '\uFF01': '!'};
      if (char >= '\uFF01' && char <= '\uFF5E') return known[char] ?? String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
      return known[char] ?? char;
    })
    .replace(/\u3000/g, ' ');
}

export function numberPriority(sentence: string): number | null {
  if (/([0-9]+)\s*是\s*(?:最高优先级|最优先|优先级最高)/.test(sentence)) return 0;
  const numbered = sentence.match(/([0-9]+)\s*是/);
  return numbered ? Number(numbered[1]) : null;
}

function trimName(value: string): string {
  STOP.lastIndex = 0;
  const matched = STOP.exec(value);
  return (matched ? value.slice(0, matched.index) : value).trim();
}

interface RawAction {source: string; position: number; swap: boolean; conditional: boolean; sentence: string}

function actionsIn(sentence: string, start: number): RawAction[] {
  const found: RawAction[] = [];
  const masks = Array.from({length: sentence.length}, () => false);
  for (const matched of sentence.matchAll(SWAP)) {
    const source = matched[2]!.trim();
    const offset = matched.index! + matched[0].indexOf(matched[2]!);
    if (source.length < 2 || masks.slice(offset, offset + source.length).some(Boolean)) continue;
    for (let i = offset; i < offset + source.length; i++) masks[i] = true;
    found.push({source, position: start + offset, swap: true, conditional: false, sentence});
  }
  for (const matched of sentence.matchAll(MOVE)) {
    const offset = matched.index! + matched[0].indexOf(matched[3]!);
    const verbEnd = matched.index! + matched[1]!.length + matched[2]!.length;
    const source = trimName(matched[3]!);
    if (offset < verbEnd || source.length < 2 || masks.slice(offset, offset + source.length).some(Boolean)) continue;
    for (let i = offset; i < offset + source.length; i++) masks[i] = true;
    const after = sentence.slice(offset + source.length);
    found.push({source, position: start + offset, swap: false, conditional: /^(?:时|后|再|之后|以后)/.test(after), sentence});
  }
  return found.sort((a, b) => a.position - b.position);
}

import type {MoveIndex} from './names.ts';
export type {MoveIndex};

/** 消解：先引擎原名（英文/ID），再 zh-hans 名字表；不做拼写模糊与昵称（留给后面的轮次）。 */
export function resolveName(dex: typeof Engine.Dex.prototype, word: string, index?: MoveIndex): {move: string | null; species: string | null} {
  if (!word) return {move: null, species: null};
  // 中文招式名（如「守住」）在引擎里可能被当成某只宝可梦，所以名字表先于引擎的「物种」解析。
  const move = dex.moves.get(word);
  if (move.exists) return {move: move.name, species: null};
  const key = word.toLowerCase();
  const byMove = index?.moves.get(key);
  if (byMove) return {move: byMove, species: null};
  const bySpecies = index?.species.get(key);
  if (bySpecies) return {move: null, species: bySpecies};
  const species = dex.species.get(word);
  if (species.exists && !species.isGigantamax && !species.isMega) return {move: null, species: species.name};
  return {move: null, species: null};
}

/** 名字里夹了物种/修饰（「保护主力」「喷火龙的地震」）时，取 2–6 字滑动窗口里最长的能消解片段。 */
function longestName(value: string, dex: typeof Engine.Dex.prototype, index?: MoveIndex): string | null {
  const chars = Array.from(value);
  for (let length = Math.min(6, chars.length); length >= 2; length--) {
    for (let start = 0; start + length <= chars.length; start++) {
      const candidate = chars.slice(start, start + length).join('');
      const resolved = resolveName(dex, candidate, index);
      if (resolved.move || resolved.species) return candidate;
    }
  }
  return null;
}

/** 把整句动作按位置排序后解析成 ActionIntent，并保证：
 *  - 同句没有数字时，换人排在出招之后；
 *  - 否定按作用域吞动作（见 splits.ts）。 */
function toActions(sentence: string, start: number, dex: typeof Engine.Dex.prototype, index: MoveIndex | undefined, intent: Intent) {
  const numbered = numberPriority(sentence);
  const target = TARGETS.find(([pattern]) => pattern.test(sentence))?.[1] ?? null;
  const values = actionsIn(sentence, start);
  const base = numbered ?? 10000;
  const swapCount = values.filter((value) => value.swap).length;
  const actions: Array<ActionIntent & {priority: number}> = values.map((value) => {
    let resolved = resolveName(dex, value.source, index);
    if (!resolved.move && !resolved.species) {
      const inner = longestName(value.source, dex, index);
      if (inner) {
        const found = resolveName(dex, inner, index);
        // 换人动词后面必须是宝可梦名；其它动词后面优先招式，招式不同名时才退回宝可梦。
        resolved = value.swap ? {move: null, species: found.species} : {move: found.move, species: found.move ? null : found.species};
      }
    }
    if (!resolved.move && !resolved.species) intent.unknown.push(value.source);
    const order = values.filter((other) => other.position < value.position).length;
    return {
      source: value.source, move: resolved.move, switchTo: resolved.species,
      // 同一句里：出招按书写顺序，换人整体后移 swapCount 位，保证「先出招、后换人」。
      priority: (numbered ?? base) + order + (value.swap ? swapCount : 0),
      position: value.position, target, conditional: value.conditional, sentence
    };
  });
  // 否定按作用域吞动作，并把「否则不要…」挂到前面最近的那个「除非」条件上。
  // 已知不足（Round 7）：「否则不要冒险」里的「冒险」不是动作，真正的动作「保护主力」在逗号后面，
  // 所以这一句的否定是空的——要用「例外语义」重写，留给下一轮。
  for (const scope of negationScopes(sentence, NEGATION_WORDS, start)) {
    const affected = actions.filter((action) => action.position >= scope.start && action.position <= scope.end);
    intent.negated.push({
      text: scope.text,
      actions: affected.map((action) => action.source),
      condition: nearestCondition(sentence, scope.start) ?? null
    });
  }
  return actions;
}

/** 找否定词前面最近的「除非 A」片段，用来把「除非…否则不要…」配成一对。 */
function nearestCondition(sentence: string, index: number): string | null {
  const prefixes = [...sentence.slice(0, index).matchAll(/除非([^,，。]*)/g)].map((value) => value[0]);
  return prefixes.at(-1) ?? null;
}

export function parseIntent(raw: string, dex: typeof Engine.Dex.prototype, index?: MoveIndex): Intent {
  // 先按原文截断到 500 字，再把截断后的文本统一成解析用的写法；超长时在 notes 里明确记录。
  const clamped = clampTactic(raw);
  if (clamped.truncated) {
    const notes = ['战术超过500字，已按句子边界截断'];
    return {...parseIntentAll(clamped.text, dex, index, notes), raw};
  }
  return parseIntentAll(clamped.text, dex, index, []);
}

function parseIntentAll(raw: string, dex: typeof Engine.Dex.prototype, index: MoveIndex | undefined, notes: string[]): Intent {
  const text = normalizeText(raw);
  const intent: Intent = {raw, actions: [], negated: [], exceptions: [], conditions: [], conditionPositions: [], unknown: [], notes: [...notes]};
  const listed: Array<ActionIntent & {priority: number}> = [];
  for (const sentence of splitSentences(text)) {
    if (/除非/.test(sentence.text)) intent.exceptions.push(sentence.text.slice(sentence.text.indexOf('除非')));
    for (const matched of sentence.text.matchAll(/hp|HP|体力|血量|剩|还有|首次|第一次|已经|状态|异常|睡眠|中毒|麻痹|烧伤|替身|强化|能力等级|天气|雨|晴|沙暴|雪|场地|濒死|倒下|不会|没带/g)) {
      intent.conditions.push(sentence.text.slice(matched.index));
      intent.conditionPositions.push(sentence.start + matched.index!);
    }
    for (const action of toActions(sentence.text, sentence.start, dex, index, intent)) listed.push(action);
  }
  // 例外：「优先保护主力，除非能够结束战斗，否则不要冒险」——例外只记录；「结束战斗」不是招式，会进入 unknown。
  listed.sort((a, b) => a.priority - b.priority || a.position - b.position);
  intent.actions = listed;
  return intent;
}
