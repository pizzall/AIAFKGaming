import {readFileSync} from 'node:fs';
import {randomInt} from 'node:crypto';
import {Engine, engineRevision} from './engine.ts';
import {createBattleDex, deserializeEffects} from './effects.ts';
import {contentFingerprint} from './publication.ts';
import {createTacticsAgent, type DecisionTrace} from './agent.ts';
import {nameIndex} from './names.ts';
import {playerTeam, npcTemplates, selectNpcTemplate, type TeamMember} from './fixtures.ts';
import {dex as strategyDex} from '../game/catalog.ts';

const config = JSON.parse(readFileSync(new URL('../../config/battle-effects.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../../config/effect-catalog.json', import.meta.url), 'utf8'));
export const ruleFingerprint = contentFingerprint({config, catalog});
if (catalog.engineRevision !== engineRevision || catalog.mechanicsMod !== 'gen9') throw new Error('Effect catalog version mismatch');
const overrides = deserializeEffects(config.effects);
const merged = new Map(deserializeEffects(catalog.effects).map(definition => [`${definition.kind}:${definition.engineId}`, definition]));
for (const definition of overrides) {
  const key = `${definition.kind}:${definition.engineId}`;
  if (!merged.has(key)) throw new Error(`Effect is missing from the pinned catalog: ${key}`);
  merged.set(key, definition);
}
const mod = createBattleDex(config.revision, [...merged.values()]);

export function battleFormat(): any {
  return new Engine.Format({
    id: `afk${mod}`, name: 'AFK six-member doubles', effectType: 'Format', mod, gameType: 'doubles',
    ruleset: [
      'Obtainable', '+Past', 'Min Source Gen = 1', 'Dynamax Clause', 'Terastal Clause', 'Z-Move Clause',
      'Min Team Size = 6', 'Max Team Size = 6'
    ]
  });
}

export function validateTeam(team: TeamMember[]): void {
  if (!Array.isArray(team) || team.length !== 6) throw new Error('Exactly six members are required');
  for (const member of team) {
    if (!Number.isSafeInteger(member.level) || member.level < 1 || member.level > 100) throw new Error('Invalid level');
    if (!Array.isArray(member.moves) || member.moves.length < 1 || member.moves.length > 4) throw new Error('Invalid moves');
  }
  const format = battleFormat();
  // Disable import-UI warnings (zero EVs / level 50) only, not stat or learnset legality. Actual battles stay non-debug.
  format.debug = true;
  const problems = new Engine.TeamValidator(format).validateTeam(structuredClone(team));
  if (problems?.length) throw new Error(problems.join('; '));
}

export function makeBattle(left: TeamMember[], right: TeamMember[], seed: number[] = [1, 2, 3, 4]): any {
  validateTeam(left);
  validateTeam(right);
  const battle = new Engine.Battle({format: battleFormat(), seed});
  battle.setPlayer('p1', {name: '训练家小叶', team: structuredClone(left)});
  battle.setPlayer('p2', {name: '研究员青叶', team: structuredClone(right)});
  return battle;
}

// The agent receives only its own request. It never receives the Battle or opposing team objects.
export function chooseFromRequest(request: any): string {
  if (request.wait) return '';
  const reserves = request.side.pokemon
    .map((pokemon: any, index: number) => ({pokemon, index: index + 1}))
    .filter(({pokemon}: any) => !pokemon.active && !pokemon.condition.endsWith(' fnt'));
  const used = new Set<number>();
  if (request.forceSwitch) {
    return request.forceSwitch.map((forced: boolean) => {
      if (!forced) return 'pass';
      const candidate = reserves.find(({index}: any) => !used.has(index));
      if (!candidate) return 'pass';
      used.add(candidate.index);
      return `switch ${candidate.index}`;
    }).join(', ');
  }
  let megaChosen = false;
  return request.active.map((active: any, index: number) => {
    if (!active || request.side.pokemon[index]?.condition.endsWith(' fnt')) return 'pass';
    const slot = active.moves.findIndex((move: any) => !move.disabled && move.pp !== 0);
    if (slot < 0) return 'move 1'; // The engine supplies Struggle when applicable.
    const move = active.moves[slot];
    const target = ['normal', 'adjacentFoe', 'any'].includes(move.target) ? ' 1' : '';
    const mega = active.canMegaEvo && !megaChosen ? ' mega' : '';
    if (mega) megaChosen = true;
    return `move ${slot + 1}${mega}${target}`;
  }).join(', ');
}

export type AgentKind = 'scripted' | 'tactics';

export interface BattleResult {
  status: 'completed';
  turns: number;
  winner: string;
  winnerSide: 'p1' | 'p2' | null;
  agentKind: AgentKind;
  /** 玩家一方（p1）的决策记录；对手一方不记录。 */
  playerDecisions?: DecisionTrace[];
  engineRevision: string;
  configRevision: string;
  ruleFingerprint: string;
  npcTemplateKey: string;
  seed: number[];
  events: string[];
  opponentEvents: string[];
  decisions: Array<{sequence: number; side: string; choice: string; accepted: boolean}>;
  privateSnapshot: {playerTeam: TeamMember[]; npcTeam: TeamMember[]; npcTactic: string};
}

export interface BattleInput {
  seed?: number[];
  npcIndex?: number;
  left?: TeamMember[];
  right?: TeamMember[];
  npcTactic?: string;
  playerTactic?: string;
  agent?: AgentKind;
}

/** 把玩家一方（p1）的决策记录交给前端，只保留格式与理由，不暴露索引之外的内部对象。 */
export function publicDecisions(result: BattleResult): DecisionTrace[] {
  return result.playerDecisions ?? [];
}

export function runBattle(input: BattleInput = {}): BattleResult {
  const seed = input.seed ?? [randomInt(65536), randomInt(65536), randomInt(65536), randomInt(65536)];
  if (seed.length !== 4 || seed.some(value => !Number.isInteger(value) || value < 0 || value > 65535)) {
    throw new Error('Invalid battle seed');
  }
  const npc = input.right ? {key: 'frozen-defense', team: input.right, tactic: input.npcTactic ?? ''}
    : selectNpcTemplate(input.npcIndex ?? randomInt(npcTemplates.length));
  const left = input.left ?? playerTeam;
  const agentKind = input.agent ?? 'scripted';
  const agent = agentKind === 'tactics' ? createTacticsAgent(strategyDex, input.playerTactic ?? '', nameIndex(strategyDex)) : null;
  const battle = makeBattle(left, npc.team, seed);
  const decisions: BattleResult['decisions'] = [];
  let seen: string[] | null = null;
  for (let sequence = 0; !battle.ended && sequence < 2000; sequence++) {
    if (battle.turn > 250) throw new Error('Battle exceeded verification turn bound');
    // Freeze both requests before submitting either side, even though the agents are deterministic.
    const requests = battle.sides.map((side: any) => structuredClone(side.activeRequest));
    const state = battle.requestState as string | undefined;
    if (requests[0] && agent) {
      // 上一回合的本方事件：只含 p1 自己看到的 p2 行，对手的招式与倒下只能从这里学。
      if (seen) agent.observe(Engine.extractChannelMessages(seen.join('\n'), [1])[1]);
    }
    // 两份请求都先冻结、再分别决策；对手仍走固定策略。
    const choices = requests.map((request: any, index: number) =>
      request ? (index === 0 && agent ? agent.decide(request, state) : chooseFromRequest(request)) : ''
    );
    seen = Engine.extractChannelMessages(battle.log.join('\n'), [1])[1];
    if (!choices.some(Boolean)) throw new Error('No actionable battle request');
    for (let i = 0; i < 2; i++) {
      if (!choices[i]) continue;
      const accepted = battle.sides[i].choose(choices[i]);
      decisions.push({sequence, side: `p${i + 1}`, choice: choices[i], accepted});
      if (!accepted) throw new Error(`Agent choice rejected: ${battle.sides[i].choice.error}`);
    }
    battle.commitChoices();
  }
  if (!battle.ended) throw new Error('Battle exceeded execution bound');
  const events = Engine.extractChannelMessages(battle.log.join('\n'), [1])[1]
    .filter((line: string) => !line.startsWith('|t:|'));
  const opponentEvents = Engine.extractChannelMessages(battle.log.join('\n'), [2])[2]
    .filter((line: string) => !line.startsWith('|t:|'));
  return {
    status: 'completed', turns: battle.turn, winner: battle.winner, opponentEvents,
    winnerSide: battle.winner ? (battle.winner === battle.p1.name ? 'p1' : 'p2') : null, agentKind, engineRevision,
    ...(agent ? {playerDecisions: agent.decisions} : {}),
    configRevision: config.revision, ruleFingerprint, npcTemplateKey: npc.key, seed, events, decisions,
    privateSnapshot: {playerTeam: structuredClone(left), npcTeam: npc.team, npcTactic: npc.tactic}
  };
}
