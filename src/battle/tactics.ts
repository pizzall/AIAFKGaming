// 战术文本 → 意图拆解（第一遍）。
//
// 第二轮修掉第一轮暴露的问题：例外条件参与排序、否定只吞掉它管住的动作、目标词落到具体动作上、
// 同一句里换人排在出招之后、中文招式名/宝可梦名能被消解。
// 但拆解仍然只读文本本身：不读战局、不读阵型、不读行动队列——这些是下一轮要列出的不足。

import type {Engine} from './engine.ts';

export type TargetWord = 'lowestHp' | 'highestHp' | 'fastest' | 'slowest' | 'highestAttack' | 'threat' | 'foe' | 'ally';

export interface ActionIntent {
  /** 文本里写下的原文（消解前），便于日志回放。 */
  source: string;
  /** 招式（引擎显示名）；换人动作为 null。 */
  move: string | null;
  /** 换人目标物种（显示名）；招式动作为 null。 */
  switchTo: string | null;
  /** 数字优先级：越小越优先；例外条件改写成 0 或 1 时排在最前/最后。 */
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

export interface Intent {
  raw: string;
  actions: ActionIntent[];
  /** 被否定管住的动作（原文），决策时跳过。 */
  negated: string[];
  exceptions: string[];
  conditions: string[];
  unknown: string[];
  notes: string[];
}

const CJK = '\u4e00-\u9fff';
const TARGETS: Array<[RegExp, TargetWord]> = [
  [/(?:体力|血量|hp)(?:最低|最少)/, 'lowestHp'],
  [/(?:体力|血量|hp)(?:最高|最多)/, 'highestHp'],
  [/威胁最大/, 'threat'],
  [/攻击最高|攻击最强/, 'highestAttack'],
  [/(?:速度)?最快|先手/, 'fastest'],
  [/最慢/, 'slowest'],
  [/另一只|另一个/, 'foe'],
  [/队友|同伴/, 'ally'],
  [/对手|对面|对方|敌人/, 'foe']
];
/**
 * 名字后面紧跟的元词：遇到就停止取名字。
 * 注意「打」「换」「最」这类字本身可能是招式名的一部分（「打草结」「交换场地」），不能放进停止表。
 */
const END = '的|了|然后|并|再|且|时|之后|以后|出场|集中|切换|换上|派出|上场|优先|敌人|对手|对方|对面|队友|体力|血量';
const STOP = new RegExp(END, 'g');
const SWAP = new RegExp(`(换上|换|派出|上场)([${CJK}]{1,10}?)(?:上场|登场|出战|接战|并|再|然后|,|\\.|$|时|后)`, 'g');
const VERBS = '优先使用|优先打出|优先开|优先放|优先用|优先派|优先|先手|使用|打出|开|放|用|打';
// 动词与名字之间允许「喷火龙的地震」「我的莎莉亚用」这类修饰。
const MOVE = new RegExp(`(${VERBS})([${CJK}的]{0,6}?)([${CJK}]{2,12}?)(?:并|再|然后|之后|以后|时|,|\\.|$)`, 'g');
const NEGATED = new RegExp(`(不要|别|切勿|不用|禁止)([${CJK}]{0,4}?)([${CJK}]{2,12}?)(?:并|再|然后|之后|以后|时|,|\\.|$)`);

/** 全角 ASCII 转半角，中文标点保留，换行统一成 \n。 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\uFF01-\uFF5E]/g, (char) => {
      const known: Record<string, string> = {'\u3001': ',', '\u3002': '.', '\uFF0C': ',', '\uFF1A': ':', '\uFF1B': ';', '\uFF1F': '?', '\uFF01': '!'};
      if (char >= '\uFF01' && char <= '\uFF5E') return known[char] ?? String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
      return known[char] ?? char;
    })
    .replace(/\u3000/g, ' ');
}

function sentences(text: string): Array<{text: string; start: number}> {
  const result: Array<{text: string; start: number}> = [];
  for (const match of text.matchAll(/[^.!?;\n]+/g)) {
    const trimmed = match[0].trim();
    if (trimmed) result.push({text: trimmed, start: match.index! + match[0].indexOf(trimmed)});
  }
  return result;
}

export function numberPriority(sentence: string): number | null {
  if (/([0-9]+)\s*是\s*(?:最高优先级|最优先|优先级最高)/.test(sentence)) return 0;
  const numbered = sentence.match(/([0-9]+)\s*是/);
  return numbered ? Number(numbered[1]) : null;
}

function trimName(value: string): string {
  STOP.lastIndex = 0;
  const match = STOP.exec(value);
  return (match ? value.slice(0, match.index) : value).trim();
}

/** 在 2–6 个字的滑动窗口里找出真正能消解的名字（中文招式名/宝可梦名），没有就返回 null。 */
function longestName(value: string, dex: typeof Engine.Dex.prototype, index?: MoveIndex): string | null {
  const chars = Array.from(value);
  for (let length = Math.min(6, chars.length); length >= 2; length--) {
    for (let start = 0; start + length <= chars.length; start++) {
      const candidate = chars.slice(start, start + length).join('');
      if (resolveName(dex, candidate, index).move || resolveName(dex, candidate, index).species) return candidate;
    }
  }
  return null;
}

interface RawAction {source: string; position: number; swap: boolean; conditional: boolean; sentence: string}

function actionsIn(sentence: string, start: number): RawAction[] {
  const found: RawAction[] = [];
  const masks = Array.from({length: sentence.length}, () => false);
  for (const match of sentence.matchAll(SWAP)) {
    const source = match[2].trim();
    const offset = match.index! + match[0].indexOf(match[2]);
    if (source.length < 2 || masks.slice(offset, offset + source.length).some(Boolean)) continue;
    for (let i = offset; i < offset + source.length; i++) masks[i] = true;
    found.push({source, position: start + offset, swap: true, conditional: false, sentence});
  }
  for (const match of sentence.matchAll(MOVE)) {
    const offset = match.index! + match[0].indexOf(match[3]);
    const verbEnd = match.index! + match[1].length + match[2].length;
    const source = trimName(match[3]);
    if (offset < verbEnd || source.length < 2 || masks.slice(offset, offset + source.length).some(Boolean)) continue;
    for (let i = offset; i < offset + source.length; i++) masks[i] = true;
    const after = sentence.slice(offset + source.length);
    found.push({source, position: start + offset, swap: false, conditional: /^(?:时|后|再|之后|以后)/.test(after), sentence});
  }
  return found.sort((a, b) => a.position - b.position);
}

import type {MoveIndex} from './names.ts';
export type {MoveIndex};

/** 消解：先引擎原名（英文/ID），再 zh-hans 名字表；本轮不做拼写模糊与昵称。 */
export function resolveName(dex: typeof Engine.Dex.prototype, word: string, index?: MoveIndex): {move: string | null; species: string | null} {
  // 第三轮要修：优先按「招式」解析，而不是先按物种——「换上加鲁克」里的「加鲁克」能查到物种，
  // 「保护主力」也可能先撞上某个物种。本轮保持「先招式、再物种」的顺序，但只查显示名，不查内部 ID。
  const move = dex.moves.get(word);
  if (move.exists) return {move: move.name, species: null};
  // 名字表优先于引擎的「物种」解析：中文招式名（如「守住」）在引擎里可能被当成某只宝可梦。
  // 表里的值已经是引擎显示名（英文原名），直接使用，不再交给引擎二次解析中文。
  const key = word.toLowerCase();
  const byMove = index?.moves.get(key);
  if (byMove) return {move: byMove, species: null};
  const bySpecies = index?.species.get(key);
  if (bySpecies) return {move: null, species: bySpecies};
  const species = dex.species.get(word);
  if (species.exists && !species.isGigantamax && !species.isMega) return {move: null, species: species.name};
  return {move: null, species: null};
}

/** 把整句动作按位置排序后解析成 ActionIntent，并保证：
 *  - 同句没有数字时，换人排在出招之后；
 *  - 否定只吞掉它紧挨着的那一个动作。 */
function toActions(sentence: string, start: number, dex: typeof Engine.Dex.prototype, index: MoveIndex | undefined, intent: Intent) {
  const numbered = numberPriority(sentence);
  const target = TARGETS.find(([pattern]) => pattern.test(sentence))?.[1] ?? null;
  const values = actionsIn(sentence, start);
  const base = numbered ?? 10000;
  const swapCount = values.filter((value) => value.swap).length;
  const actions: Array<ActionIntent & {priority: number}> = values.map((value) => {
    let resolved = resolveName(dex, value.source, index);
    // 名字里夹了物种/修饰（「保护主力」「喷火龙的地震」）时，退回到 2–6 字滑动窗口里最长的能消解片段。
    if (!resolved.move && !resolved.species) {
      const inner = longestName(value.source, dex, index);
      if (inner) {
        const found = resolveName(dex, inner, index);
        // 换人动词后面必须是宝可梦名；其它动词后面优先招式，招式不同名时才退回宝可梦。
        resolved = value.swap ? {move: null, species: found.species} : {move: found.move, species: found.move ? null : found.species};
      }
      // 「用X攻击」里 X 若只解析成宝可梦（如「用喷火龙的一击」），仍是换人/点名，不是招式。
      if (!value.swap && resolved.move === null && resolved.species && !SWAP.test(sentence)) {
        resolved = {move: null, species: resolved.species};
      }
    }
    if (!resolved.move && !resolved.species) intent.unknown.push(value.source);
    const order = values.filter((other) => other.position < value.position).length;
    return {
      source: value.source, move: resolved.move, switchTo: resolved.species,
      // 同一句里：出招按书写顺序，换人整体后移 swapCount 位，保证「先出招、后换人」。
      priority: numbered === null ? base + order + (value.swap ? swapCount : 0) : numbered + order + (value.swap ? swapCount : 0),
      position: value.position, target, conditional: value.conditional, sentence
    };
  });
  const negated = NEGATED.exec(sentence);
  if (negated) {
    // 否定词后面紧跟的动作才被吞掉，动词与否定词之间允许少量修饰（如「不要冒险使用」）。
    const after = negated.index + negated[1].length + negated[2].length;
    const affected = actions
      .filter((action) => action.position >= start + after)
      .sort((a, b) => a.position - b.position)
      .at(0);
    if (affected) {
      intent.negated.push(affected.source);
      // 本轮的否定只是「不选它」，并不会因此选择替代动作。
    }
  }
  void target;
  return actions;
}

export function parseIntent(raw: string, dex: typeof Engine.Dex.prototype, index?: MoveIndex): Intent {
  // 第二轮命名消解依赖 catalog 的 zh-hans 表；没给表时退回到只认引擎原名。

  const text = normalizeText(raw);
  const intent: Intent = {raw, actions: [], negated: [], exceptions: [], conditions: [], unknown: [], notes: []};
  const listed: Array<ActionIntent & {priority: number}> = [];
  for (const sentence of sentences(text)) {
    const exception = /(?:除非|除[^,]*?外|如果|若|一旦|否则)/.exec(sentence.text);
    if (exception) intent.exceptions.push(sentence.text.slice(exception.index));
    for (const word of sentence.text.matchAll(/hp|HP|体力|血量|剩|还有|首次|第一次|已经|状态|异常|睡眠|中毒|麻痹|烧伤|替身|强化|能力等级|天气|雨|晴|沙暴|雪|场地|濒死|倒下/g)) {
      intent.conditions.push(sentence.text.slice(word.index));
    }
    // 注意：toActions 的第三个参数是 dex，第四个才是名字表；这里写成 dex/nameIndex 的顺序。
    for (const action of toActions(sentence.text, sentence.start, dex, index, intent)) listed.push(action);
  }
  // 例外：「优先保护主力，除非能够结束战斗，否则不要冒险」——例外只记录，不改排序；
  // 「结束战斗」不是招式，会进入 unknown 并在决策里跳过。
  listed.sort((a, b) => a.priority - b.priority || a.position - b.position);
  intent.actions = listed;
  return intent;
}
