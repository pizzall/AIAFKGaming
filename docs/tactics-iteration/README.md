# 战术理解迭代

目标：玩家用最多 500 字自然语言描述战术（进攻目标、行动优先级、条件限制），系统拆解后指导招式、目标与换人，
再和「直接依据文本决策」对照，看误解发生在哪一步、二次定位能否纠正。

每一轮都按同一个循环走：

1. 从上一轮分支出发，列出本轮认为做得不够好的几条（写进该轮测试的 `ROUND_GOALS`）。
2. 改代码，并让测试断言这些不足的现状或修复结果。
3. 跑全量测试与 `tsc --noEmit`。
4. 新开分支 `round-NN-<主题>`，写本轮报告 `round-NN.md`（目标、不足、测试、边界、上传状态）。

| 轮次 | 分支 | 主题 | 报告 |
| --- | --- | --- | --- |
| 1 | `round-01-baseline` | 拆解 + 直接按文本决策的基线 | [round-01](round-01.md) |
| 2 | `round-02-scope-and-names` | 否定/例外作用域、目标词、换人排序、zh-hans 名称 | [round-02](round-02.md) |
| 3 | `round-03-queue-and-targets` | 行动队列、战局视角（只读本方）、目标站位 | [round-03](round-03.md) |
| 4 | `round-04-negation-and-layout` | 否定作用域结构化、目标占位、第二遍定位 | [round-04](round-04.md) |
| 5 | `round-05-conditions-and-opponents` | 条件驱动、不可验证、负向判断、日志学对手 | [round-05](round-05.md) |
| 6 | `round-06-targets-and-budget` | 目标比较、整段事件回放、显式默认、预算 | [round-06](round-06.md) |
| 7 | `round-07-comparison` | direct vs refined 同条件对照与误解审计 | [round-07](round-07.md) |
| 8 | `round-08-locator-and-fidelity` | 误解定位、纠正统计、对照落库与接口 | [round-08](round-08.md) |
| 9 | `round-09-limits-and-isolation` | 500 字、码点计数、截断、非法字符、隔离 | [round-09](round-09.md) |
| 10 | `round-10-robustness` | 出战位与占用位置、替换失败如实记录 | [round-10](round-10.md) |
