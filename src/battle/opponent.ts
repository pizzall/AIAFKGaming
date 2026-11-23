// 让「看不到的对手」的可验证性跟随日志：本方视角里对手的攻击、状态与倒下会以事件形式出现，
// 而这些事件里出现的招式池是「会」信息的唯一合法来源（请求里没有对手招式表）。

export type FoeInfo = {
  /** 已经出现过、能确认在对手身上的招式（显示名）。 */
  moves: Set<string>;
  /** 已经确认倒下的对手位置（1/2）。 */
  fainted: Set<number>;
  /** 当前能确认在场上、且没有倒下的对手位置。 */
  present: Set<number>;
  /** 最近一条对手事件（用于判断状态/能力变化）。 */
  lastEvent: string | null;
};

export function emptyFoeInfo(): FoeInfo {
  return {moves: new Set(), fainted: new Set(), present: new Set([1, 2]), lastEvent: null};
}

/** 从本方可见的协议事件里累积对手信息；只读 `|p2…` 的行。 */
export function foldFoeEvents(info: FoeInfo, events: string[]): FoeInfo {
  const next: FoeInfo = {moves: new Set(info.moves), fainted: new Set(info.fainted), present: new Set(info.present), lastEvent: info.lastEvent};
  for (const line of events) {
    const parts = line.split('|');
    const kind = parts[1];
    const who = parts[2] ?? '';
    if (!/^p2[ab]?:/.test(who.replace(/^p2[ab]?: ?/, 'p2:'))) continue;
    const slot = who.startsWith('p2a') ? 1 : 2;
    next.lastEvent = line;
    if (kind === 'move') next.moves.add(parts[3] ?? '');
    if (kind === 'faint') {
      next.fainted.add(slot);
      next.present.delete(slot);
    }
    if (kind === 'switch' || kind === 'drag') next.present.add(slot);
  }
  return next;
}
