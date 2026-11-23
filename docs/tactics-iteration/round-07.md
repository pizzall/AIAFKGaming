# 第 7 轮：两种决策方式的同条件对照实验

- 分支：`round-07-comparison`（从 `round-06-targets-and-budget` 出发）
- 代码：`src/battle/compare.ts`（新增）、`src/battle/agent.ts`（双倒时补两个位置）、`src/battle/layout.ts`
  （替换请求返回空串）、`src/game/types.ts`（`DecisionRecord`）
- 测试：`tests/comparison.test.ts`（新增 5 条）

## 本轮做的对照实验

同条件：同一支队伍（`playerTeam`）、同一对手（`npcTemplates[0]`）、同一种子、同一条日志累积规则、
同一个请求预算（每回合只读一次请求）、同一个替换适配器。

- **direct「直接依据文本决策」**：只读拆解顺序，动作按文本顺序认领，目标固定 1 号位，不看条件。
- **refined「意图拆解后结合战局二次定位」**：条件、目标、默认策略都读战局后再定。

同一战术「优先使用热风攻击体力最低的敌人」、同一种子 `[3,5,7,11]` 的实测：

| 模式 | 回合 | 结果 | 第一次引擎拒绝 |
| --- | --- | --- | --- |
| direct | 1 | 未完成 | `Can't move: Play Rough needs a target`（目标固定给了 1 号位，而阿兔露的嬉闹是自身招式） |
| refined | 8 | p2 胜（辅助指标） | 无 |

审计把误解落到「第几次决策 + 哪一类」：direct 的误解是「目标没按招式类型给」（`scene-target` 一类的变体）与
「引擎拒绝」；refined 的误解只剩「不可验证」与「等二次定位」。

## 本轮修掉了上一轮的什么

1. **同条件比较**：`runComparison` 让两个模式共用一个替换适配器（用引擎自己的报错探测可接受的下标），
   之前 direct 在第一回合就倒在自己的命令上，根本跑不到能暴露误解的地方。
2. **审计可定位**：`audit` 把每条未接进决策的信息（`ignored`）转成 `Mistake{sequence, kind, text}`，
   同时记录引擎拒绝（`engine-reject`），这样能回答「误解发生在哪一步」。
3. **可存储**：`toRecord` 生成 `DecisionRecord`，两种模式的结果与误解放在同一条记录里，供接口回看。

## 本轮做得不够好的地方（测试逐条验证）

1. **胜负不是可靠信号**：refined 活得比 direct 久，但这个差距主要来自 direct 的目标固定策略，不是「二次定位」的功劳。
2. **纠错没有量化**：只知道 refined 活得久，没有统计它具体修好了「条件/目标/否定/默认」中的哪几条。
3. **替换适配器是试探式的**：`adaptSwitch` 靠引擎报错逐个试下标，最多 6 次；这不是「从请求里推出正确出战位」。
4. **direct 的目标策略是刻意降级**：为了让比较公平，direct 退回到「不比较」，但它本身的静置语义还没定义清楚。
5. **对照还没落库到接口**：`DecisionRecord` 只被测试构造，服务端还没有存与查询它的接口。

## 测试结果

- `tests/comparison.test.ts`：5/5 通过。
- 全量：66/66 通过。
- `tsc --noEmit`：通过。

## 边界

- 两种模式只读本方请求与日志里出现过的对手信息；没有读 `battle.p2`。
- 胜负只写进辅助字段，测试只断言「refined 回合数 ≥ direct」，不断言「谁更正确」。

## 上传状态

- 本地提交在 `round-07-comparison`；远端仓库 `github.com/pizzall/AFK-Pokemon` 仍不存在，本机没有 GitHub 推送凭据。
