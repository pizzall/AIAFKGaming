# 第 10 轮：站位对齐、替换失败如实记录与入口防线

- 分支：`round-10-robustness`（从 `round-09-limits-and-isolation` 出发）
- 代码：`src/battle/seats.ts`（新增：出战位与需要补的人数）、`src/battle/view.ts`（占用位置 = 还活着的上场位置）、
  `src/battle/agent.ts`（替换按 `seats.ts` 计算）、`src/battle/runner.ts`（替换被拒时记 `accepted:false`，不伪装成功）
- 测试：`tests/robustness.test.ts`（新增 6 条）

## 本轮修掉了上一轮的什么

1. **占用位置的含义**：`activeMarkers` 从「请求里标成 active 的下标」改成「还活着的上场位置」：
   单只倒下 → 只占 0 号位；双倒 → 两个位置都不占。这是从引擎 `getRequestData()` 的
   `pokemon.slice(0, active.length)` 规则反推出来的。
2. **要补几个人**：`holesOf` 按 `forceSwitch` 或缺场数算，双倒 2 个、其余 1 个。
3. **替换失败不伪装**：`runBattle` 在战术 agent 的替换命令被引擎拒绝时，写一条 `accepted:false` 的决策记录，
   然后抛出「被拒绝」，不会假装换入成功。
4. **入口防线**：第 9 轮的控制字符/零宽/不成对代理检查在 `tacticInput` 里统一生效（本轮回归验证）。

## 本轮做得不够好的地方（测试逐条验证）

1. **单只倒下仍然换不进去**：本环境实测单只倒下时任何 `switch N` 都被引擎拒绝，本轮只记录拒绝，没有绕开。
2. **双倒时只补一个位置**：`runner` 仍给一个位置；引擎提交时会报「Not all choices done」，陪着 `game-gym` 用例一起失败。
3. **`game-gym` 用例在 `base` 上就失败**：`a real gym win replaces the seat with the submitted snapshot exactly once`
   在 `base` 提交和本次环境里都会因引擎的替换选择失败，不是本轮引入；但本轮也**没能修好**它。
4. **对照接口没有频率/并发上限**：任何账号都能连续 `POST /api/game/compare`，没有队列或冷却。
5. **对照接口不校验 seed 格式**：非法 seed 会直接抛进服务端，没有在路由层给出可读错误。

## 测试结果

- `tests/robustness.test.ts`：6/6 通过。
- 全量：81 条中 80 条通过；唯一失败是上面第 3 条（`base` 上同样失败）。
- `tsc --noEmit`：通过。

## 十轮之后的总边界

- 战术理解链路：文本（500 字、码点计数、句子截断）→ 拆解（动作/目标/否定/例外/条件）→ 第二遍定位（条件求值、
  目标比较、默认策略）→ 决策（队列、站位、替换、日志累积）→ 对照（direct vs refined）→ 定位（流水线阶段与纠正统计）。
- 看不到的对手信息只从本方可见日志里学；没有读 `battle.p2`，也没有给对手换策略。
- 道馆对战仍走固定策略（`input.agent` 不是 `tactics` 时），因为替换失败会让道馆比赛停在引擎错误上。

## 上传状态

- 本地提交在 `round-10-robustness`；远端仓库 `github.com/pizzall/AFK-Pokemon` 仍不存在，本机没有 GitHub 推送凭据。
