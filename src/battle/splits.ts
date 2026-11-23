// 预算与拆句（第六轮）：
// - 「否则不要 B」整句剩下的 B 都归这条否定，而不是只吞紧挨着的那个动作；
// - 同一句有两个「除非/如果」，不能把第二个条件借给第一个动作；
// - 文本超长时按句子维度裁剪（整句丢弃），不会把一句劈成半句。

export interface SplitSentence {
  text: string;
  start: number;
}

export function splitSentences(text: string): SplitSentence[] {
  const result: SplitSentence[] = [];
  // 「。」是中文句号，第五轮之前没有被当成分句符（它不像英文句点那样结束一句）。
  for (const matched of text.matchAll(/[^.!?;。\n]+/g)) {
    const trimmed = matched[0].trim();
    if (trimmed) result.push({text: trimmed, start: matched.index! + matched[0].indexOf(trimmed)});
  }
  return result;
}

/** 整句裁剪预算：超过 `limit` 个字符就整句丢弃，剩下的句子照常解析。 */
export function trimBudget(sentences: SplitSentence[], limit: number): SplitSentence[] {
  const kept: SplitSentence[] = [];
  let used = 0;
  for (const sentence of sentences) {
    const length = Array.from(sentence.text).length;
    if (used + length > limit) break;
    used += length;
    kept.push(sentence);
  }
  return kept;
}

export interface ScopedNegation {
  text: string;
  start: number;
  end: number;
  /** `否则` 开头的否定吞到句末。 */
  terminal: boolean;
}

/**
 * 否定作用域：
 * - 「否则不要…」从否定词吞到句末；
 * - 其它否定吞到第一个「然后/再/并」或逗号；同一句里后面若再出现「，不要」，单独再开一段。
 */
export function negationScopes(sentence: string, words: string[], offset: number): ScopedNegation[] {
  const scopes: ScopedNegation[] = [];
  const pattern = new RegExp(words.join('|'), 'g');
  for (const matched of sentence.matchAll(pattern)) {
    const open = matched.index!;
    const terminal = /否则/.test(sentence.slice(0, open));
    const from = open + matched[0].length;
    const tail = sentence.slice(from);
    // 中文逗号「，」也是分隔符：第五轮之前漏掉了它，导致「不要 A，B」的 B 被误吞。
    const stop = terminal ? tail.length : tail.search(/然后|再|并|[,，。]|$/);
    const end = from + (stop < 0 ? tail.length : stop);
    scopes.push({text: sentence.slice(open, terminal ? sentence.length : end), start: offset + open, end: offset + (terminal ? sentence.length : end + 1), terminal});
  }
  return scopes;
}

/** 条件归属：用离动作最近的「以句首或逗号分开的片段」里的条件，而不是整句第一个条件。 */
export function conditionFor(sentence: string, actionIndex: number): string | null {
  const clauses = sentence.split(/[,]/).map((value) => value.trim());
  let cursor = 0;
  for (const clause of clauses) {
    const start = sentence.indexOf(clause, cursor);
    const end = start + clause.length;
    cursor = end;
    if (actionIndex < start) continue;
    if (actionIndex > end) continue;
    return /(?:如果|当|若|一旦)/.test(clause) ? clause : null;
  }
  return null;
}
