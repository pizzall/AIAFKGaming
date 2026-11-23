# 第 8 轮：误解定位与二次定位纠正统计

- 分支：`round-08-locator-and-fidelity`（从 `round-07-comparison` 出发）
- 代码：`src/battle/locator.ts`（新增）、`src/battle/compare.ts`、`src/game/service.ts`（`compare`）、
  `src/game/routes.ts`（`POST/GET /api/game/compare`）、`src/game/store.ts`（`comparisons` 表）
- 测试：`tests/comparison.test.ts`（7 条）

## 本轮修掉了上一轮的什么

1. **误解定位**：`locator.ts` 把每条误解定位到流水线阶段
   （`undiscovered → unresolved → scene-checked → guarded → queued → executed → rejected`），
   而不是只说「refined 活得久」。
2. **纠正统计**：`compareFidelity` 对照两种模式的决策记录，统计 direct 没做到、refined 做到了的条目
   （`corrected`），以及仍然做不到的（`remaining`），并给每条修正写一句 `fix`。
3. **落库与接口**：`DecisionRecord` 增加 `fidelity`；`GameService.compare` 跑一次对照并按账号保存，
   `GET /api/game/compare` 只返回本人的结果。

实测（同一战术、同一种子 `[3,5,7,11]`）：direct 被引擎拒绝（`Can't move: Play Rough needs a target`），
refined 跑完 8 回合；定位器把这条计为「引擎拒绝 → 被二次定位纠正」，`corrected=1, remaining=1`。

## 本轮做得不够好的地方（测试逐条验证）

1. **定位依赖「未接入清单」的文案**：`locator` 靠 `ignored` 字符串前缀分类（`未识别`/`不可验证`/`条件`），
   一旦日志文案改动，定位就会失准；应该换成结构化字段。
2. **纠正统计只覆盖「两种模式都走到」的条目**：direct 第一回合就被拒，所以大部分文案层的误解它根本走不到，
   统计会低估「二次定位实际修好的条数」。
3. **「rejected」阶段没有细因为什么**：只说引擎拒绝，不区分「目标非法 / 替换位置 / 招式不能用」。
4. **对照接口不校验预算**：接口允许任意 seed，但没有把「同预算」写进接口参数，预算只是 `compare.ts` 里的常量。
5. **对照只在固定 NPC 模板上跑**：`compare` 写死 `npcTemplates[0]`，没有用当前道馆防守方或真实对手。

## 测试结果

- `tests/comparison.test.ts`：7/7 通过。
- 全量：68/68 通过。
- `tsc --noEmit`：通过。

## 边界

- 定位器只读两种模式的决策记录，不做推测；没有证据就不计「已纠正」。
- `POST /api/game/compare` 只跑玩家自己的队伍与固定 NPC 模板，seed 可复现，但预算不是参数。
- 结果按账号隔离（`comparisons.owner_id`），`GET` 只返回本人记录。

## 上传状态

- 本地提交在 `round-08-locator-and-fidelity`；远端仓库 `github.com/pizzall/AFK-Pokemon` 仍不存在，本机没有 GitHub 推送凭据。
