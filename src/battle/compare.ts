// 第七轮：在同一队伍、同一种子、同一信息与预算下，比较两种决策方式：
//
// A「直接依据文本决策」：只读战术文本 → 第一遍拆解 → 按拆解顺序直接出招；
// B「意图拆解后结合战局二次定位」：在第一遍拆解之后，用可见战局重判条件、目标、例外与默认。
//
// 两种方式共享：同一支队伍、同一对手、同一种子、同一条日志累积规则、同一个请求预算（每回合最多读一次请求），
// 以及同一个「替换适配器」（引擎的替换请求在单只倒下时没有 forceSwitch，要按 requestState 补齐）。
// 胜负只作辅助指标，审计要回答的是「误解发生在哪一步」。

import {Engine, engineRevision} from './engine.ts';
import type {MoveIndex} from './tactics.ts';
import {createTacticsAgent, type DecisionTrace} from './agent.ts';
import {chooseFromRequest, makeBattle} from './runner.ts';
import type {TeamMember} from './fixtures.ts';
import type {DecisionRecord} from '../game/types.ts';
import {readView} from './view.ts';
import {benchSlot} from './layout.ts';
import {compareFidelity, type Fidelity} from './locator.ts';

export type Mode = 'direct' | 'refined';

export interface BattleOutcome {
  mode: Mode;
  seed: number[];
  turns: number;
  winnerSide: 'p1' | 'p2' | null;
  /** 玩家一方的决策记录。 */
  decisions: DecisionTrace[];
  error: string | null;
}

export interface Mistake {
  mode: Mode;
  /** 第几次决策。 */
  sequence: number;
  /** 误解类型：没消解、条件被当成立/不成立、目标没按词挑、否定吞错、默认兜底、引擎拒绝。 */
  kind: 'unresolved' | 'condition-missed' | 'at-condition' | 'await-refinement' | 'scene-target' | 'negation-scope' | 'default' | 'engine-reject';
  /** 文本位置或动作原文，便于定位回放。 */
  text: string;
  detail: string;
}

export interface ComparisonReport {
  tactic: string;
  seed: number[];
  left: string[];
  right: string[];
  outcomes: BattleOutcome[];
  mistakes: Mistake[];
  /** 胜负只在辅助栏：同一配置下两种方式的胜负是否一致。 */
  winnerAgreement: boolean;
  /** 第八轮：把每条误解定位到流水线阶段，并统计二次定位纠正了多少条。 */
  fidelity: Fidelity;
}

const BUDGET = 1;

/**
 * A「直接依据文本决策」：直接拿第一遍拆解的顺序出招。
 * 第五、六轮已经有「条件/目标/默认」的完善逻辑，但它们只属于 B；A 这里特意退回到「只看拆解顺序」，
 * 这样两个模式比较的才是「是否结合战局做二次定位」，而不是「谁功能更全」。
 */
function directChoice(request: any, tactic: string, dex: typeof Engine.Dex.prototype, index?: MoveIndex, requestState?: string): string {
  const agent = createTacticsAgent(dex, tactic, index);
  void requestState;
  const usable = agent.intent.actions.filter((action) => action.move && !action.conditional);
  const byMove = new Map(usable.map((action) => [action.move, action]));
  // 只按文本顺序认领：不看条件、不看目标词、不看战局。
  return (request.active ?? [])
    .map((active: any, slot: number) => {
      if (!active) return 'pass';
      const wanted = [...byMove.keys()].find((name) => {
        const id = name!.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (active.moves ?? []).some((move: any) => move.id === id && !move.disabled && move.pp !== 0);
      });
      if (!wanted) {
        const fallback = (active.moves ?? []).findIndex((move: any) => !move.disabled && move.pp > 0);
        return `move ${(fallback < 0 ? 0 : fallback) + 1}`;
      }
      const slotIndex = (active.moves ?? []).findIndex((move: any) => move.id === wanted!.toLowerCase().replace(/[^a-z0-9]/g, '') && !move.disabled && move.pp !== 0);
      const move = active.moves[slotIndex];
      // 目标固定 1 号位：不比较对手体力、速度、威胁。
      const target = ['normal', 'any', 'adjacentFoe'].includes(move?.target) ? ' 1' : '';
      return `move ${slotIndex + 1}${target}`;
    })
    .join(', ');
}

function refine(
  request: any,
  tactic: string,
  dex: typeof Engine.Dex.prototype,
  index: MoveIndex | undefined,
  requestState: string | undefined,
  agent: ReturnType<typeof createTacticsAgent>
): string {
  void tactic;
  return agent.decide(request, requestState);
}

/** 跑一场：两个模式共享种子、队伍、对手、日志累积和请求预算。 */
export function runComparison(tactic: string, dex: typeof Engine.Dex.prototype, options: {seed: number[]; left: TeamMember[]; right: TeamMember[]; index?: MoveIndex}): ComparisonReport {
  const outcomes = ['direct', 'refined'].map((mode) => play(mode as Mode, tactic, dex, options));
  const mistakes = outcomes.flatMap((outcome) => audit(outcome, tactic));
  const first = outcomes[0]!;
  const second = outcomes[1]!;
  return {
    tactic,
    seed: options.seed,
    left: options.left.map((member) => member.species),
    right: options.right.map((member) => member.species),
    outcomes,
    mistakes,
    winnerAgreement: first.winnerSide === second.winnerSide,
    // 误会定位：拿两种模式的决策记录逐条对照，回答「二次定位纠正了哪几条、还剩下哪几条」。
    fidelity: compareFidelity(first.decisions, second.decisions, first.error, second.error)
  };
}

/**
 * 两种模式共用的替换适配器：替换请求里没有 forceSwitch（单只倒下时只有 requestState === 'switch'），
 * 先进引擎问一次它会接受哪个下标，再按队伍顺序补齐。这里只读引擎自己的报错，不读对手任何信息。
 */
function adaptSwitch(battle: any, view: ReturnType<typeof readView>, first: string, needed: number): string {
  const picks: number[] = [];
  const taken = new Set<number>();
  for (let seat = 0; seat < needed; seat++) {
    const wanted = seat === 0 ? first : '';
    const slot = benchSlot(view, wanted || null, taken);
    if (slot < 0) break;
    taken.add(slot);
    picks.push(slot);
  }
  // 下标被引擎认掉就保留，否则依次往后挪：引擎的下标顺序就是 side.pokemon 的顺序。
  const accepted: number[] = [];
  for (const pick of picks) {
    for (let candidate = pick; candidate <= 6; candidate++) {
      const trial = [...accepted, candidate].map((value) => `switch ${value}`).join(', ');
      if (battle.sides[0].choose(trial)) {
        accepted.push(candidate);
        break;
      }
    }
  }
  return accepted.map((value) => `switch ${value}`).join(', ');
}

function play(mode: Mode, tactic: string, dex: typeof Engine.Dex.prototype, options: {seed: number[]; left: TeamMember[]; right: TeamMember[]; index?: MoveIndex}): BattleOutcome {
  const battle = makeBattle(options.left, options.right, options.seed);
  const agent = createTacticsAgent(dex, tactic, options.index);
  const decisions: DecisionTrace[] = [];
  let seen: string[] | null = null;
  let error: string | null = null;
  // 请求预算：每回合只读一次本方请求，两种模式一致（`BUDGET` 就是这条上限）。
  void BUDGET;
  for (let step = 0; step < 500 && !battle.ended; step++) {
    const requests = battle.sides.map((side: any) => structuredClone(side.activeRequest));
    const state = battle.requestState as string | undefined;
    if (seen) agent.observe(Engine.extractChannelMessages(seen.join('\n'), [1])[1]);
    const own = requests[0];
    const other = requests[1];
    let playerChoice = !own ? '' : mode === 'refined' ? refine(own, tactic, dex, options.index, state, agent) : directChoice(own, tactic, dex, options.index, state);
    seen = Engine.extractChannelMessages(battle.log.join('\n'), [1])[1];
    if (!playerChoice && !other) break;
    if (playerChoice && !battle.sides[0].choose(playerChoice)) {
      const failed = battle.sides[0].choice.error ?? '';
      if (state === 'switch' || (/switch|choices/i.test(failed) && own)) {
        // 两种模式共用同一个替换适配器：先按战术点名/顺序给出位置，再问引擎它接受哪个。
        const view = readView(own, state);
        const wanted = mode === 'refined'
          ? agent.plan.actions.find((action) => action.switchTo)?.switchTo ?? ''
          : own.forceSwitch?.length ?? 1;
        const needed = own.forceSwitch?.length ?? 1;
        playerChoice = adaptSwitch(battle, view, typeof wanted === 'number' ? '' : wanted, needed);
      }
      if (!playerChoice || !battle.sides[0].choose(playerChoice)) {
        error = battle.sides[0].choice.error ?? failed;
        decisions.push({sequence: step, side: 'p1', choice: playerChoice, used: [], ignored: [], targets: [], reason: '引擎拒绝（替换适配失败）'});
        break;
      }
    }
    if (other) battle.sides[1].choose(chooseFromRequest(other));
    battle.commitChoices();
    if (mode === 'refined' && agent.decisions.length) decisions.push(agent.decisions.at(-1)!);
    else if (mode === 'direct') {
      decisions.push({
        sequence: step, side: 'p1', choice: playerChoice, used: [], ignored: [], targets: [],
        reason: state === 'switch' ? '直接按顺序替换' : '直接按文本顺序出招'
      });
    }
  }
  return {
    mode,
    seed: options.seed,
    turns: battle.turn,
    winnerSide: battle.winner ? (battle.winner === battle.p1.name ? 'p1' : 'p2') : null,
    decisions,
    error
  };
}

/** 误解审计：把两种模式的决策逐条对照，定位「误解发生在哪一步」。 */
export function audit(outcome: BattleOutcome, tactic: string): Mistake[] {
  const mistakes: Mistake[] = [];
  if (outcome.error) mistakes.push({mode: outcome.mode, sequence: outcome.decisions.length, kind: 'engine-reject', text: outcome.error, detail: '引擎拒绝了这条命令'});
  for (const decision of outcome.decisions) {
    for (const value of decision.ignored) {
      // 这些条目是「知道但没有接进决策」：就是误解发生的位置。
      const text = value.replace(/^[^：]+：/, '');
      const kind: Mistake['kind'] = value.startsWith('未识别')
        ? 'unresolved'
        : value.startsWith('不可验证') || value.startsWith('条件') || value.startsWith('负向判断')
          ? 'at-condition'
          : value.startsWith('否定')
            ? 'negation-scope'
            : 'await-refinement';
      mistakes.push({mode: outcome.mode, sequence: decision.sequence, kind, text, detail: value});
    }
    if (!decision.used.length && outcome.mode === 'direct' && decision.choice.includes('move')) {
      mistakes.push({mode: outcome.mode, sequence: decision.sequence, kind: 'default', text: decision.choice, detail: '战术里没有能用的动作，直接退回第一招'});
    }
    if (outcome.mode === 'refined' && decision.targets.length) {
      for (const value of decision.targets.filter((item) => item.startsWith('放弃'))) {
        mistakes.push({mode: outcome.mode, sequence: decision.sequence, kind: 'scene-target', text: value, detail: '二次定位放弃了这项比较'});
      }
    }
  }
  void tactic;
  return mistakes;
}

/** 把比较结果落成可查询的记录（服务端保存后供前端对照）。 */
export function toRecord(report: ComparisonReport): DecisionRecord {
  return {
    revision: engineRevision,
    tactic: report.tactic,
    seed: report.seed,
    outcomes: report.outcomes.map((outcome) => ({
      mode: outcome.mode, turns: outcome.turns, winnerSide: outcome.winnerSide, error: outcome.error,
      decisions: outcome.decisions.map(( decision) => ({sequence: decision.sequence, choice: decision.choice, used: decision.used, ignored: decision.ignored, targets: decision.targets}))
    })),
    mistakes: report.mistakes,
    winnerAgreement: report.winnerAgreement,
    fidelity: report.fidelity
  };
}


