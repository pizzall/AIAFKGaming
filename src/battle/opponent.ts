// 让「看不到的对手」的可验证性跟随日志：本方视角里对手的招式、倒下、上场与身上的 buff 只会以事件出现，
// 而这些事件是累积「会什么」「剩下什么」「威胁多大」的唯一合法来源（请求里没有对手队伍与招式表）。
//
// 第五轮的 observe 只拿到「上一回合增量」，没有请求的回合（例如替换回合）就会丢一段；
// 本轮改成：adapter 每次决策前把**整段本方事件**重新交给 observe，observe 自己按「已消费条数」补齐。

export interface FoeKnown {
  /** 已经出现过、能确认在对手身上的招式（显示名）。 */
  moves: Set<string>;
  /** 已经确认倒下的对手位置（1/2）。 */
  fainted: Set<number>;
  /** 当前还站在场上的对手位置。 */
  present: Set<number>;
  /** 对手身上的能力变化（`|start|` 与 `|-boost|`/`|-unboost|`）。 */
  boosts: Map<string, number>;
  /** 对手身上出现过的状态（`|-status|`）。 */
  statuses: Set<string>;
  /** 最近一条本方可见的对手事件。 */
  lastEvent: string | null;
  /** 日志里出现过的对手身份与最近的体力百分比：站位 → 物种/百分比。 */
  roster: Map<number, {species: string; hpPercent: number}>;
}

export function emptyFoeInfo(): FoeKnown {
  return {moves: new Set(), fainted: new Set(), present: new Set([1, 2]), boosts: new Map(), statuses: new Set(), lastEvent: null, roster: new Map()};
}

/** 解法一（第五轮的做法，留着做对照）：只喂增量，没有请求的回合会丢一段。 */
export function foldFoeEvents(info: FoeKnown, events: string[]): FoeKnown {
  const next = clone(info);
  for (const line of events) applyEvent(next, line);
  return next;
}

function clone(info: FoeKnown): FoeKnown {
  return {
    moves: new Set(info.moves), fainted: new Set(info.fainted), present: new Set(info.present), boosts: new Map(info.boosts),
    statuses: new Set(info.statuses), lastEvent: info.lastEvent, roster: new Map(info.roster)
  };
}

/** 解法二（本轮）：整段事件 + 已消费条数，保证缺口回合也能补齐。 */
export function syncFoeEvents(info: FoeKnown, events: string[], consumed: number): {info: FoeKnown; consumed: number} {
  if (events.length <= consumed) return {info, consumed};
  const next = clone(info);
  for (const line of events.slice(consumed)) applyEvent(next, line);
  return {info: next, consumed: events.length};
}

function applyEvent(info: FoeKnown, line: string): void {
  const parts = line.split('|');
  const kind = parts[1];
  const who = parts[2] ?? '';
  if (!who.startsWith('p2')) return;
  const position = who.startsWith('p2a') ? 1 : 2;
  info.lastEvent = line;
  if (kind === 'move') info.moves.add(parts[3] ?? '');
  if (kind === 'faint') {
    info.fainted.add(position);
    info.present.delete(position);
  }
  if (kind === 'switch' || kind === 'drag') {
    // 上场的是一只新宝可梦：身上状态与能力变化都从零开始（本轮不区分是哪一只，只清空）。
    info.present.add(position);
    info.statuses.clear();
    info.boosts.clear();
    const species = (parts[3] ?? '').split(',')[0]?.trim() ?? '';
    const health = /(\d+)\/(\d+)/.exec(parts[4] ?? '');
    if (species) {
      info.moves.add(species);
      info.roster.set(position, {
        species,
        hpPercent: health ? Math.floor((Number(health[1]) / Number(health[2])) * 100) : 100
      });
    }
  }
  if (kind === '-damage' || kind === '-heal') {
    const health = /(\d+)\/(\d+)/.exec(parts[3] ?? '');
    const current = info.roster.get(position);
    if (health && current) info.roster.set(position, {...current, hpPercent: Math.floor((Number(health[1]) / Number(health[2])) * 100)});
  }
  if (kind === '-status' && parts[3]) info.statuses.add(parts[3]!);
  if (kind === '-curestatus' && parts[3]) info.statuses.delete(parts[3]!);
  if (kind === '-boost' && parts[3]) info.boosts.set(parts[3]!, (info.boosts.get(parts[3]!) ?? 0) + Number(parts[4] ?? 1));
  if (kind === '-unboost' && parts[3]) info.boosts.set(parts[3]!, (info.boosts.get(parts[3]!) ?? 0) - Number(parts[4] ?? 1));
  if (kind === '-clearboost' || kind === '-clearallboost') info.boosts.clear();
}
