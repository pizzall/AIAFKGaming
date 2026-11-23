# 道具与树果本地数据核查

核查日期：2026-11-14。范围：本地 `data/raw/pokeapi/` 固定快照、Showdown 源码归档及素材目录；没有重新抓取网络数据，也没有改写原始表。

结论：**已有大量道具与树果基础资料，可以继续整理；尚不能认为“全部信息与图片已齐备”。** 本文统计上游记录，不表示本作会开放全部物品。

## 1 已有资料与覆盖

统计以道具 ID 去重；“非空”指对应字段实际有文本，不把空行算作效果说明。简体中文语言 ID 为 12，英文为 9。

| 内容 | 本地覆盖 | 核查口径 |
| --- | ---: | --- |
| 道具基础记录 | 2,223 | `items.csv` 的行数，包含历代、剧情、机器等不同用途的物品 |
| 道具简体中文名 | 2,174 / 2,223 | 通过 `item_names.csv` 关联；49 条缺失，名单见第 4 节 |
| 道具非空中文效果说明 | 0 / 2,223 | `item_prose.csv`；不能把中文名称覆盖率当成效果覆盖率 |
| 道具非空英文效果长文 | 944 / 2,223 | 英文有 955 条记录，其中 11 条 `effect` 为空；非空 `short_effect` 覆盖 954 条 |
| 道具中文游戏内描述 | 1,560 / 2,223 | `item_flavor_text.csv`，按道具 ID 去重，不累加跨版本重复行 |
| 树果基础记录 | 68 | `berries.csv` 的行数，不直接解释为 68 种无重复身份的完整树果 |
| 树果简体中文名 | 66 / 68 | 通过 `berries.item_id → item_names.item_id` 关联 |
| 树果非空英文效果／中文游戏内描述 | 各 66 / 68 | 文本仍需按本作规则版本核对 |
| 树果非空中文效果说明 | 0 / 68 | 与道具共用效果文本表 |
| 道具分类／背包口袋 | 54 / 8 | `item_categories.csv`、`item_pockets.csv`，不等于本作商店分类 |
| 技能机与招式关联 | 2,372 条 | `machines.csv`，带 `version_group_id`；不能只用 TM 编号关联 |
| 独立道具／树果图片库 | 尚未采集 | 项目基础 `assets/` 只有宝可梦素材；Demo 的通用示意图不是逐件物品图标 |

本地中文游戏内描述只出现于版本组 17–20，分别为日月、究极日月、Let's Go 和剑盾。这些描述不能直接标成之后版本的最新效果。英文效果表也不是本作已验证的规则实现。

Showdown 固定源码归档含 `data/items.ts`，可供之后核对携带物与战斗效果；它不是完整中文文案库，且尚未接入本作。

## 2 字段与关联入口

| 用途 | 本地表与关键字段 | 使用注意 |
| --- | --- | --- |
| 基础目录 | `items.csv`：`id`、`identifier`、`category_id`、`cost`、`fling_power`、`fling_effect_id` | `cost` 是上游价格，不直接作为本作售价 |
| 名称、效果与版本描述 | `item_names.csv`、`item_prose.csv`、`item_flavor_text.csv` | 分开保留语言、版本和文本种类；无文本时标记缺失 |
| 用途分类 | `item_categories.csv → item_pockets.csv` | 原作 key 口袋指剧情／功能重要物品，不代表稀有养成道具 |
| 使用标记 | `item_flags.csv`、`item_flag_map.csv` | 提供上游使用标记，仍需本作规则决定是否启用 |
| 技能机 | `machines.csv`：`version_group_id`、`machine_number`、`item_id`、`move_id` | 与选定版本的招式、学习表共同整理 |
| 树果 | `berries.csv`：`id`、`item_id`、`firmness_id`、`natural_gift_power`、`natural_gift_type_id`、`size`、`max_harvest`、`growth_time`、`soil_dryness`、`smoothness` | 原作种植字段不是本作已确认的挂机时长和产量 |
| 树果口味与硬度 | `berry_flavors.csv`、`berry_firmness.csv`、`berry_firmness_names.csv` | 口味表有 320 行，不能据此认为 68 条树果均有全部口味数据 |

68 条树果中，`max_harvest` 和 `growth_time` 各有 66 条非空；`firmness_id`、`size`、`soil_dryness`、`smoothness` 各有 64 条非空；`natural_gift_power` 有 67 条，`natural_gift_type_id` 有 66 条。需要逐项处理空值，不能统一补成 0。

## 3 需要单独处理的树果记录

| 树果 ID | 道具 ID | 标识 | 实际问题 |
| --- | --- | --- | --- |
| 67 | 2278 | `hopo-berry` | 无简中名称、效果与中文描述；大部分种植字段为空 |
| 68 | 2279 | `roseli-berry` | 无简中名称、效果与中文描述；种植字段为空 |

`items.csv` 另有道具 **723**，标识同为 `roseli-berry`，已有中文名“洛玫果”；它没有被上述树果记录关联。两个 ID 的价格也不同。本次保留原始数据，未擅自合并、覆盖或补译。后续整理目录时需要核对这一身份关联，不能按 `identifier` 无条件去重，也不能直接复制另一个 ID 的全部字段。

## 4 缺少简中名称的 49 条道具

以下均为上游道具 ID，不是本作物品 ID。缺失多集中于旧作信件和剧情物品，不意味着首批开放内容一定会缺少 49 个名称。

| ID | 标识 |
| --- | --- |
| 114–125 | `grass-mail`、`flame-mail`、`bubble-mail`、`bloom-mail`、`tunnel-mail`、`steel-mail`、`heart-mail`、`snow-mail`、`space-mail`、`air-mail`、`mosaic-mail`、`brick-mail`，按 ID 递增对应 |
| 404、427 | `hm08`、`bicycle` |
| 515–526 | `orange-mail`、`harbor-mail`、`glitter-mail`、`mech-mail`、`wood-mail`、`wave-mail`、`bead-mail`、`shadow-mail`、`tropic-mail`、`dream-mail`、`fab-mail`、`retro-mail`，按 ID 递增对应 |
| 530、532 | `devon-goods`、`pokeblock-case` |
| 538、539、540、541 | `rm-1-key`、`rm-2-key`、`rm-4-key`、`rm-6-key` |
| 543、545、549 | `oaks-parcel`、`bike-voucher`、`fame-checker` |
| 551、552、553、554 | `berry-pouch`、`teachy-tv`、`tri-pass`、`rainbow-pass` |
| 556、557、558 | `mysticticket`、`auroraticket`、`powder-jar` |
| 559、560、561、562 | `ruby`、`sapphire`、`magma-emblem`、`old-sea-map` |
| 663、2278、2279 | `god-stone`、`hopo-berry`、`roseli-berry` |

## 5 对本作与视觉 Demo 的影响

已确认：百货公司拆分“探索道具”和“重要道具”页签；这里的重要道具指**进化道具、携带物和技能机**。它与原作背包的“重要物品”口袋含义不同，不能直接照搬该口袋作为筛选条件。

当前 H5 只展示两类各 8 件固定样例，沿用通用图标。商品、价格、刷新时间均为视觉占位，不执行购买，也不代表这些道具已全部完成配置。

后续真正接入时还需完成：

1. 确定本作开放名单与规则版本，整理可用道具和树果目录，保留上游 ID 与来源。
2. 补齐开放名单中的中文效果文案、缺名与身份关联；明确历史描述适用的版本。
3. 为开放名单采集或生成独立物品图标，记录路径和来源。
4. 单独配置本作价格、刷新、掉落、奖励、技能机获取以及果园生长和产量；这些数值不能由原始表代替设计决定。

本地来源版本与完整数据入口见 [基础数据说明](../data/README.md)；整体素材、UI 与配置规划见 [模块实施准备稿](module-assets-ui-schema.md)。
