import type {TeamMember} from '../battle/fixtures.ts';

export type Stats = {hp: number; atk: number; def: number; spa: number; spd: number; spe: number};
export interface Partner {
  id: string;
  species: string;
  name: string;
  nickname?: string;
  image: string | null;
  level: number;
  exp: number;
  nature: string;
  ability: string;
  gender: string;
  ivs: Stats;
  evs: Stats;
  friendship: number;
  moves: string[];
  learnedMoves: string[];
  pp: Record<string, number>;
  heldItem: string;
  hp: number;
  maxHp: number;
  status: string;
  origin: string;
}
export interface Exploration {
  region: string;
  team: string[];
  cursor: number;
  recoveryUntil: number | null;
  startedAt: number;
  supplies?: Array<SupplySlot | null>;
  summary: {wins: number; losses: number; captures: number; xp: number; recoverySeconds: number};
}
export interface SupplySlot {
  resource: string;
  quantity: number;
}
export interface Facility {
  key: string;
  level: number;
  workers: string[];
  cursor: number;
  remainder: number;
}
export interface Plot {
  berry: string | null;
  plantedAt: number;
  cursor: number;
  buffer: number;
}
export interface Nursery {
  phase: 'empty' | 'producing' | 'ready' | 'hatching' | 'complete';
  parents: string[];
  manager: string | null;
  eggCount: number;
  completeAt: number;
  offspring: Partner[];
}
export interface GameLog {
  at: number;
  kind: string;
  message: string;
}
export interface TeamPreset {
  id: string;
  name: string;
  team: string[];
  tactic: string;
}
export interface PlayerClockState {
  clockOffset: number;
  clockRate?: number;
  clockAnchorRealAt?: number;
}
export interface PlayerState extends PlayerClockState {
  id: string;
  username: string;
  rng: number;
  serial: number;
  inventory: Record<string, number>;
  pokemon: Partner[];
  team: string[];
  tactic: string;
  presets?: TeamPreset[];
  readyPresetId?: string | null;
  wishlist: string[];
  exploration: Exploration | null;
  facilities: Facility[];
  plots: Plot[];
  nursery: Nursery;
  honors: string[];
  logs: GameLog[];
  catchingUp: boolean;
  purchaseCounts: Record<string, number>;
  centerUntil: number | null;
  centerTeam?: string[];
}
export interface Gym {
  key: string;
  name: string;
  level: number;
  holderKind: 'npc' | 'player';
  ownerId?: string;
  ownerName: string;
  defense?: {team: TeamMember[]; tactic: string};
  version: number;
  activeBattleId: string | null;
}
export interface WorldState {
  season: number;
  gyms: Gym[];
}
/** 一轮决策记录：两种模式的对照结果落在这里，避免两种比较各存一份。 */
export interface DecisionRecord {
  revision: string;
  tactic: string;
  seed: number[];
  outcomes: Array<{
    mode: 'direct' | 'refined';
    turns: number;
    winnerSide: 'p1' | 'p2' | null;
    error: string | null;
    decisions: Array<{sequence: number; choice: string; used: string[]; ignored: string[]; targets: string[]}>;
  }>;
  mistakes: Array<{mode: 'direct' | 'refined'; sequence: number; kind: string; text: string; detail: string}>;
  winnerAgreement: boolean;
  /** 第八轮：误解定位与二次定位的纠正统计。 */
  fidelity?: {
    corrected: number;
    remaining: number;
    fixes: Array<{idea: string; stage: string; fix: string}>;
  };
}
export interface ComparisonBattle {
  id: string;
  ownerId: string;
  createdAt: string;
  tactic: string;
  seed: number[];
  record: DecisionRecord;
}
/** 战术文本上限：按 Unicode 字符数计算，换行与全角标点各算一个字符。 */
export const TACTIC_LIMIT = 500;
/** 与 `src/battle/tactics.ts` 的计数保持一致：按 Unicode 码点，换行与全角标点各算 1 个。 */
export function tacticLength(tactic: string): number {
  return Array.from(tactic).length;
}
/** 只允许可见字符与换行：控制字符、零宽字符和未配对代理会被拒绝而不是静默丢掉。 */
export function tacticCharacters(raw: string): string | null {
  // 换行与制表是排版字符，允许保存；其它控制字符（含 \r）一律拒绝。
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(raw)) return '战术里不能有控制字符。';
  if (/[\u200B-\u200F\u202A-\u202E\uFEFF]/.test(raw)) return '战术里不能有零宽或方向控制字符。';
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/.test(raw)) return '战术里有不成对的字符。';
  return null;
}
export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
