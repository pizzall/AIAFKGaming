# 宝可梦挂机游戏模块素材 UI 与表结构设计

版本：0.1；日期：2026-11-14；状态：基于当前需求及本地资料的实现准备稿。

当前架构与代码实现状态见 [框架设计](architecture-design.md)；本稿旧的逻辑集合不是已经建成的 SQL 表。

本文按“玩家场景 → 所需素材 → UI 与状态 → 配置数据 → 玩家存档 → 数据缺口”整理全部模块。玩法依据 [需求与模块设计](game-design.md)，数值依据 [数据与数值总表](game-data.md)，上游资料依据 [本地数据说明](../data/README.md)。

本文新增的页面划分、表名、字段和素材规格均为建议方案，不把原文中的建议、示例和待定项升级成已确认需求。本次只新增本文，不创建数据库、页面、素材或运行服务，也不改写另一个 worker 的下载与索引成果。

## 1 现有数据与素材盘点

### 1.1 本次检查结果

| 本地入口 | 已有内容 | 本次核对结果 | 使用边界 |
| --- | --- | --- | --- |
| `data/species.json` | 1,025 个物种 | 全部有简体中文物种名 | 物种编号，不是玩家个体编号 |
| `data/pokemon.json` | 1,351 条数据形态 | 含种族值、属性、特性和图片路径 | 同一物种可以有多条数据形态 |
| `data/forms.json` | 1,579 条外观形态 | 含所属数据形态、标签与图片路径 | 外观形态 ID 不等于数据形态 ID |
| `data/raw/pokeapi/` | 187 张原始 CSV | 包含招式、学习表、技能机、进化、道具、经验等 | 需要选择版本并整理，不需重新全量抓取 |
| `assets/pokemon/` | 8,532 张 PNG | 下载报告中 6,592 张为 96×96，1,940 张为 475×475 | 图片数量不代表物种数量；有异色、性别与历史差异 |
| `data/coverage-report.json` | 覆盖与缺失报告 | 数据形态缺立绘 4 条，缺正面/背面各 9 条；外观形态缺立绘 45 条，缺正面/背面各 49 条 | 各视角缺失集合有重叠，不能简单相加为缺失物种数 |
| `data/download-report.json` | 文件完整性报告 | 报告记录 8,723 个文件均为 verified，failures 为空 | 这是已有报告的结果，不等同于本次重新执行全量文件哈希校验 |
| `scripts/verify_pokemon_data.py` | 本地索引校验入口 | 本次运行通过：1,025 物种、1,351 数据形态、1,579 外观形态、15,199 个图片引用 | 检查关联和引用，不证明战斗逻辑或本作配置已完成 |
| `data/sources/showdown-revision.json` | Pokémon Showdown 固定版本信息 | 记录提交 `7e743761cd13cdb361fc0f58eb5a866284894f5b` | 不等于本作已决定采用该引擎 |
| `data/sources/pokemon-showdown-7e743761cd13cdb361fc0f58eb5a866284894f5b.tar.gz` | 1,210 个归档成员 | 本次核对 SHA-256 与版本记录一致；包含 `data/moves.ts`、`data/abilities.ts`、`data/items.ts`、`data/learnsets.ts`、`sim/battle.ts` 等 | 本次盘点时是源码归档，尚未构建、接入或验证本作六只双打格式 |

PokéAPI 数据提交为 `8a92bfa7dab2f12b84b5d151562f9857c133ff30`，图片提交为 `c0542f7c51215d9672439012838c99f520596cbd`。数据来源与原始说明保留在 `data/sources/`，不要仅复制最终图片而丢失来源记录。

所有 1,025 个物种的默认数据形态均有普通大立绘、正面和背面图。非默认形态的缺图不能被默认形态覆盖率掩盖。201 条带形态标识的记录缺少简体中文形态标签，应按开放名单补齐或显示明确的标识，不冒充已有中文翻译。

### 1.2 原始规则表的实际覆盖

| 数据 | 行数 | 中文情况 | 对接工作 |
| --- | ---: | --- | --- |
| `moves.csv` | 937 | `move_names.csv` 有 919 个简中名称，另 18 个未覆盖 | 先筛选允许的招式；缺名条目样本为 shadow 系列，不意味着首批必然缺名 |
| `move_meta.csv` | 827 | 元数据，不是文本翻译 | 不把未出现的 meta 行解释成招式不存在 |
| `pokemon_moves.csv` | 638,321 | 通过招式表取名称 | 按版本组、学习方式和数据形态筛选 |
| `machines.csv` | 2,372 | 通过道具和招式取名 | 技能机编号随版本变化，不能只按编号关联 |
| `abilities.csv` | 374 | 314 个主系列特性都有简中名称；另外 60 个非主系列条目缺简中名 | 对首批主系列内容不需要补全部 60 条翻译 |
| `items.csv` | 2,223 | 2,174 个简中名称，49 个未覆盖 | 先选本作可用物品，再补缺名与本作效果说明 |
| `berries.csv` | 68 | 名称通过关联的道具取得 | 原作生长数据不能直接当成本作挂机秒数 |
| `natures.csv` | 25 | 25 个简中名称 | 可形成性格基础目录 |
| `experience.csv` | 600 | 6 个成长组，各 100 级 | 已有经验阈值；统一曲线还是保留成长组仍需设计决定 |
| `type_efficacy.csv` | 324 | 属性名另有表 | 有历史差异表，按规则版本处理 |
| `pokemon_evolution.csv` | 676 | 条件字段，展示文案需要生成 | 包含版本、形态、道具和特殊条件，不能只读取最低等级 |
| `pokemon_form_conditions.csv` | 234 | 形态变化触发条件 | 形态变化与永久进化分别处理 |

说明文本的缺口与名称不同：`move_effect_prose.csv`、`ability_prose.csv`、`item_prose.csv` 的简中行均为 0。简中 flavor text 分别覆盖 826 个招式、267 个特性、1,560 个物品，但本地这些简中文本只出现于版本组 17–20，不保证符合之后版本的效果。新版本 UI 文案需要核对后整理，不能把旧描述直接标成最新规则。

### 1.3 三种缺口必须区分

- **整理缺口**：原始表已经有，缺少选定版本的可用目录、字段转换或跨来源映射。例如学习表、技能机兼容表。
- **内容缺口**：本地没有对应素材或文字。例如道具图标、NPC 肖像、自定义地区背景、部分形态中文名。
- **设计缺口**：原作资料无法回答的本作规则。例如捕获机会、产业成本、孵化秒数、商店周期、通行证奖励。

战斗效果文本不等于可执行规则。Showdown 归档提供了可研究的规则实现，仍需要适配、合法内容选择和验证，不能归类为“战斗引擎已接入”。

道具与树果的逐项覆盖、缺名清单和身份关联问题见 [专项核查](item-berry-coverage.md)。百货公司已确认将探索道具与重要道具分开；此处“重要道具”指进化道具、携带物和技能机，不直接对应原作 key 口袋。

## 2 素材规划与复用标准

### 2.1 素材目录

| 编号 | 素材 | 当前状态 | 首版使用方式 | 需要新增的内容 |
| --- | --- | --- | --- | --- |
| A01 | 宝可梦普通立绘 | 默认物种齐全，部分形态缺失 | 图鉴详情、捕获和孵化结果卡 | 只补开放名单中确实缺失的形态 |
| A02 | 宝可梦正面/背面像素图 | 默认物种齐全，部分形态缺失 | 双打战场、队伍卡、岗位卡 | 正反视角缺图映射与占位图 |
| A03 | 异色与性别差异图 | 有对应目录，但非所有组合都有独立图 | 通过索引选择实际存在的变体 | 首版是否启用异色待定；缺异色图不静默显示为普通色 |
| A04 | 属性、状态、资源、导航图标 | 当前 `assets/` 只含宝可梦图片 | 可先用文字徽标和简单矢量图形 | 属性标识、异常状态、钱/训练点/材料图标 |
| A05 | 道具、球、树果、技能机图标 | 原始数据有，图片未见本地采集 | 背包、商店、携带物、捕获与奖励 | 按可用物品名单补图；占位阶段使用图形加名称 |
| A06 | 地区封面与双打背景 | 未有本作素材 | 地区列表封面、静态战场 | 每个首批地区一张封面；可共用少量战斗背景 |
| A07 | 蛋、孵化盒、培养设施图 | 未有专用素材 | 孵化进度、蛋位、主理人展示 | 通用蛋图和状态外框即可，不要求每物种专用蛋图 |
| A08 | 产业与果园设施图 | 未有本作素材 | 设施卡、岗位、果树阶段 | 矿山/木场等图标、果树阶段；升级先用等级标记区分 |
| A09 | NPC 与三家机构形象 | 未有专用素材 | 道馆、NPC 挑战、博士/市委/联盟 | 选定 NPC 肖像及机构徽记 |
| A10 | 馆主、赛季、通行证外显 | 未有本作素材 | 身份展示、奖励预览、历史荣誉 | 首版称号、徽章、头像框；按实际奖励节点制作 |
| A11 | 公共 UI 元件 | 尚未实现 | 按钮、弹窗、页签、列表、进度条、提示 | 统一样式与空状态，不逐模块重画同类按钮 |
| A12 | 动效、音效与音乐 | 不在本次本地快照范围 | 首版可仅用简单状态过渡和静态战报 | 后续按需要补充，不作为规则验证前置条件 |

### 2.2 文件与显示规范

1. 直接使用索引中的 `images` 路径，不用 `species_id` 或 `form_id` 拼接图片文件名。`pokemon.id=10001` 与 `forms.id=10001` 是不同对象。
2. 保持源图原始文件与比例；96×96 像素图采用最近邻缩放，避免模糊。大立绘按容器等比缩放，不强制拉伸。
3. 同一战场统一像素图风格，详情页可以用立绘；未要求重新制作已有 8,532 张图片。
4. 缺图处理顺序为精确资源、经过人工确认的共享外观映射、带名称的中性占位。共享映射写入配置，不能自动用另一形态冒充。
5. 新 UI 图标建议用 SVG 或简单矢量；若采用位图，交付透明背景与统一画布。具体美术风格和最终尺寸待界面设计确认，不在本稿强行选定。
6. 素材绑定记录用途、路径、来源版本与是否允许共享；原始图无需再复制一份到每个模块目录。
7. 技术标识、来源哈希和内部状态码用于管理与排错，普通玩家界面显示中文名称、时间与原因。

## 3 数据组织与来源映射

### 3.1 三层组织

| 层 | 内容 | 建议存放形式 | 责任 |
| --- | --- | --- | --- |
| 上游快照 | 当前 JSON、CSV、图片、Showdown 归档 | 保留现有目录 | 用作可追溯来源，不直接写玩家状态 |
| 本作静态目录与配置 | 选定版本的物种、招式和学习规则；地图、经济、奖励等 | 少量版本化 JSON/CSV，可在启动时加载 | 先筛选和转换，再暴露给 UI 与业务逻辑 |
| 玩家运行记录 | 个体、背包、活动、交换、比赛、奖励领取 | 一套支持事务的关系存储 | 保存实际归属、时间进度和不可重复的结果 |

100 人以内不需要为每模块建立独立服务或数据库。187 张原始 CSV 不等于需要 187 张运行时 SQL 表。先使用一个存储和明确业务操作；数据库产品、客户端平台与技术栈仍未选定。

### 3.2 编号与单位

| 标识或字段 | 正确含义 | 必须防止的错误 |
| --- | --- | --- |
| `species_id` | 全国图鉴物种层，关联 `species.json` | 把不同形态都当成不同图鉴物种，或混作玩家个体 |
| `pokemon_id` | 上游数据形态，关联 `pokemon.json` | 用这个 ID 查 `forms.json` 的同号记录 |
| `form_id` | 上游外观形态，关联 `forms.json` | 直接把 ID 当图片文件名 |
| `instance_id` | 本作每只玩家宝可梦的独立身份 | 两只同物种个体共用一个 ID |
| Showdown 标识 | 引擎内部字符串标识 | 假设必然等于 PokéAPI 的字符串或数字 |
| `version_group_id` | 上游版本组 | 直接用数值大小判断世代先后；本地 28、29 仍为第一世代组 |
| `capture_rate` | 上游捕获参数 | 直接当作 0–1 的本作捕获概率 |
| `hatch_counter` | 原作孵化周期计数 | 直接当作秒数或分钟数 |
| `effort_yield` | 原作击败后努力值产出 | 绕过本作收集器直接加到个体 |
| `height_dm` / `weight_hg` | 分米 / 百克 | 不转换就当作米 / 千克 |
| `type_efficacy.damage_factor` | 百分数尺度的属性倍率 | 把 200 当 200 倍；转换后为 2 倍 |
| CSV 空值 | 缺省或不适用，需按字段解释 | 全部转成 0，导致必中招式、变化招式或特殊条件错误 |

`forms.introduced_in_version_group_id` 等来源字段保留原义，不能只靠一个字段推断完整可用版本；需要结合所选版本的学习表、历史数据与引擎支持核验。最新索引里的种族值和特性，也不能直接冒充任意旧世代的值。

### 3.3 静态目录映射

以下是逻辑目录，优先生成文件或内存索引；是否物化为 SQL 表由实现选择，不额外维护两份权威内容。

| 目录 | 主键与关联 | 本地来源 | 必要转换 |
| --- | --- | --- | --- |
| `catalog_species` | `species_id` | `species.json` | 中文名、蛋组、成长组、基础亲密度与繁殖资格 |
| `catalog_variant` | `pokemon_id → species_id` | `pokemon.json`、历史属性/特性/数值 CSV | 按规则版本解析六项种族值、属性与合法特性 |
| `catalog_form` | `form_id → pokemon_id` | `forms.json`、`pokemon_form_conditions.csv` | 形态标签、外观路径与变化条件分开 |
| `catalog_move` | `move_id` | `moves.csv`、`move_meta.csv`、名称及描述表 | 展示元数据与可执行效果分开，目标范围不能丢失 |
| `catalog_ability` | `ability_id` | `abilities.csv`、名称及描述表 | 筛掉未开放系列，整理当前版本中文说明 |
| `catalog_resource` | 命名空间化 `resource_key` | 上游道具加本作资源定义 | 如 `item:pokeapi:4`、`currency:money`、`currency:training`；原作价格不等于本作价格 |
| `catalog_learnset` | 版本、`pokemon_id`、`move_id`、学习方式、条件 | `pokemon_moves.csv`、`pokemon_move_methods.csv` | 保留等级与方式，不把各版本取并集 |
| `catalog_machine` | 版本、技能机道具、招式 | `machines.csv` 与 machine 学习记录 | 技能机编号仅展示；以实际道具与招式关系校验兼容性 |
| `catalog_evolution` | 内部稳定 `rule_key`，来源规则 ID | `pokemon_evolution.csv`、物种进化链 | 条件保留版本与目标形态；事件资格与持续条件分开 |
| `catalog_nature` | `nature_id` | `natures.csv`、`nature_names.csv` | 性格属性乘区与显示文案 |
| `catalog_growth` | `(growth_rate_id, level)` | `experience.csv` | 选择原作成长组或本作替代曲线，不能同时叠加 |
| `catalog_type_matchup` | `(rule_version, attack_type, defend_type)` | 属性相克及历史表 | 归一化倍率与版本差异 |
| `catalog_berry` | `berry_id → item resource_key` | `berries.csv`、`berry_flavors.csv` | 保留来源字段，本作生长周期单独配置 |
| `engine_mapping` | `(ruleset_key, entity_kind, source_id)` | PokéAPI 与 Showdown 源码目录 | 显式映射引擎 ID；缺映射则禁止该条进入比赛名单 |

招式合法性由所选版本学习表与本作技能机遗传扩展共同判断。若引擎验证器默认不接受本作扩展，应为该明确规则做兼容适配，不能为绕过一项差异而关闭所有合法性检查。

## 4 UI 页面与公共组件

### 4.1 页面建议

| 编号 | 页面或工作区 | 主要内容 | 对应模块 |
| --- | --- | --- | --- |
| U01 | 回访总览 | 稀有收获、关键战报、运行活动、资源告警、下一步入口 | M02、M03、M07、M09、M14、M15 |
| U02 | 图鉴 收藏与个体详情 | 历史图鉴、当前个体、筛选、属性、培养、招式、进化 | M01、M02、M08、M09 |
| U03 | 编队与战斗风格 | 六个成员位、实际配置、500 字编辑、用途与合法性提示 | M04、M05 |
| U04 | 探索与心愿单 | 地区、时间窗、当前效率、球与补给、捕获目标 | M03、M06 |
| U05 | 育成屋 | 配对、蛋位、主理人、批次倒计时、孵化结果 | M07 |
| U06 | 经营 | 产业和果园页签、岗位、产量、扩建、种植 | M09、M11 |
| U07 | 联机广场 | 心愿交换列表、我的挂单、双方对照、成交结果 | M10 |
| U08 | 联盟 | 八馆、NPC 挑战、联盟报名、赛程、战斗结果 | M04、M12 |
| U09 | 背包与百货公司 | 道具分类、效果说明、库存、货架刷新、购买与礼包选择 | M08、M13 |
| U10 | 成长与赛季 | 博士/市委/联盟里程碑、免费通行证、赛季规则与荣誉 | M13、M14 |
| U11 | 日志与战报 | 重要事件筛选、回合记录、参与者可见的行动结果 | M04、M15 |
| U12 | 实验工具 | 固定队伍的策略对照、批量结果、指标导出 | M15；仅研究者入口 |

这是页面职责划分，不要求每项独立路由。宽屏可以使用列表加详情，窄屏切换到单列详情；最终界面平台与视觉风格另定。

### 4.2 可复用组件

- 宝可梦卡：精确形态图片、名称、等级、属性、收藏标记和占用原因；点击进入同一个体详情。
- 成员选择器：按物种、属性、等级、岗位与归属筛选；不可用成员显示原因，不仅置灰。
- 资源条与成本面板：显示实际可用量、预留或活动携带量、操作成本和不足项。
- 活动卡：当前阶段、完成时间、已经停止的原因、可执行操作；倒计时来自已确定的完成时刻。
- 配置确认面板：显示将使用的成员、物品和不可中途更改的内容；用于开孵、报名、交换等实际提交。
- 奖励卡：明确“尚未达到、可领取、已领取”，盲盒与自选礼包使用不同操作。
- 战报行：回合、行动者、行动、目标、影响；隐藏字段在返回给客户端前过滤。

所有页面要覆盖初次无数据、条件未解锁、资源不足、成员被占用、进行中、完成、提交冲突等状态。普通玩家不需要看到模型名称、数据库主键或资料同步过程。

## 5 逐模块素材 UI 与数据需求

### M01 宝可梦个体与培养

**场景。** 玩家从收藏打开一只成员，查看数值并分配训练点；成功后库存与属性一致变化，不能扣了训练点却未改变努力值。

- 素材：A01–A05；复用已下载立绘与像素图，补属性、训练点及培养道具标识。
- UI：U02 个体详情，六项数值、性格、特性、努力值编辑与提交前后差值；显示剩余训练点、单项和总量约束。
- 静态与配置：物种/形态/性格目录、C01 规则、C04 培养参数、C10 资源定义。
- 存档：R01 玩家、R02 库存、R03 个体、R04 已学招式；占用检查读取 R05 与 R19。
- 写入标准：先结算受影响的旧活动，再在同一事务中扣资源和写努力值。最终属性从基础值与培养字段推导，不另存一套可漂移的战斗力。
- 缺口：训练点产率、重分配成本、性格与特性后天调整方式尚未定；不能只因上游存在某道具就开放本作功能。

### M02 等级经验与学习装置

**场景。** 六只成员探索后分别获得经验，玩家可看到各自成长及学习装置效果。

- 素材：A02、A04、A05，经验条和学习装置图标。
- UI：U02/U04 展示各成员等级、当前进度、获得经验来源；预计满级时间标为估算，不能展示未经验证的保证日期。
- 静态与配置：经验目录已在本地；C04 指定成长曲线、学习系数和带新上限。
- 存档：经验保存在 R03；结算游标在 R08；经验摘要写 R25，不新增一张“当前等级表”。等级从累计经验及规则推导。
- 写入标准：一次结算对每只成员最多发放一次经验；单只约 7 天、整队约 8–9 天是验证目标，不由 UI 倒计时强行实现。
- 缺口：经验曲线选择与系数需调参，原始经验表不缺。

### M03 探索与离线结算

**场景。** 玩家准备队伍和物资，离线后回来查看探索、恢复、捕获和资源消耗。

- 素材：A02、A04–A06，地区封面、恢复与补给状态图标。
- UI：U04 开始/调整探索，当前地区与成员、携带资源、恢复剩余时间；U01 展示累计结果。恢复是探索队状态，不阻断其他页面操作。
- 配置：C04 经验、C05 地区与遭遇、C06 捕获、C01 快速/简单战斗规则。
- 存档：R08 探索任务保存时间与随机进度；R05 保存成员占用；R03 保存日常生命/PP 等实际状态；R02 与探索携带物资之间转移数量。
- 写入标准：调整或停止前结算旧时段；同一时段不重复发奖。恢复期间不继续生成遭遇，分次领取不重抽过去事件。
- 缺口：探索间隔、快速计算的适用条件与误差、普通探索单双打口径、资源消耗规则。20 分钟恢复仍为候选初值。

### M04 高级战斗与自然语言战术

**场景。** 玩家提交六只队伍和战术后，由系统进行双打，玩家回来阅读结果。

- 素材：A02、A04、A06、A09；首版静态双打站位和日志足够，不依赖全套招式动画。
- UI：U08 报名摘要，U11 战场概览和逐回合列表；两只当前在场、四个替补位置，未公开的信息不在详情里提前展示。
- 静态与配置：规则目录、引擎映射、C01 对战规则、C15 NPC、C16 赛事；若选择 Showdown，复用其规则实现而不是把效果描述当执行脚本。
- 存档：R18 报名快照、R19 玩家参赛成员索引、R20 比赛结果与行动记录，按需关联 R26 实验。
- 写入标准：六只全员参战，禁止套用六选四默认格式；日常成长不改已提交队伍。双方使用同样信息与决策条件。
- 缺口：规则版本、可用内容、AI 决策方法、时限与自然超时处理；Showdown 源码存在但本作适配未做。系统故障恢复与额外拖延反制仍暂缓。

### M05 编队与预设管理

**场景。** 玩家保存探索或比赛编队，下次应用时看到哪些成员或道具不可用。

- 素材：A02、A04、A05；共用成员卡与选择器。
- UI：U03 六个槽位、顺序调整、实际配置检查、战术字符计数和模板；应用前列出不可用项。
- 配置：C01 长度限制与合法格式，C18 基础风格模板。
- 存档：R06 预设头、R07 预设成员；提交比赛时复制为 R18 的不可变快照，不让比赛引用可编辑预设实时读值。
- 写入标准：预设不复制个体、不凭空提供道具、不自动兑现努力值目标；探索不因预设含文本而调用 AI。
- 缺口：首版预设数量上限与基础模板文案；没有必要先开发提示词市场或共享社区。

### M06 地区遭遇与心愿捕获

**场景。** 玩家选择夜间目标，系统在实际窗口中探索，击败后按授权球策略尝试捕获。

- 素材：A01、A02、A04–A06，球图标、地区封面与时段标识。
- UI：U04 地区卡显示等级与时间窗；心愿编辑器显示目标数量、允许球类、保留库存和尝试上限；结果解释未捕到的原因。
- 配置：C05 地区和时间条件，C06 击败后捕获概率；物种基础捕获参数仅作输入之一。
- 存档：R09 心愿单、R08 携带物资和探索进度、R03 新个体、R23 首获图鉴、R25 重要捕获日志。
- 写入标准：投球扣数、生成个体、图鉴首获在一次结果提交内完成；时间窗按遭遇时间，不按领取时间。
- 缺口：本作地图与遭遇权重需设计，原作地区 CSV 不能自动生成无人坟墓等自定义地区。捕获机会公式仍待定。

### M07 配对产蛋与整盒孵化

**场景。** 玩家选择双亲与盒，产蛋后开始整批孵化，所有结果与加速在开孵时固定。

- 素材：A01、A02、A04、A07，通用蛋图、盒位、主理人和结果卡。
- UI：U05 每盒状态卡；配对兼容性、目标蛋数、主理人、整批预计完成时间；孵化中隐藏换蛋和换主理人操作。
- 配置：物种蛋组/性别资料、C07 配对和遗传、C08 孵化盒等级。`hatch_counter` 不直接转成时长。
- 存档：R10 设施、R11 批次、R05 占用、完成后 R03/R04 新个体与招式，同时登记 R23 首获图鉴并更新适用的 R24 目标。蛋暂嵌入批次，不增加可交易的蛋实体系统。
- 写入标准：双亲产蛋输入冻结；开孵结果封存且不返回尚未揭示的个体值；整批只完成一次。道馆防守采用独立存档，不持续占用真实主理人。
- 缺口：遗传概率、产蛋/孵化时长、主理人倍率、初始盒数；基础蛋组与性别数据已有。

### M08 招式获得与延迟进化

**场景。** 使用技能机获得招式，后代合法继承；达到进化条件后由玩家手动确认。

- 素材：A01、A04、A05；招式属性、技能机与进化物图标，进化前后立绘复用。
- UI：U02 招式库与四个装备位、来源说明、技能机兼容提示；进化区显示可选分支和所需条件，不自动执行。
- 静态与配置：学习表、技能机表、进化表已在本地；C07 指定本作技能机遗传扩展，C01 指定适用版本。
- 存档：R04 记录学会的招式和装备位；R13 记录已达成的事件型进化条件；R02/R03 保存消耗与形态变化；进化到首次拥有的物种时登记 R23，并更新适用的 R24 目标。
- 写入标准：重新装备不重复消费技能机；合法继承不要求重刷。只保存不可重建的事件资格，当前等级达标可从个体直接计算。
- 缺口：旧版本说明与本作可用学习表需整理；通讯持物消耗时点、特殊进化与形态变化仍按主文档状态处理。

### M09 收藏管理与产业经营

**场景。** 重复成员被安排在产业岗位或后备位置，持续生产并用于扩建。

- 素材：A02、A04、A08；普通成员卡、设施图标和产物图标。
- UI：U02 筛选、批量标签；U06 设施卡、岗位与后备选择、预计/实际产量、扩建成本和收益变化。
- 配置：C08 设施与适性、C10 材料和收购规则；成员属性和特性来源已有，产业收益是本作配置。
- 存档：R10 设施及生产余数、R05 唯一占用、R02 库存。后备人数由占用行统计，不额外维护容易失真的成员计数。
- 写入标准：调岗前结算旧岗位；扩建扣款与等级/建设状态共同提交；固定设施产能不能随成员数无限增加。
- 缺口：设施图、产物、配方、价格、初始资源和适性系数。公式候选见数值文档，不当成最终调参结果。

### M10 联机广场与心愿交换

**场景。** 发布一只成员及持物的报价，另一玩家提供符合条件的成员与持物完成交换。

- 素材：A01、A02、A04、A05；使用现有个体卡，补交换方向与锁定标识。
- UI：U07 市场列表、我的挂单、筛选、双方属性和持物对照、最终确认；没有独立的道具售卖入口。
- 配置：C10 可持有/可交换规则、C01 交易限制；目标条件采用可验证字段。
- 存档：R14 挂单同时承担成交记录，R05 锁定卖方个体；成交改 R03 归属与持物，写 R13 通讯资格、R23 图鉴和 R25 日志。
- 写入标准：双边交换原子完成；接受时重新检查买方成员与库存；同一挂单不能成交两次。持物已经属于个体，不再从背包重复转移。
- 缺口：挂牌期限、筛选项、费用是否存在；交易功能不需要额外玩家物品交易所。

### M11 果园与树果

**场景。** 玩家用树果种植，离线生长结果，有限位置促使选择种类。

- 素材：A04、A05、A08；树果图标、通用果树阶段、空地与满载状态。
- UI：U06 果园页签，位置、树种、阶段、下次结果、可收获量、扩建与改种成本。
- 配置：C09 本作果树周期和容量，C08 果园扩建；上游 `berries.csv` 仅提供参考属性与道具关联。
- 存档：R10 果园设施、R12 地块、R02 树果与建设资源。
- 写入标准：种植扣除材料；满载后依配置暂停；收获把地块缓冲转到库存，不同时算两处资产。
- 缺口：树果图、果树阶段、实际种植周期、扩建配方与改种规则。

### M12 道馆 联盟与重要 NPC

**场景。** 玩家挑战八馆之一或报名联盟，按冻结队伍自动对战，获胜后更新荣誉和席位。

- 素材：A02、A04、A09、A10，馆主/NPC 肖像、道馆标识与荣誉外显。
- UI：U08 八馆列表、隐藏详情的对手摘要、报名条件与锁定预览、赛程、结果；胜负后跳转 U11。
- 配置：C15 NPC 合法队伍与风格、C16 赛制和双败处理、C11 奖励。
- 存档：R16 道馆席位、R17 赛事、R18/R19 参赛者、R20 比赛；结果生成 R21 奖励资格、更新 R24 进度和 R25 日志；实际领取才写 R22。
- 写入标准：道馆受理时绑定当前馆主；同一结果不重复更替或发奖。NPC 不应占用虚构的玩家账户库存。
- 缺口：NPC 图和本作队伍、赛制、报名门槛、超时与晋级规则；PokéAPI 与 Showdown 数据不能自动提供本作每季的 NPC 策略。

### M13 道具 商店与免费通行证

**场景。** 玩家购买补给、查看掉落，完成游戏行为后提升免费通行证并选择奖励。

- 素材：A04、A05、A10；道具图标、盲盒/自选区别与外显预览。
- UI：U09 背包和商店，U10 通行证；显示刷新倒计时、价格、剩余购买量、可领取节点与自选范围。
- 配置：C10 资源、C11 奖池、C12 商店、C13 目标与 C14 通行证。
- 存档：R02 库存、R15 当前货架、R21 待领取奖励、R22 已领取结果、R24 任务/通行证进度。
- 写入标准：购买库存与余额一起变更；盲盒和自选奖励以确定的领取来源为单位去重；自选未选完不默认随机替玩家选。
- 缺口：道具中文效果、图标、刷新规则、价格、掉率、通行证档位与具体奖池。原作 `cost` 不能直接用于挂机经济。

### M14 赛季与三家成长机构

**场景。** 博士、市委、联盟展示下一阶段目标；季末结算保留收藏并更新当季竞争内容。

- 素材：A09、A10，机构头像/徽记、赛季封面与永久/当季荣誉标记。
- UI：U10 三家机构页签、进度与奖励，赛季日期、保留/重置说明、历史成绩。没有条件的数据不能显示为“已经开放”。
- 配置：C13 里程碑、C14 通行证、C17 赛季；永久与赛季作用域使用不同键。
- 存档：R27 赛季、R23 历史图鉴、R24 事件进度、R21/R22 奖励；席位与赛程分别复用 R16/R17。
- 写入标准：先按旧赛季结算旧时间，再应用新赛季配置；历史首获不因交换和重登刷新。
- 缺口：赛季长度、最终保留清单、未领/未结束内容处理、机构档位和外显清单。

### M15 重要日志与论文验证

**场景。** 玩家快速看懂这次收益和关键输赢，研究者比较不同风格的效果。

- 素材：A04、A10；日志分类图标与结果徽标，指标图表可以使用标准图形。
- UI：U01 摘要、U11 筛选与详情、U12 对照实验；实验参数不占用普通玩家操作路径。
- 配置：C01 事件类型与展示权限，实验记录保存所用规则/模型/预算标识。
- 存档：R25 重要日志、R20 实际行动记录、R26 实验。相同业务事实通过关联引用，不在三处维护不同战斗结果。
- 写入标准：战报按实际行动生成；不记录或展示模型内部思考链。仅有随机种子不足以复现 AI 决策，必须保留实际选择序列与版本。
- 缺口：统计目标、样本量、基线风格和实验预算；属于论文实验设计，不是上游数据缺失。

### M16 大型团战与神兽副本

**场景与状态。** 保留多人协作和特殊 Boss 方向，参与人数、行动控制与分奖规则尚未确定。

- 素材：A02、A06、A09、A10，可先复用宝可梦图；专属 Boss 场景待玩法确定后制作。
- UI：预留 U08 活动入口与 U11 战报复用方向；不提前制作房间、邀请、贡献榜等未确定页面。
- 配置与表：可复用赛事/比赛/奖励的已定义部分。暂不新增团战房间、组队匹配、贡献结算表；只有规则确定后才能判断哪些状态需要持久化。
- 缺口：完整参与和奖励规则，见主文档 M16；不能把双方六只双打直接套到多人团战。
- 交付条件：玩法明确后补齐素材数量、UI 状态和新增表，再进入实现。

## 6 本作配置结构

配置由开发者或内容维护者编写，客户端只读取公开部分。以下是逻辑配置集合，不要求每行单独创建物理文件或 SQL 表。可以按“基础映射、玩法规则、内容配置”分组保存，禁止回写 `data/raw/pokeapi/` 来表达本作规则。

所有配置至少包含稳定 `key`、`revision` 和明确作用域；引用其他配置时使用键，不使用中文展示名。未定数字仍引用数值文档的待定项；关键项未填写时，该内容不能进入可运行名单。

| 编号与配置 | 关键字段 | 来源与校验 |
| --- | --- | --- |
| C01 `ruleset` | `key`、`source_revisions`、`version_groups[]`、`engine_version?`、`format`、`level_policy`、`visibility_policy`、`timeout_policy`、`tactic_limit`、`ordinary_battle_policy` | 固定上游版本和本作覆盖；高级对战总队伍 6、在场 2；不能用一个世代数字代替完整版本范围 |
| C02 `content_selection` | `kind`、`source_id`、`enabled`、`ruleset_key`、`engine_id?`、`override_reason?` | 开放名单与引擎映射；enabled 内容必须具备所需数据，未映射项不可用于正式比赛 |
| C03 `presentation_overrides` | `entity_key`、`name_zh?`、`description_zh?`、`asset_role`、`path?`、`approved_shared_asset?`、`source_note` | 只保存缺失补充和已确认共享映射，不复制所有已有图片索引 |
| C04 `growth_and_training` | `curve_policy`、`xp_factors`、`carry_bonus_cap`、`ev_limits`、`collector_output`、`reset_cost` | 参考数值文档成长目标；所有概率和成本有单位，不直接使用原作 effort_yield 加 EV |
| C05 `regions` | `region_key`、`name`、`theme_types[]`、`entry_condition`、`level_range`、`encounter_duration`、`encounters[]`、`drop_pool_key`、`cover_asset` | encounters 每条有物种/形态、权重、等级范围和时间条件；原作 regions 不覆盖本作地区设计 |
| C06 `capture_policy` | `formula_key`、`parameters`、`attempt_limit`、`attempt_duration`、`ball_modifiers[]`、`failure_rule` | formula_key 指向已实现并验证的函数，不能是任意可执行字符串；原作 capture_rate 只是输入 |
| C07 `breeding_policy` | `compatibility_version`、`production_time`、`hatch_times`、`inheritance_policy`、`manager_effects`、`parent_release_policy`、`manager_tournament_policy` | 时间为秒；基因与招式继承分开；道馆防守存档不持续占用真实主理人 |
| C08 `facility_types` | `facility_key`、`kind`、`levels[]`、`costs[]`、`slots`、`output`、`affinities`、`reserve_curve` | 包含产业、孵化盒、果园容器；各 kind 采用自己的字段规范，不做任意设施脚本平台 |
| C09 `orchard_policy` | `berry_resource_key`、`mature_seconds`、`yield_period_seconds`、`yield_quantity`、`buffer_limit`、`replant_cost` | 上游树果属性可引用，AFK 周期、缓冲和成本自定 |
| C10 `resource_overrides` | `resource_key`、`kind`、`source_item_id?`、`effect_key?`、`can_hold`、`can_sell`、`can_trade_attached`、`stack_limit?`、`icon_key`、`sell_price?` | 补本作货币、材料、荣誉以及原作物品的游戏规则；货币与身份荣誉不能作为普通持物 |
| C11 `reward_pools` | `pool_key`、`mode`、`entries[]`、`weights?`、`pick_count?`、`conditions`、`duplicate_policy` | mode 明确固定、随机、自选；entry 统一引用 resource_key、数量或明确的个体生成配方 |
| C12 `shops` | `shop_key`、`refresh_period`、`timezone`、`scope`、`offer_pool`、`fixed_offers`、`price`、`purchase_limit` | 金钱价格按本作配置；库存作用域与刷新时刻明确 |
| C13 `objectives` | `objective_key`、`institution?`、`scope`、`metric_key`、`target`、`reward_pool_key`、`repeat_policy` | metric_key 来自有限业务指标，如首获物种/建厂/胜场；不执行自由表达式 |
| C14 `season_pass` | `pass_key`、`season_template`、`xp_levels[]`、`task_keys[]`、`level_rewards[]` | 全免费；各节点来源唯一，自选礼包引用 C11 |
| C15 `npc_templates` | `npc_key`、`name`、`portrait_key`、`theme`、`difficulty`、`team[6]`、`tactic` | 六成员配置应包含等级、IV/EV、性格、特性、招式与持物；全部经规则校验 |
| C16 `event_templates` | `event_key`、`kind`、`gym_key?`、`entry_conditions`、`schedule`、`format`、`draw_resolution`、`double_loss_resolution`、`npc_entry_policy`、`rewards` | 单场可先配置；联赛缺晋级规则时不能宣称可运行完整赛季 |
| C17 `season_templates` | `season_key`、`duration`、`timezone`、`ruleset_key`、`npc_pool`、`gym_assignment_policy`、`pass_key`、`data_transition_policy` | 每类跨季数据明确保留/重置/转换/延期，不能靠删除全部玩家记录实现 |
| C18 `tactic_templates` | `template_key`、`label`、`description`、`text`、`supported_format` | 文字不超过长度限制，可供玩家修改，不授予额外 AI 权限 |

所有嵌套条件使用明确的种类与字段，例如“最低等级”“每日时间窗”“拥有物品”；列表中的多个条件如何组合必须规定。数值表达式、UI 文案和引擎可执行效果分别存放，避免一段说明文字同时承担三种职责。

## 7 玩家运行表结构建议

### 7.1 类型与共同约定

- `ID`：本作生成的稳定标识，数据库可用整数或文本实现；本稿不提前选 ORM。
- `SRC_ID`：上游整数标识，明确属于 species、pokemon、form、move 等哪个域。
- `KEY`：版本化静态目录键，例如地区、资源、进化规则、赛事模板。
- 运行期的作用域、周期、参赛者和奖励发生标识使用 `TEXT`，并各自规定格式；不能把一次实际奖励的标识误用为静态奖池键。
- `TS`：统一的 UTC 时间戳；`seconds` 明确为持续秒数，不与时间戳混用。
- `JSON`：具有固定字段规范的结构，不是任意文本；客户端不能直接提交完整内部 JSON 覆盖状态。
- `?`：允许为空；`PK`：主键；`FK`：运行表外键；`UQ`：唯一约束；`IDX`：有具体查询用途的索引。

静态 JSON 目录的引用不冒充 SQL 外键：导入校验与业务写入均需检查目录键存在且已开放。运行表之间的关联优先使用实际 FK。数量非负、成员归属一致等跨表条件在事务内检查。

下列 27 个关系是全模块逻辑方案，按模块阶段建立；其中实验、赛事、交换等未实现时不需要提前建空表。不增加单独的通行证账户、馆主玩家、孵化宝可梦或产业宝可梦副本。

### 7.2 账户 个体与占用

| 编号与表 | 字段结构 | 主键 约束与索引 |
| --- | --- | --- |
| R01 `player` | `id:ID`、`display_name:TEXT`、`created_at:TS`、`settings_json:JSON`、`equipped_honor_key:KEY?`、`last_seen_log_at:TS?` | PK id；登录身份绑定待技术栈决定；展示荣誉必须确实拥有，不在此重复存金钱 |
| R02 `inventory` | `player_id:ID`、`resource_key:KEY`、`quantity:INT`、`updated_at:TS` | PK(player_id,resource_key)，FK player；quantity≥0；金额也用资源行表达，不与 player 余额双写 |
| R03 `pokemon_instance` | `id:ID`、`owner_id:ID`、`pokemon_id:SRC_ID`、`form_id:SRC_ID?`、`nickname:TEXT?`、`gender:ENUM`、`shiny:BOOL`、`exp_total:INT`、`growth_curve_key:KEY`、`iv_json:JSON`、`ev_json:JSON`、`nature_id:SRC_ID`、`ability_id:SRC_ID`、`friendship:INT`、`held_resource_key:KEY?`、`world_hp:INT`、`world_status_json:JSON`、`origin_json:JSON`、`tags_json:JSON`、`acquired_at:TS` | PK id，FK owner；IDX(owner_id,pokemon_id)、IDX(owner_id,acquired_at)；form 必须属于 pokemon；IV/EV 为固定六项整数且受限 |
| R04 `pokemon_move` | `instance_id:ID`、`move_id:SRC_ID`、`learned_at:TS`、`learn_sources_json:JSON`、`equipped_slot:INT?`、`world_pp:INT` | PK(instance_id,move_id)，FK instance；UQ(instance_id,equipped_slot) 仅约束非空槽；槽位 0–3；学习记录保留，卸下不等于遗忘 |
| R05 `pokemon_assignment` | `instance_id:ID`、`role:ENUM`、`expedition_id:ID?`、`facility_id:ID?`、`breeding_batch_id:ID?`、`listing_id:ID?`、`slot:INT?`、`assigned_at:TS` | PK/FK instance；四种目标恰有一种非空且为 FK；role 与目标类型相符；IDX(各目标外键,role) |
| R13 `evolution_event` | `instance_id:ID`、`evolution_rule_key:KEY`、`achieved_at:TS`、`evidence_json:JSON`、`consumed_resource_key:KEY?`、`used_at:TS?` | PK(instance_id,evolution_rule_key)，FK instance；记录已达成的通讯等事件，不复制可实时推导的等级条件 |
| R23 `pokedex_entry` | `player_id:ID`、`species_id:SRC_ID`、`first_obtained_at:TS`、`first_source:ENUM` | PK(player_id,species_id)，FK player；当前持有数量从 R03 查询，不在此维护 |

R03 的 `species_id` 可通过 pokemon_id 得到，等级与最终六项属性可从经验、成长曲线和培养字段得到，本版不重复保存。若今后为查询加入缓存字段，必须规定更新和重建方式，不能让缓存成为第二套事实。

`world_hp`、`world_status_json`、R04 的 `world_pp` 表示日常探索实际损耗，不能只存于一次 UI 会话中；换队、卸下再装备招式不应自动恢复。高级比赛使用独立快照，不写回这些日常损耗字段。

持物的位置只有一个：装备时从 R02 扣一个并写 R03；卸下时反向转移；持物消耗时清空 R03。交换整只成员后持物随个体归属转移，不再次从背包扣除或复制。

R05 的 role 建议为 `exploration`、`industry_worker`、`industry_reserve`、`breeding_parent`、`hatch_manager`、`trade_listing`。空闲就是没有 R05 行，不再维护一个独立的 `is_busy`。参赛快照限制由 R19 单独查询，不混入日常岗位。

### 7.3 编队与探索

| 编号与表 | 字段结构 | 主键 约束与索引 |
| --- | --- | --- |
| R06 `team_preset` | `id:ID`、`player_id:ID`、`name:TEXT`、`purpose:ENUM`、`tactic_text:TEXT`、`revision:INT`、`updated_at:TS` | PK id，FK player；IDX(player_id,purpose)；按统一字符算法限制文本长度 |
| R07 `team_preset_member` | `preset_id:ID`、`slot:INT`、`instance_id:ID`、`desired_build_json:JSON?` | PK(preset_id,slot)，FK preset/instance；UQ(preset_id,instance_id)；槽位 0–5；desired_build 只是目标，不自动修改实际属性 |
| R08 `expedition` | `id:ID`、`player_id:ID`、`source_preset_id:ID?`、`region_key:KEY`、`ruleset_revision:KEY`、`policy_snapshot_json:JSON`、`status:ENUM`、`started_at:TS`、`settled_through:TS`、`recovery_until:TS?`、`rng_state_json:JSON`、`phase_state_json:JSON`、`supplies_json:JSON`、`closed_at:TS?` | PK id，FK player/preset；每玩家最多一个未关闭任务；IDX(player_id,status)；成员及次序从 R05 的 exploration 角色与 slot 得到 |
| R09 `capture_wishlist` | `id:ID`、`player_id:ID`、`target_species_id:SRC_ID`、`target_form_id:SRC_ID?`、`target_quantity:INT`、`priority:INT`、`ball_policy_json:JSON`、`enabled:BOOL` | PK id，FK player；IDX(player_id,enabled,priority)；目标数量与球保留量非负 |

R08 的 phase_state 只保存尚未完成的遭遇或计算余量等必须跨结算延续的信息，不复制个体永久培养字段。`settled_through` 与随机进度共同保证一次领取和多次领取等价。

建议探索开始时把授权携带的球与补给从背包转入 `supplies_json`，停止时返还剩余数量。这样已交给探索的资源不会同时被商店出售或其他操作消费。它表示真实携带物资，不再另存一个背包 reserved_quantity。改变携带物资前先结算旧时段，退回只执行一次。

心愿配置可以编辑，但对当前探索的修改应先结算原配置，再更新 R08 的策略快照；不能让新心愿单捕获过去已经错过的目标。

### 7.4 设施 孵化与果园

| 编号与表 | 字段结构 | 主键 约束与索引 |
| --- | --- | --- |
| R10 `player_facility` | `id:ID`、`player_id:ID`、`facility_key:KEY`、`level:INT`、`position:INT`、`status:ENUM`、`settled_through:TS`、`construction_until:TS?`、`state_json:JSON` | PK id，FK player；UQ(player_id,facility_key,position)；IDX(player_id,facility_key)；state 按设施 kind 分别验证 |
| R11 `breeding_batch` | `id:ID`、`player_id:ID`、`box_facility_id:ID`、`phase:ENUM`、`parent_inputs_json:JSON`、`target_egg_count:INT`、`eggs_json:JSON`、`manager_input_json:JSON?`、`policy_revision:KEY`、`production_started_at:TS`、`production_progress_json:JSON`、`hatch_started_at:TS?`、`complete_at:TS?`、`completed_at:TS?` | PK id，FK player/box；每盒最多一个未结束批次；IDX(player_id,phase)、IDX(phase,complete_at)；蛋数不超目标与盒容量 |
| R12 `orchard_plot` | `facility_id:ID`、`slot:INT`、`berry_resource_key:KEY?`、`planted_at:TS?`、`phase:ENUM`、`settled_through:TS`、`next_yield_at:TS?`、`buffer_quantity:INT`、`policy_revision:KEY` | PK(facility_id,slot)，FK facility；地块数受设施配置约束；buffer 非负且不超配置容量 |

R10 的产业 state 可包含生产小数余量、尚未入库的产物和自动出售策略；孵化盒不重复保存 R11 的蛋和结束时间；果园不重复保存 R12 的每块地状态。类型不同的状态字段不互相解释。

R11 的每枚蛋包含批次内唯一 `egg_key`、遗传输入、预计时长及开孵后封存的生成结果。完成时保存新个体 ID 列表并将 completed_at 写入，同一批次不能重复生成。双亲历史快照用于遗传，R05 用于当前占用，二者职责不同。

界面只读取当前阶段允许公开的蛋数和时间；封存的 IV、性格、特性等结果在孵化完成前不返回给客户端。采用批次 JSON 是因为当前没有单蛋交易、跨盒移动或独立领取需求；若以后加入这些玩法，再拆成独立蛋表。

### 7.5 交换 商店与奖励

| 编号与表 | 字段结构 | 主键 约束与索引 |
| --- | --- | --- |
| R14 `trade_listing` | `id:ID`、`seller_id:ID`、`offered_instance_id:ID`、`offer_snapshot_json:JSON`、`request_json:JSON`、`status:ENUM`、`created_at:TS`、`expires_at:TS?`、`buyer_id:ID?`、`received_instance_id:ID?`、`settled_at:TS?`、`trade_result_json:JSON?` | PK id，FK seller/buyer/两个个体；IDX(status,created_at)、IDX(seller_id,status)；有效挂牌通过 R05 独占个体 |
| R15 `shop_rotation` | `id:ID`、`shop_key:KEY`、`scope_key:TEXT`、`period_key:TEXT`、`player_id:ID?`、`starts_at:TS`、`ends_at:TS`、`offers_json:JSON`、`config_revision:KEY` | PK id，FK player；UQ(shop_key,scope_key,period_key)；个人 scope_key 为 `player:<player_id>`，全服为 `global:<范围标识>`；必须与 player_id 和配置 scope 一致 |
| R21 `reward_offer` | `id:ID`、`player_id:ID`、`source_kind:ENUM`、`source_instance_key:TEXT`、`period_key:TEXT`、`reward_spec_json:JSON`、`sealed_result_json:JSON?`、`created_at:TS`、`expires_at:TS?` | PK id，FK player；UQ(player_id,source_kind,source_instance_key,period_key)；来源指具体发生实例，待领取与已领取由 R22 关联判断 |
| R22 `reward_claim` | `offer_id:ID`、`player_id:ID`、`chosen_options_json:JSON?`、`granted_result_json:JSON`、`claimed_at:TS` | PK/FK offer_id，FK player；每个 offer 最多一条；IDX(player_id,claimed_at) |

R14 同时保存完成后的交易结果，不再复制成另一个交易历史表。报价中的成员持物在挂牌期间不能变更；若过期规则尚未确认，expires_at 可以为空，但不能因此自动销毁资产。

R15 每条货架项使用周期内稳定 offer_key，包含已冻结价格、数量上限与已购买量。购买把货架计数、库存和金钱一起提交，不用客户端传来的价格扣款。

R21 保存实际已经获得但尚未领取的奖励资格，以及当时的奖池版本；随机结果可在资格创建时封存，自选奖励保存当时可选集合。R22 是领取后的结果事实，与 R02 的实际资源增加在同一事务提交，不另外存一份含糊的 claimed 布尔值。

`source_instance_key` 标识一次实际奖励发生，不是静态奖池或礼包类型。比赛可使用 `battle:<比赛 ID>:<奖励角色>`，里程碑可使用 `milestone:<目标键>:<作用域>`，打开礼包可使用 `open:<本次操作 ID>`。一次提交重试复用同一操作 ID；合法打开第二个同类礼包使用另一个操作 ID。可重复任务还需包含实际完成序号或事件 ID，不能因模板相同而阻止后续奖励。奖池键及版本保留在 reward_spec_json 中，period_key 使用明确周期或 permanent。

背包里的礼包与待选奖励不能同时代表同一份可兑现资产：建议打开礼包时扣除一个礼包并生成一个 reward_offer；选定并领取后写 reward_claim。里程碑与通行证节点可直接生成 reward_offer，不必先制造礼包道具。随机内容封存后不能反复打开重抽。

### 7.6 赛季 赛事与比赛

| 编号与表 | 字段结构 | 主键 约束与索引 |
| --- | --- | --- |
| R27 `season` | `id:ID`、`template_key:KEY`、`starts_at:TS`、`ends_at:TS`、`status:ENUM`、`ruleset_revision:KEY`、`npc_assignments_json:JSON`、`transition_policy_json:JSON`、`settled_at:TS?` | PK id；IDX(status,starts_at)；当前测试服有效赛季不能重叠；NPC 抽取结果保存一次 |
| R16 `gym_seat` | `gym_key:KEY`、`season_id:ID`、`holder_kind:ENUM`、`player_id:ID?`、`npc_key:KEY?`、`defense_snapshot_json:JSON`、`last_change_battle_id:ID?`、`changed_at:TS` | PK gym_key，FK season/player/battle；持有者二选一；八席按配置初始化 |
| R17 `competition_event` | `id:ID`、`season_id:ID?`、`template_key:KEY`、`kind:ENUM`、`gym_key:KEY?`、`status:ENUM`、`registration_until:TS?`、`starts_at:TS`、`format_snapshot_json:JSON`、`bracket_json:JSON?`、`settled_at:TS?` | PK id，FK season/gym；IDX(season_id,status,starts_at)；bracket 只存赛程结构，比赛结果读取 R20 |
| R18 `competition_entry` | `id:ID`、`event_id:ID`、`participant_kind:ENUM`、`player_id:ID?`、`npc_key:KEY?`、`participant_key:TEXT`、`team_snapshot_json:JSON`、`tactic_text:TEXT`、`ruleset_revision:KEY`、`status:ENUM`、`submitted_at:TS` | PK id，FK event/player；UQ(event_id,participant_key)；player 与 NPC 二选一；participant_key 带 player/NPC 前缀并与实际对象一致；快照为六成员完整配置 |
| R19 `entry_member` | `entry_id:ID`、`slot:INT`、`instance_id:ID` | PK(entry_id,slot)，FK entry/instance；UQ(entry_id,instance_id)；IDX(instance_id,entry_id)；仅真实玩家个体建行 |
| R20 `battle` | `id:ID`、`event_id:ID`、`left_entry_id:ID`、`right_entry_id:ID`、`round_key:TEXT`、`match_slot:INT`、`game_no:INT`、`engine_revision:KEY`、`decision_config_json:JSON`、`decision_observations_json:JSON`、`initial_state_json:JSON`、`seed_json:JSON`、`events_json:JSON`、`result:ENUM?`、`end_reason:ENUM?`、`started_at:TS?`、`ended_at:TS?`、`experiment_id:ID?` | PK id，FK event/双方 entry/experiment；两条 entry 必须属于本 event；UQ(event_id,round_key,match_slot,game_no)；IDX(event_id,round_key)、IDX(experiment_id) |

R19 用于快速查询某个体是否受有效赛事限制；有效性由 entry 和 event 的状态判断，不在个体表复制 is_registered。NPC 使用 R18 快照中的生成成员，不生成 R03 玩家资产。

双方战术和完整快照是私有输入，返回给对手的数据按 C01 的信息策略裁剪。R20 保存真实行动与公开结果，必要时事件注明可见方；不能把服务器全量快照直接用作战报接口返回。

R16 的馆主防守配置更新频率，以及防守成员当时不可用时的处理，仍需要补充业务规则。此表不自动创建全年占用；受理一次挑战时冻结双方合法配置并生成赛事条目，不能把馆主更替后到来的挑战交给旧馆主。相关缺口列在 G12。

测试版不为 AI 故障重试新增任务队列、补偿表或恢复状态机。R20 的实际行动记录服务于战报与实验复核，不意味着承诺异常断点恢复；仅有种子和提示词无法重建外部 AI 的所有选择。

R20 的 decision_observations_json 按每次实际决策保存固定字段：回合、决策方、序号、实际模型调用次数、决策耗时毫秒、提供方调用耗时毫秒、输入/输出 token 数（可空）、提交的候选行动、校验结果与拒绝原因、实际接受的行动。调用次数与延迟是实测值，不能从配置预算倒推；提供方未返回的用量标为空，不伪装成 0。

非法行动统计需注明校验单位：建议以“一方一回合提交的完整行动方案”为单位，保留被拒绝的方案，比例为被拒绝方案数除以提交校验的方案数；没有样本时为空。战斗中因倒下等原因未能执行的合法行动不计为非法。报告以真实观测计算，不另存另一份权威指标汇总，也不记录模型内部思考链。

### 7.7 进度 日志与实验

| 编号与表 | 字段结构 | 主键 约束与索引 |
| --- | --- | --- |
| R24 `objective_progress` | `player_id:ID`、`scope_key:TEXT`、`objective_key:KEY`、`counter_value:INT`、`updated_at:TS` | PK(player_id,scope_key,objective_key)，FK player；保存不能从当前资产可靠重建的累计行为或任务进度；当前收藏数量不写此表 |
| R25 `important_log` | `id:ID`、`player_id:ID`、`occurred_at:TS`、`kind:ENUM`、`ref_kind:ENUM?`、`ref_id:ID?`、`summary_json:JSON` | PK id，FK player；IDX(player_id,occurred_at)、IDX(player_id,kind,occurred_at)；关联对象校验后只展示玩家有权读取的内容 |
| R26 `experiment` | `id:ID`、`name:TEXT`、`created_at:TS`、`design_json:JSON`、`ruleset_revision:KEY`、`decision_versions_json:JSON` | PK id；实验条件固定，实际样本由 R20 关联，不复制一张独立胜负统计明细表 |

图鉴进度由 R23 计算；已领取奖励由 R22 判断；当前产业数量由 R10 得到。只有例如“本周累计完成多少次指定行为”这类无法从当前快照推导的进度才写 R24。通行证经验可作为明确命名的进度指标，不再创建第二个玩家账户或独立余额。

R25 可以保存探索时段汇总，不需要每场低级战斗都永久写逐回合日志。实验汇总从实际比赛记录计算，导出时保留样本数、条件和版本；普通用户界面不展示研究者的私有实验设置。

### 7.8 写入责任 读取方与生命周期

| 表组 | 唯一业务写入责任 | 主要读取方 | 建议生命周期 |
| --- | --- | --- | --- |
| R01 | 账户与个人设置操作 | 所有页面的身份与偏好 | 账户长期保留 |
| R02–R04 | 对应培养/探索/交易操作通过统一资产与个体写入路径 | 收藏、经营、探索、交换、报名 | 资产与个体长期保留；不按赛季清空 |
| R05 | 活动开始、切换和结束 | 选择器、配对、岗位、交易与报名校验 | 当前占用存在，释放即删除；历史见活动或日志 |
| R06–R07 | 玩家预设编辑 | U03、探索启动、赛事报名 | 保存到玩家删除；不删除历史比赛快照 |
| R08–R09 | 探索安排与结算、心愿编辑 | U01/U04 | 心愿长期；活动关闭后测试期保留 |
| R10–R12 | 建设、生产、配对、孵化与果园操作 | U05/U06 | 设施长期，完成批次测试期保留 |
| R13 | 达成事件条件与手动进化 | 个体详情与进化校验 | 个体长期；用于解释资格和已消耗道具 |
| R14 | 挂牌、撤单与成交 | U07、双方交易日志 | 成交与关闭记录测试期保留 |
| R15 | 周期货架生成与购买 | U09 | 当前周期有效；测试期保留旧周期以核对消费 |
| R16–R20、R27 | 赛季/赛事组织与比赛结算 | U08/U10/U11、实验工具 | 测试期完整保留；永久荣誉和历史结果不随季误删 |
| R21–R22 | 获得资格与领取奖励 | U09/U10 | 一次性领取记录长期保留，跨季处理按既定政策 |
| R23 | 首次获得物种的业务操作 | 图鉴与博士 | 永久首获记录 |
| R24 | 真实业务事件更新有限目标 | U10 | 随永久/赛季/任务作用域保留，不能只以日期随意清空 |
| R25 | 实际事件发生方写入 | U01/U11 | 测试期保留重要摘要；详细保留策略后定，不先建设归档服务 |
| R26 | 研究者创建实验 | U12、分析导出 | 论文实验期保留，与样本引用一致 |

## 8 关键操作的提交边界

以下要求服务于具体资产和状态正确性，不要求事件总线、微服务或通用工作流框架。

| 操作 | 一次业务提交需要完成的内容 | 错误结果示例 |
| --- | --- | --- |
| 分配努力值 | 结算旧活动、检查训练点、扣 R02、改 R03、记录摘要 | 训练点扣了但努力值没变，或反过来 |
| 装备持物 | 检查归属/占用、R02 与 R03 间转移一个物品 | 背包和持物栏同时多出同一件 |
| 开始或调整探索 | 结算旧配置、获取 R05 占用、转移携带物资、记录 R08 新配置与时刻 | 新队伍追溯享受旧时段收益 |
| 捕获成功 | 扣对应尝试的球、固定随机结果、创建 R03、登记 R23、推进 R08 | 同一遭遇领取两只或不扣球 |
| 开始配对/孵化 | 检查蛋位和成员、变更 R05、冻结 R11 对应阶段输入 | 同一主理人同时为多个盒贡献，或开孵后能重抽 |
| 全批孵化完成 | 按封存结果生成个体/招式、登记 R23 首获、更新适用目标与奖励资格、写生成 ID、标完成、释放占用 | 一批多次生效、提前释放蛋位或漏掉首次孵出物种 |
| 手动进化 | 结算受影响活动、核验分支条件、消费所需资源或已达成资格、改个体形态、登记 R23 首获、更新适用目标与奖励资格 | 进化成功却漏图鉴，或同次进化重复消耗 |
| 调岗/扩建/种植 | 先结算旧状态、扣成本、更新设施或地块及占用 | 领取前调岗把历史收益提高 |
| 心愿交换成交 | 重新核验双方、转移两只归属和持物、处理通讯资格、登记首次图鉴、关闭挂单 | 单边资产转移或同单成交两次 |
| 购买/领奖 | 检查资格或货架、扣款或标领取、发资源、记录结果 | 重复点击绕过限购或重复领取 |
| 提交比赛 | 校验六成员与物品/招式、检查占用、冻结 R18、登记 R19 | 报名后换日常招式改变已提交阵容 |
| 比赛结算 | 固定胜负与原因、更新本场赛事状态、需要时更替馆主、生成奖励资格 | 一场胜利重复更替或发奖 |

日常结算由玩家查询/操作触发，保存完成时间或已结算游标，不为玩家设施启动后台倒计时或到期任务。全服赛事、NPC 刷新按全服赛程调度。无论触发方式，已结算区间和已完成结果不能重复执行。

捕获、孵化、交换和进化共用同一个“首次获得物种”登记规则：按 R23 的玩家与 species_id 唯一键去重，只有首次插入才推进首获类目标并生成相应奖励资格。仅外观变化或重复获得同种成员不重复发放物种首获奖励。

## 9 数据与素材缺口清单

| 编号 | 缺口类型 | 具体内容与本地证据 | 补齐方式 | 影响与验收 |
| --- | --- | --- | --- | --- |
| G01 | 设计 | 已选第九世代＋Mega 候选，具体版本组与首批开放名单待整理 | 先选规则范围，再从已有资料筛选 | 影响 M01–M08/M12；目录中每条开放内容有可追溯规则版本 |
| G02 | 整理 | 638,321 行学习记录尚未形成所选版本目录，技能机关系仍在原表 | 解析 pokemon_moves、methods、machines，建立版本化索引 | M02/M07/M08；不跨版本合并技能机兼容性 |
| G03 | 整理/适配 | Showdown 归档已有，但没有本作引擎映射和六只双打适配验证 | 选择是否复用引擎；核验 entity 映射、格式及自定义遗传规则 | M04/M08；所有启用实体有映射，完整战斗可产生合法结果 |
| G04 | 内容 | 201 条形态标签缺简中；18 招式、49 道具缺简中名；主系列特性名称齐全 | 与开放名单求交，补实际用到的文案，保留来源与人工修改记录 | U02/U09；无空白名称，不强迫翻译未开放的旁支内容 |
| G05 | 内容/整理 | 简中 prose 为空；已有 flavor text 覆盖有限且只见版本组 17–20 | 对所选版本整理、核对招式/特性/道具中文效果 | M01/M04/M08/M13；名称有中文不代表说明已正确 |
| G06 | 素材 | 非默认形态缺图名单在 coverage-report；默认物种图齐全 | 只处理首批开放形态，补图或显式共享映射，保留占位路径 | M01/M04/M06/M07；不把不同形态错配成同号图片 |
| G07 | 素材 | assets 当前仅 pokemon 目录，未见道具/球/树果/NPC/地图/设施/UI 素材 | 按 A04–A11 和首版页面需求补充，可先制作简洁占位 | 核心页面可操作；不以全量招式动画作为前置 |
| G08 | 设计 | 地图遭遇、窗口、捕获机会、球策略和掉率 | 编写 C05/C06/C11；参考上游参数但独立校准 | M03/M06/M13；能完成一次真实探索到捕获入库 |
| G09 | 设计 | 个体遗传概率、产蛋/孵化秒数、管理人倍率；道馆防守存档不占真实主理人 | 编写 C07，确认主文档 Q05；不要把 hatch_counter 当秒数 | M07；批次阶段和占用完整，不出现配置中途漂移 |
| G10 | 设计 | 经验、训练点、产业、果园、商店和通行证的实际数值 | 在 game-data.md 维护参数，再填 C04/C08–C14 | 调参模拟满足成长目标与基础收支；原作价格不是最终价格 |
| G11 | 设计/内容 | NPC 队伍、战斗风格、肖像与荣誉外显 | 为首批 NPC 编写 C15 与对应素材 | M12/M14；每队六只合法，早期强度与等级门槛匹配 |
| G12 | 设计 | 联盟赛制、双败晋级、馆主防守配置更新及成员不可用处理 | 补齐 C16，与主文档赛事规则同步确认 | M12；一切自然比赛结果有明确去向，防守成员处理不靠临时猜测 |
| G13 | 设计 | 赛季周期、最终保留清单、未领和未结束内容策略 | 编写 C17 与清算样例 | M14；永久个体与历史不会误删，跨季离线可分段 |
| G14 | 设计 | AI 决策方法、实验样本与预算条件 | 后续论文专题决定，复用 R20/R26 | M04/M15；能对照行为与胜率，不以服务故障反制作为首版要求 |
| G15 | 后续模式 | 团战与神兽副本的参与、行动和分奖规则 | 单独设计 M16 后增补 | 暂不创建房间、匹配和贡献表 |

G01–G03 优先于批量补素材。先确认开放范围，可以避免为不会出现在测试版中的形态、道具和旁支机制补齐全部资源。

## 10 本轮文件与后续工作边界

### 新增文件

仅新增 `docs/module-assets-ui-schema.md`：负责把玩法设计映射到素材、UI、配置与存档结构，并记录本次实际盘点结果。单独成文是因为这层内容会随实现选型演进，不宜混入玩法与数值基线。

### 修改文件

本轮无。现有设计文档仍保留原有确认状态；下载索引、原始资料、素材与脚本均不改写。此前文档的“尚未导入基础资料”反映写作时点，本次实际本地覆盖以第 1 节及 data/README.md 为准；基础资料存在仍不代表本作静态目录已生成。

### 新增数据结构

本轮仅提出 C01–C18 配置集合及 R01–R27 关系，不创建真实配置文件或数据库。各结构的业务事实、写入方、读取方与生命周期见第 6、7 节。基础字段能可靠推导的，不新增独立持久化状态。

### 建议落地顺序

1. 选定基础版本和首批内容，整理目录、中文说明、资源键及必要引擎映射。
2. 建立个体、库存、占用、编队与探索的最小闭环，同时制作 U01–U04 和共用组件。
3. 接入孵化、遗传、进化、产业与果园，补充 U05/U06 与相关配置。
4. 验证六只双打与战术，制作 U08/U11 和研究者实验入口。
5. 接入交换、商店、奖励、机构和完整赛事/赛季；依赖未定规则先明确后实现。

以上顺序是实现准备建议，不启动编码。后续改动玩法时先更新主设计和数值表，再同步本文对应模块，避免 UI 与数据库先行把待定规则固定下来。

## 11 本文交付检查

- M01–M16 均有素材、UI、数据来源、运行记录与缺口说明；M16 明确为待细化模式。
- 所有 R 编号有字段与约束，并能追溯到写入责任和读取页面；所有 C 编号有来源与校验要求。
- 已有素材、缺失素材、需要转换的数据及本作自定义配置明确分开。
- 检查 6 只总队伍、2 只在场、500 字、约 7 天单只/8–9 天整队，以及不放生、持物交换、整批孵化等核心约束。
- 检查真实个体与物种/形态/引擎 ID 的区别，避免用同号跨表关联或拼接错误图片。
- 检查尚未公开的比赛与孵化信息，不因通用详情接口提前泄露。
- 本地文件引用与盘点数字有依据；未把原始资料存在表述为功能已经实现。
