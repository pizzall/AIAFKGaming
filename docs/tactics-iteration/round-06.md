# 第 6 轮：目标比较、整段事件回放、显式默认与预算裁剪

- 分支：`round-06-targets-and-budget`（从 `round-05-conditions-and-opponents` 出发）
- 代码：`src/battle/targets.ts`（新增：目标比较）、`src/battle/defaults.ts`（新增：默认策略分类）、
  `src/battle/splits.ts`（新增：拆句/否定作用域/预算裁剪）、`src/battle/opponent.ts`（整段事件 + roster + 体力）、
  `src/battle/tactics.ts`、`src/battle/agent.ts`
- 测试：`tests/tactics.test.ts`（12 条）

## 本轮修掉了上一轮的什么

1. **目标比较**：`lowestHp/highestHp` 用日志里累积的对手体力百分比比较；`threat/highestAttack` 用「我方招式 × 属性倍率」
   估计；比不了的（速度、复数目标）显式写进 `unscored`，不会当成「随便挑」。
2. **对手信息累积**：`observe` 改成「整段本方事件 + 已消费条数」，没有请求的回合（替换回合）不会丢一段；
   同时把对手物种与每次 `-damage` 后的体力百分比记进 `roster`，作为目标比较的唯一数据源。
3. **显式默认**：`DefaultPolicy` 分开记录「空战术 / 无法消解 / 条件不成立 / 没有可用招式」，
   默认招式统一走 `layout.defaultMove`，不再散落在 agent 里。
4. **拆句与否定**：`splits.ts` 把「。」（中文句号）也算分句符，否定截止符号补上了中文逗号；
   超长文本按整句裁剪，不会把一句劈成半句。

## 本轮做得不够好的地方（测试逐条验证）

1. **「除非…否则不要…」没有语义**：例外句里真正的动作在逗号后面（「保护主力」），否定只吞到「冒险」，
   所以整句的例外语义其实没生效；需要把「条件成立 → 只执行另一支」写进行动计划。
2. **换人位置仍然是引擎下标**：替换命令给的是 `side.pokemon` 下标，不是出战位；单只倒下/双倒时都会让提交失败。
3. **默认分类里「unavailable」几乎触发不到**：条件不成立、招式不在手上的情况都被算进 `guarded`，
   `unavailable` 只会在「本回合完全没有可出招式」时累加，而那时已经退回默认招式。
4. **复数目标没展开**：「另一只对手」「前两个对手」只记录成 `unscored`，没有按数量分配给两只队友。
5. **目标比较用的血量只来自日志**：`view.own` 里有精确体力，但对手血量只在 `|switch|`/`-damage|` 事件里更新，
   没有主动抓 `|request|`/`|turn|` 之外的分段，也没有把「对手的道具/特性」纳入威胁估计。

## 测试结果

- `tests/tactics.test.ts`：12/12 通过。
- 全量：61/61 通过。
- `tsc --noEmit`：通过。

## 边界

- `targets.ts` 只做比较，不改动作；`splits.ts` 只拆句与剪预算，不重新解释语义。
- 对手信息仍然只来自本方可见日志：`|switch|`/`|drag|`/`-damage|`/`-heal|`/`-boost|`/`-status|`/`faint|`。
- 没有读 `battle.p2`、没有改对手固定策略。

## 上传状态

- 本地提交在 `round-06-targets-and-budget`；远端仓库 `github.com/pizzall/AFK-Pokemon` 仍不存在，本机没有 GitHub 推送凭据。
