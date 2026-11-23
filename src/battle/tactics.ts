// 战术文本 → 意图拆解 → 决策。
//
// 第一轮只做「拆解 + 按拆解结果直接决策」：文本按标点切成句子，句子里的动作再按数字优先级排序，
// 所有条件、例外、否定都原样记录，但这一轮都没有接进决策。
// 好处是行为完全可预期（写多少执行多少），缺点也会在测试里逐条暴露，
// 正是后续几轮要修复的「不够好的地方」。

import type {Engine} from './engine.ts';

export type TargetWord = 'lowestHp' | 'highestHp' | 'fastest' | 'slowest' | 'highestAttack' | 'threat';

export interface ActionIntent {
  /** 文本里写下的招式名或上场宝可梦（原文，未消解）。 */
  source: string;
  /** 换人动作的目标名字；普通招式动作为 null。 */
  switchTo: string | null;
  /** 数字优先级：越小越优先，没写数字时保持句内顺序。 */
  priority: number;
  /** 文本位置，同优先级时保持书写顺序。 */
  position: number;
  /** 跟在动作后面的目标词。 */
  target: TargetWord | null;
  /** 招式名后面跟了「时/后/再」：是一个前提，不是独立行动。 */
  conditional: boolean;
  /** 所在句子，便于日志回放。 */
  sentence: string;
}

export interface Intent {
  raw: string;
  actions: ActionIntent[];
  negations: string[];
  exceptions: string[];
  conditions: string[];
  mentions: string[];
}

const CJK = '\u4e00-\u9fff';
const TARGETS: Array<[RegExp, TargetWord]> = [
  [new RegExp(`(?:体力|血量|hp)(?:最低|最少)`), 'lowestHp'],
  [new RegExp(`(?:体力|血量|hp)(?:最高|最多)`), 'highestHp'],
  [/(?:速度)?最快|先手/, 'fastest'],
  [/最慢/, 'slowest'],
  [/攻击最高|攻击最强/, 'highestAttack'],
  [/威胁最大/, 'threat']
];
const END =
  '的|了|然后|并|再|且|时|之后|以后|攻击|击倒|向|对|打|集中|切换|换上|换|派出|上场|优先|敌人|对手|对方|对面|体力|血量|最|太';
/** 字节偏长才会触发截断；「保护主力」这类较短的文本会完整保留，正是第一轮对句子成分不敏感的已知问题。 */
const LONG = 4;
/** 跟在招式或宝可梦后面的元词：遇到它们就停止取名字，避免「的敌人」「并」被吞进名字里。 */
const STOP = new RegExp(END, 'g');

// 动词表里没有「不要冒险使用」这类前缀：第一轮不认识否定，所以它们会留在动词前面，不影响取名字。
const LEAD = `[\\u4e00-\\u9fff]{0,3}?`;

function callPattern(verb: string): RegExp {
  return new RegExp(`(?:${verb})${LEAD}([${CJK}]{2,12}?)(?:并|再|然后|之后|以后|时|,|\\.|$)`, 'g');
}

// 换人动词必须与招式动词分开扫描，否则「换上加鲁克」会被招式模式截成残句。
const SWAP = new RegExp(`(?:换上|换|派出|上场)([${CJK}]{2,12}?)(?=上场|登场|出战|接战|并|再|然后|之后|以后|,|\\.|$)`, 'g');
const MOVE_VERBS = callPattern('优先使用|优先打出|优先开|优先放|优先用|优先派|优先|使用|打出|开|放|用');

function trimName(value: string): string {
  if (Array.from(value).length <= LONG) return value.trim();
  STOP.lastIndex = 0;
  const match = STOP.exec(value);
  return (match ? value.slice(0, match.index) : value).trim();
}

function actionsIn(sentence: string, start: number) {
  const found: Array<{source: string; position: number; swap: boolean; conditional: boolean}> = [];
  const masks = Array.from({length: sentence.length}, () => false);
  const scans: Array<{pattern: RegExp; swap: boolean}> = [{pattern: SWAP, swap: true}, {pattern: MOVE_VERBS, swap: false}];
  for (const {pattern, swap} of scans) {
    for (const match of sentence.matchAll(pattern)) {
      const offset = match.index! + match[0].indexOf(match[1]);
      const source = trimName(match[1]);
      if (source.length < 2 || masks.slice(offset, offset + source.length).some(Boolean)) continue;
      // 动词本身就是名字的一部分（如「保护」里的「护」），所以只排除与动词重叠的切片。
      const verb = match[0].slice(0, match[0].length - match[1].length);
      if (offset < match.index! + verb.length) continue;
      for (let i = offset; i < offset + source.length; i++) masks[i] = true;
      const after = sentence.slice(offset + source.length);
      found.push({source, position: start + offset, swap, conditional: !swap && /^(?:时|后|再|之后|以后)/.test(after)});
    }
  }
  return found.sort((a, b) => a.position - b.position);
}

/** 全角数字与标点统一成半角，换行统一成 \n；500 字上限仍按原文计算。 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\uFF10-\uFF19]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFF10 + 48))
    .replace(/[\uFF01-\uFF5E]/g, (char) => {
      const known: Record<string, string> = {'\u3001': ',', '\u3002': '.', '\uFF0C': ',', '\uFF1A': ':', '\uFF1B': ';', '\uFF1F': '?', '\uFF01': '!'};
      // 全角 ASCII（Ａ–ｚ、０–９）转成半角，中文标点映射成英文标点后再进入分词。
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

/** 句子里的数字优先级：`优先使用X，1是最高优先级` 或 `1是X`；数字越小越优先。 */
export function numberPriority(sentence: string): number | null {
  if (/([0-9]+)\s*是\s*(?:最高优先级|最优先|优先级最高)/.test(sentence)) return 0;
  const numbered = sentence.match(/([0-9]+)\s*是/);
  return numbered ? Number(numbered[1]) : null;
}

export function parseIntent(raw: string): Intent {
  const text = normalizeText(raw);
  const intent: Intent = {raw, actions: [], negations: [], exceptions: [], conditions: [], mentions: []};
  const listed: ActionIntent[] = [];
  for (const sentence of sentences(text)) {
    for (const word of sentence.text.matchAll(/不(?:要|应|需|得|能冒险|冒险|轻易冒险)/g)) intent.negations.push(sentence.text.slice(word.index));
    // 第一轮的否定只按「不要/不应」这类祈使词识别；单独的「不」被漏掉，正是已知不足之一。
    for (const word of sentence.text.matchAll(/(?:除非|除[^,]*?外|如果|若|一旦|否则)/g)) intent.exceptions.push(sentence.text.slice(word.index));
    // 条件词先只记位置，真正的条件解析留到后续轮次。
    for (const word of sentence.text.matchAll(/hp|HP|体力|剩|还有|首次|第一次|已经|状态|异常|睡眠|中毒|麻痹|烧伤|替身|守住|强化|能力等级|天气|雨|晴|沙暴|雪|场地|濒死|倒下/g)) {
      intent.conditions.push(sentence.text.slice(word.index));
    }
    for (const word of sentence.text.matchAll(new RegExp(`[${CJK}]{2,6}`, 'g'))) intent.mentions.push(word[0]);
    const numbered = numberPriority(sentence.text);
    const target = TARGETS.find(([pattern]) => pattern.test(sentence.text))?.[1] ?? null;
    actionsIn(sentence.text, sentence.start).forEach((value, index) => {
      listed.push({
        source: value.source,
        switchTo: value.swap ? value.source : null,
        priority: numbered ?? 10000 + index,
        position: value.position,
        target,
        conditional: value.conditional,
        sentence: sentence.text
      });
    });
  }
  // 第一轮：只按数字优先级与书写顺序排序，条件/例外/否定都不参与排序。
  intent.actions = listed.sort((a, b) => a.priority - b.priority || a.position - b.position);
  return intent;
}

/** 第一轮只按原文在引擎里查招式：不做别名、模糊匹配或物种招式消解。 */
export function resolveMove(dex: typeof Engine.Dex.prototype, word: string): string | null {
  if (!word || /^[0-9]+$/.test(word)) return null;
  const move = dex.moves.get(word);
  return move.exists ? move.name : null;
}
