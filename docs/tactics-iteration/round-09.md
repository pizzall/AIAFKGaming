# 第 9 轮：500 字上限、中文边界与并发隔离

- 分支：`round-09-limits-and-isolation`（从 `round-08-locator-and-fidelity` 出发）
- 代码：`src/battle/tactics.ts`（`tacticLength`/`clampTactic`/`parseIntent` 截断与 notes）、
  `src/game/types.ts`（`tacticCharacters`）、`src/game/service.ts`（`tacticInput`）、`src/battle/compare.ts`（同预算截断）
- 测试：`tests/limits.test.ts`（新增 7 条）

## 本轮修掉了上一轮的什么

1. **计数统一**：拆解层与服务层都用 `Array.from(raw).length`（按码点）：换行 1 个、全角标点 1 个、emoji 1 个；
   服务层有测试保证两边一致。
2. **超长按句子截断**：`clampTactic` 先按 500 码点切，再退到最近的「。/\n/，/,」；拆解层在 `notes` 里写明
   「战术超过500字，已按句子边界截断」。
3. **非法字符**：控制字符（`\u0000-\u0008`、`\u000B-\u000C`、`\u000E-\u001F`、`\u007F-\u009F`）、零宽/方向控制字符、
   不成对代理都改用可读错误拒绝；换行与制表当作排版字符允许保存。
4. **同预算对照**：`runComparison` 两个模式拿到的战术文本是同一份截断结果，避免「一个截断一个不截断」。
5. **账号隔离**：`compare` 结果落库并按 `owner_id` 过滤，`GET /api/game/compare` 只返回本人结果（测试验证 b 看不到 a）。

## 本轮做得不够好的地方（测试逐条验证）

1. **并发没有上限**：同一账号可以连续 `POST /api/game/compare`，没有频率或并发限制（测试里连续两次都成功）。
2. **截断点对玩家不透明**：只有拆解层的 `notes` 知道截断到了第几字，前端与服务端都没有回传「截到了哪里」。
3. **500 字上限仍是硬编码常量**：拆解层与游戏层各有一份 `TACTIC_LIMIT`，只靠测试保证一致，没有单一来源。
4. **emoji 可以进入战术但不会消解**：emoji 按 1 字计入预算，但拆解时不会识别也不会剔除，只会落到 `unknown`。
5. **并发对照只隔离了读，没有隔离写**：同一账号的两次对照会同时写 `comparisons` 表，没有事务/锁与去重。

## 测试结果

- `tests/limits.test.ts`：7/7 通过。
- 全量：75/75 通过。
- `tsc --noEmit`：通过。

## 边界

- `clampTactic` 只动战术文本，不动队友、资源、道馆快照；截断发生在解析前，`parseIntent().raw` 保留原文。
- 控制字符检查发生在服务层入口，任何保存路径（`team`/`preset-save`/`compare`）都经过它。
- 对照接口不修改任何资源，只写 `comparisons` 表。

## 上传状态

- 本地提交在 `round-09-limits-and-isolation`；远端仓库 `github.com/pizzall/AFK-Pokemon` 仍不存在，本机没有 GitHub 推送凭据。
