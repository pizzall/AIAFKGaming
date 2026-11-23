# Battle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 跑通本地 Node 后端真实六只双打、共同基类 JSON 效果配置、隐藏对方名单的 Agent 边界及独立 H5 战报查看。

**Architecture:** 使用已固定的 Showdown 归档作为原版机制实现，在应用内注册独立配置 mod。玩家活动采用完成时间与请求结算；全服赛事保留调度接口。此阶段不实现尚未填写的经济、账号养成和 AI 分析。

**Tech Stack:** Node.js 24、TypeScript、Node HTTP / test runner、esbuild 构建固定上游引擎。H5 使用原生 HTML/CSS/JS 作为功能验证界面。

**Spec:** [架构设计](../../architecture-design.md)，以及本轮用户六项修订与“实际等级、隐藏名单”的澄清。

## Global Constraints

- 六只全部参战、同时在场两只；使用实际等级，不向对手发送赛前名单。
- 仅允许 Mega；关闭 Dynamax、Terastallization 和 Z-Move。
- 道具、特性、条件共享 EffectDefinition 基类，JSON 只绑定已注册代码与受校验参数，不执行任意脚本。
- 原版效果默认继承所选 mod；配置覆盖不污染其它规则版本。
- NPC 开战时从多个完整队伍与战术模板选择一套并冻结；道馆防守使用静态快照。
- 玩家活动不建立逐个倒计时或到期后台任务；客户端请求仍由服务端时间验证并只结算一次。
- 单行短签名/调用尽量不超过140字符，不改写原始资料与视觉 Demo。
- 当前目录不是 Git 仓库，不初始化仓库或创建工作树；直接在授权工作目录添加独立代码路径。
- 用户已授权收敛后开始实施，本轮直接执行，不增加交接确认。

## Review Focus

- 两个配置版本的效果参数必须隔离，不能全局改写引擎默认道具。
- 太晶、极巨、Z 招式不能通过原始动作字符串或非法队伍绕过禁用。
- Agent 不得读取对手的完整快照或尚未公开动作；固定策略不冒充战术 AI。
- 队伍与效果输入需要运行时校验；服务端不能接受由浏览器伪造的比赛结果。
- 重复玩家活动结算、NPC 抽样、道馆防守引用不能改变已固定结果。

## Task 1: Fixed engine and effect configuration

**Files:** root package/tsconfig、scripts/prepare-engine.mjs、src/battle/effects.ts、config/battle-effects.json、tests/effects.test.ts。
**Interfaces:** `loadEffects(json)` → `EffectDefinition[]`；`createBattleDex(revision,effects)` → 独立规则 mod。

- [x] 建立最小依赖和本地归档构建入口，校验归档哈希，保留来源。
- [x] 先写反序列化、非法处理器/参数、效果版本隔离测试，运行并观察失败。
- [x] 实现同父类的 Item/Ability/Condition 定义与注册处理器；原版默认继承。
- [x] 验证真实回合中的道具回血参数变化和特性参数变化，而不只检查配置文本。

## Task 2: Battle runner and requests

**Files:** src/battle/runner.ts、src/battle/fixtures.ts、tests/battle.test.ts。
**Interfaces:** `runBattle(input)` → 固定种子与真实事件；固定策略按本方请求生成联合选择。

- [x] 先写六只双打、实际等级、Mega 可用、其它机制拒绝、隐藏名单与结果可复现测试，观察失败。
- [x] 编写自定义格式与合法性检查、请求转换、双阵营固定策略和事件过滤。
- [x] 以多个 NPC 模板执行真实比赛；技术失败独立报错，不计双败。

## Task 3: Deadline and gym snapshot foundation

**Files:** src/domain/activity.ts、src/domain/gym.ts、tests/domain.test.ts。
**Interfaces:** `settleActivity(activity,serverNow)`、`createDefenseSnapshot(team)`、`resetGymSeason(seats,npcs)`。

- [x] 先验证未到期拒绝、重复结算无第二次产出、快照不被原队修改、赛季只替换席位，观察失败。
- [x] 实现最小纯业务逻辑；没有每玩家定时器，不填经济初值。

## Task 4: Backend and H5 review surface

**Files:** src/server.ts、web/battle-lab/index.html、web/battle-lab/app.js、web/battle-lab/styles.css、tests/server.test.ts、README.md。
**Interfaces:** 创建比赛任务、查询状态、读取阵营过滤战报与公开效果目录；浏览器不提交裁决结果。

- [x] 先测 HTTP 输入/输出、未知比赛、固定策略标识与私有数据过滤，观察失败。
- [x] 后台工作线程执行比赛并保存本地战报文件；接口请求不阻塞计算。
- [x] 创建红白功能验证 H5，使用真实 HTTP 数据；保留旧视觉 Demo。
- [x] 运行全部测试、类型检查及浏览器走查，完成独立代码审阅并修复重要问题。

## Progress

Task 1–4: complete。13 项 Node 测试与类型检查通过；40 场双模板固定种子战斗通过；浏览器完成真实后端战斗并展示战报。已有视觉 Demo 保持独立。

Pre-flight: Task 2 消费 Task 1 的独立 mod；Task 4 消费 Task 2 的运行协议。Task 3 不消费战斗引擎。所有边界只使用上列接口。

Ruling: 本机 npm PowerShell shim 失效，使用 npm.cmd 或 npm-cli.js；不修改系统工具。首次网络下载在沙箱被拒绝后，已通过批准的提权安装依赖。

Ruling: 首个验证阶段使用本地战报文件与纯业务函数，不提前创建未定的账号经济数据库。玩家资产发放事务、完整道馆和全服赛程仍为后续工作。

Ruling: 补充完整效果索引、持久发布指纹和 worker 一致性检查，防止同 revision 运行不同规则。独立审阅发现的路径越界、效果类型/别名问题均已回归修复并复核。
