// 战术消解用的名字表：玩家可能写的中文名、英文原名、内部 ID 都映射到引擎显示名（英文原名）。

import {Engine} from './engine.ts';
import {chineseNames} from '../game/localization.ts';

/**
 * 常见别称：PokéAPI 的 zh-hans 名字里缺少或与常用译名不同的写法。
 * 例如「保护」在数据里只对应「保护色」，而 YOLO 常用的「守住/保护」都指 Protect。
 */
export const ALIASES: Record<string, string> = {
  保护: 'Protect',
  守住: 'Protect',
  加鲁克: 'Blastoise',
  水箭龟: 'Blastoise',
  チルタリス: 'Altaria'
};

export interface MoveIndex {
  /** 任意写法（中文名/英文名/ID）→ 引擎显示名。 */
  moves: Map<string, string>;
  species: Map<string, string>;
  /** 所有中文名字：混淆词（如「稳住」）出现在这里时不做拼写模糊匹配。 */
  chinese: Set<string>;
}

let cached: MoveIndex | null = null;

/** 基础形态（num 小、不是 Gmax/Mega/地区形态）排前面，用来在同一中文名对应多个形态时挑一个。 */
function baseForm(dex: typeof Engine.Dex.prototype, name: string): number {
  const data = (dex as any).species.get(name);
  if (!data || !data.exists) return Number.MAX_SAFE_INTEGER;
  return data.num * 10 + (data.forme ? 1 : 0) * 5 + (data.isGigantamax ? 4 : 0) + (data.isMega ? 3 : 0);
}

export function nameIndex(dex: typeof Engine.Dex.prototype): MoveIndex {
  if (cached) return cached;
  const moves = new Map<string, string>();
  const species = new Map<string, string>();
  const chinese = new Set<string>();
  // 中文名表是「ID → 中文名」，这里反过来登记「中文名 → 显示名」。
  // 同一索引可能对应多个形态（如「喷火龙」→ Charizard / Charizard-Gmax），取形态编号最小的基础形态。
  const pick = (names: string[]) => names.sort((a, b) => baseForm(dex, a) - baseForm(dex, b) || a.localeCompare(b))[0]!;
  const movesByName = new Map<string, string[]>();
  for (const [id, name] of Object.entries(chineseNames.moves)) {
    const data = dex.moves.get(id);
    if (!data.name) continue;
    moves.set(id, data.name);
    movesByName.set(name, [...(movesByName.get(name) ?? []), data.name]);
  }
  for (const [name, values] of movesByName) {
    chinese.add(name);
    moves.set(name, pick(values));
  }
  const speciesByName = new Map<string, string[]>();
  for (const [id, name] of Object.entries(chineseNames.species)) {
    const data = dex.species.get(id);
    if (!data.name) continue;
    species.set(id, data.name);
    speciesByName.set(name, [...(speciesByName.get(name) ?? []), data.name]);
  }
  for (const [name, values] of speciesByName) {
    chinese.add(name);
    species.set(name, pick(values));
  }
  // 引擎自己的 ID 与显示名也写进表，但中文名的映射优先：写「喷火龙」时不要被 Charizard-Gmax 抢走。
  for (const entry of (dex as any).moves.all()) {
    if (!entry.exists) continue;
    if (!moves.has(entry.id)) moves.set(entry.id, entry.name);
    if (!moves.has(Engine.toID(entry.name))) moves.set(Engine.toID(entry.name), entry.name);
    if (!moves.has(entry.name)) moves.set(entry.name, entry.name);
  }
  for (const entry of (dex as any).species.all()) {
    if (!entry.exists || entry.isMega || entry.isGigantamax) continue;
    if (!species.has(entry.id)) species.set(entry.id, entry.name);
    if (!species.has(Engine.toID(entry.name))) species.set(Engine.toID(entry.name), entry.name);
    if (!species.has(entry.name)) species.set(entry.name, entry.name);
  }
  // 别称最后写入：它们优先于数据里同名但指向别的招式的条目（如「保护」）。
  for (const [alias, target] of Object.entries(ALIASES)) {
    const move = dex.moves.get(target);
    if (move.exists) moves.set(alias, move.name);
    const data = dex.species.get(target);
    if (data.exists) species.set(alias, data.name);
    chinese.add(alias);
  }
  cached = {moves, species, chinese};
  return cached;
}
