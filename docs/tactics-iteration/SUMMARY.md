# 战术理解十轮改造总览

从 `base`（战术文本只保存、决策仍为固定脚本）出发，每一轮都按同一个循环走：

1. 列出 3–5 条「本轮做得不够好的地方」，写进该轮测试的 `ROUND_GOALS`；
2. 改代码，让测试验证「上一轮的问题已修好」并对「本轮的问题」做现状断言；
3. 跑全量测试与 `tsc --noEmit`；
4. 新开分支、写该轮报告（目标、不足、测试、边界、上传状态）。

| 轮 | 分支 | 修掉的上一轮问题 | 本轮列出的新不足 |
| --- | --- | --- | --- |
| 1 | `round-01-baseline` | — | 条件遗漏 / 否定误读 / 目标词不执行 / 优先级颠倒 / 中文招式名不可消解 |
| 2 | `round-02-scope-and-names` | 上 5 条（作用域、目标词、换人排序、zh-hans 名称表 + 别称） | 否定作用域太窄 / 队列不推进 / 目标不比较 / 换人不主动 / 站位边界 |
| 3 | `round-03-queue-and-targets` | 队列推进、战局视角（只读本方）、目标站位 | 否定作用域 / 目标不比较 / 换人 active / 隐式默认 / 负向条件 |
| 4 | `round-04-negation-and-layout` | 否定作用域结构化、目标占位、第二遍定位（`plan.ts`） | 条件不进决策 / 目标不比较 / 换人下标 / 默认不追问 / 负向条件 |
| 5 | `round-05-conditions-and-opponents` | 条件驱动队列、不可验证标记、负向判断、日志累积对手信息 | 目标比较 / 换人位置 / 默认分类 / 对手增量 / 例外执行 |
| 6 | `round-06-targets-and-budget` | 目标比较（日志血量/倍率）、整段事件回放、显式默认、整句预算裁剪 | 例外语义 / 换人下标 / 默认分类 / 复数目标 / 血量来源 |
| 7 | `round-07-comparison` | 同条件对照（direct vs refined）、误解审计、`DecisionRecord` | 胜负信号 / 纠错量化 / 替换试探 / 静置语义 / 落库接口 |
| 8 | `round-08-locator-and-fidelity` | 误解定位（流水线阶段）、纠正统计、`/api/game/compare` 落库 | 文案依赖 / 覆盖不足 / 拒绝归因 / 预算参数 / 对手固定 |
| 9 | `round-09-limits-and-isolation` | 500 字码点计数与句子截断、非法字符拒绝、同预算、账号隔离 | 并发上限 / 截断可见 / 单一常量 / emoji 消解 / 写隔离 |
| 10 | `round-10-robustness` | 出战位与占用位置对齐、替换失败如实记录 | 单倒仍换不进 / 双倒未补全 / `game-gym` 基线失败 / 限流 / seed 校验 |

## 核心链路（第 10 轮结束时）

`战术文本` →（`tactics.ts`：500 字截断、归一化、拆句、动作/目标/否定/例外/条件）
→（`plan.ts`：条件求值、不可验证标记、负向判断）
→（`targets.ts`：目标比较；`seats.ts`：替换出战位；`layout.ts`：目标站位与默认策略）
→（`agent.ts`：队列、条件、站位、替换、`defaults.ts` 显式默认；`opponent.ts`：日志里学到的对手信息）
→（`compare.ts`：direct vs refined 同条件对照；`locator.ts`：误解定位与纠正统计）

## 测试与结果

- 全量测试：81 条，80 条通过；唯一失败 `a real gym win replaces the seat with the submitted snapshot exactly once`
  在 `base` 提交上同样失败（本次环境里引擎的替换选择无法完成），不是十轮改造引入的。
- `tsc --noEmit`：通过。
- 每轮测试各自验证：上一轮问题已修好（`round N fixes`）与本轮问题现状（`round N goals`）。

## 上传状态

- 远端仓库：`https://github.com/pizzall/AIAFKGaming`（原计划的 `pizzall/AFK-Pokemon` 不存在，已改用这个仓库）。
- 已推送的分支（每个都带 `-u`，本地分支跟踪远端同名分支）：

| 分支 | 远端提交 |
| --- | --- |
| `base` | `75fec62` |
| `round-01-baseline` | `3578bcd` |
| `round-02-scope-and-names` | `0026d3d` |
| `round-03-queue-and-targets` | `2655b85` |
| `round-04-negation-and-layout` | `13e2f98` |
| `round-05-conditions-and-opponents` | `0e690b4` |
| `round-06-targets-and-budget` | `b13d3aa` |
| `round-07-comparison` | `097d31a` |
| `round-08-locator-and-fidelity` | `4d28f32` |
| `round-09-limits-and-isolation` | `0be3a4b` |
| `round-10-robustness` | `bfa3b3a` |
| `analysis/tactics-loop` | `500007e` |

- 远端 `main` 上曾多出一个 `23f2703 probe` 提交：那是推送前用临时仓库做的「凭据是否可用」测试，
  不是业务提交；`analysis/push-cleanup` 分支补上了指向 `analysis/tactics-loop` 的说明，是否把 `main`
  指向 `analysis/tactics-loop` 由你在 GitHub 上决定。

## 最关键的三个结论

1. **误解几乎都发生在拆解层，而不是决策层**：动作取名字、否定作用域、条件归属这三类占了十轮不足的大多数；
   目标比较与站位是决胜层的问题。
2. **「看不到的对手」必须被建模成数据边界**：请求里没有对手，`view.foe` 固定为空，对手信息只能来自本方可见日志；
   所有无法验证的条件都标成 `unverifiable`，不会被当成成立。
3. **「直接依据文本决策」与「二次定位」的差距主要来自目标与站位**：同条件下 direct 第一回合就被引擎拒绝，
   refined 能打满；定位器（`locator.ts`）能把差距落到「第几次决策 + 哪一阶段」。
