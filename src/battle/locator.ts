// 第八轮：纠错定位器。
//
// 第七轮只知道「refined 活得久」，不知道它具体修好了哪几条。本轮把每条误解定位到：
//  - 流水线阶段（undiscovered → unresolved → scene-checked → guarded → queued → executed → rejected）；
//  - 两种模式的对照 id（同一条误解在两个模式里的编号）；
//  - 是否被二次定位纠正（refined 在这一回合执行了 direct 没执行的意图）。
//
// 定位器只读两种模式各自的决策记录，不做任何推测：一条误解只能在「有直接证据」时被判定为已纠正。

export type Stage = 'undiscovered' | 'unresolved' | 'scene-checked' | 'guarded' | 'queued' | 'executed' | 'rejected';

export interface Located {
  /** 对照 id：两种模式里指向同一条误解。 */
  id: string;
  idea: string;
  stage: Stage;
  direct: {choice: string | null; text: string};
  refined: {choice: string | null; text: string};
  corrected: boolean;
  fix: string | null;
}

export interface Fidelity {
  corrected: number;
  remaining: number;
  /** 每条修正好在哪一步：可读的结论。 */
  fixes: Array<{idea: string; fix: string; /** 产生修正的阶段。 */ stage: Stage}>;
}

const STAGE_LABEL: Record<Stage, string> = {
  undiscovered: '文本层没有拆出来',
  unresolved: '拆出来了但没消解成招式/宝可梦',
  'scene-checked': '不可验证（看不到的信息）',
  guarded: '等条件成立',
  queued: '进了队列',
  executed: '执行了',
  rejected: '被引擎拒绝'
};

export function label(stage: Stage): string {
  return STAGE_LABEL[stage];
}

/** 从一条决策记录里读出「这条动作在第几步、因为什么没执行」。 */
function stageOf(reason: string, ignored: string[]): Stage {
  if (reason.includes('引擎拒绝')) return 'rejected';
  if (ignored.some((value) => value.startsWith('未识别'))) return 'unresolved';
  if (ignored.some((value) => value.startsWith('不可验证'))) return 'scene-checked';
  if (ignored.some((value) => value.startsWith('条件'))) return 'guarded';
  if (reason.includes('默认策略')) return 'undiscovered';
  return 'queued';
}

export interface DecisionLike {
  sequence: number;
  choice: string;
  used: string[];
  ignored: string[];
  targets: string[];
  reason: string;
}

function keyOf(value: string, sequence: number): string {
  return `${sequence}:${value}`;
}

/** 每个决策里单独的「误解项」：未识别、不可验证、条件、否定、例外、引擎拒绝。 */
function ideas(decision: DecisionLike): string[] {
  return [...decision.ignored.filter((value) => !value.startsWith('条件（未解析）'))];
}

export function compareFidelity(
  direct: DecisionLike[],
  refined: DecisionLike[],
  directError: string | null,
  refinedError: string | null
): Fidelity {
  const fixes: Fidelity['fixes'] = [];
  const located: Located[] = [];
  const all = new Set<string>();
  for (const decision of [...direct, ...refined]) for (const idea of ideas(decision)) all.add(idea);
  for (const idea of all) {
    const inDirect = direct.find((decision) => decision.ignored.includes(idea));
    const inRefined = refined.find((decision) => decision.ignored.includes(idea));
    const stage = stageOf(inRefined?.reason ?? '', [idea]);
    const corrected = !!inRefined && !!inDirect && stage !== 'unresolved' && stage !== 'scene-checked' && inRefined.used.length > 0;
    located.push({
      id: keyOf(idea, inRefined?.sequence ?? inDirect?.sequence ?? -1),
      idea,
      stage,
      direct: {choice: inDirect?.choice ?? null, text: inDirect?.reason ?? '没有走到这一步'},
      refined: {choice: inRefined?.choice ?? null, text: inRefined?.reason ?? '没有走到这一步'},
      corrected,
      fix: corrected ? `二次定位把「${idea}」从「${label(stageOf(inDirect?.reason ?? '', [idea]))}」推进到「${label(stage)}」` : null
    });
    if (corrected) fixes.push({idea, stage, fix: `二次定位纠正：${label(stage)}`});
  }
  if (directError) {
    located.push({
      id: `engine:${directError}`,
      idea: directError,
      stage: 'rejected',
      direct: {choice: null, text: directError},
      refined: {choice: refinedError ?? '已完成', text: refinedError ?? '引擎接受'},
      corrected: !refinedError,
      fix: !refinedError ? '二次定位让同一命令被引擎接受' : null
    });
    if (!refinedError) fixes.push({idea: directError, stage: 'rejected', fix: '二次定位让同一命令被引擎接受'});
  }
  const remaining = Math.max(0, all.size + (directError ? 1 : 0) - fixes.length);
  return {corrected: fixes.length, remaining, fixes};
}

/** 定位总表：按阶段分组，回答「误解发生在哪一步」。 */
export function byStage(fixes: Fidelity['fixes']): Map<Stage, number> {
  const result = new Map<Stage, number>();
  for (const fix of fixes) result.set(fix.stage, (result.get(fix.stage) ?? 0) + 1);
  return result;
}


