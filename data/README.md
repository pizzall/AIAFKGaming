# 宝可梦基础数据与图片快照

采集日期：2026-11-14。来源为 [PokéAPI 数据仓库](https://github.com/PokeAPI/pokeapi)和 [PokéAPI 图片仓库](https://github.com/PokeAPI/sprites)。

本目录保存上游基础资料，不选择本作战斗规则版本，也不替代 `docs/game-data.md` 中的游戏配置。上游已收录内容不等于本作全部开放内容。

## 当前覆盖

| 内容 | 数量 |
| --- | ---: |
| 全国图鉴物种 | 1,025 |
| 宝可梦记录，含地区、Mega 等具有独立数据的形态 | 1,351 |
| 外观／形态记录，含未知图腾、花纹等 | 1,579 |
| 上游原始 CSV 表 | 187 |
| PNG 图片 | 8,532 |

1,025 个物种都有简体中文名，其默认形态均有大立绘、像素正面图和背面图。小图以第五世代像素风格为基准，新世代包含社区补全素材；出处见 `sources/SPRITES-README.md` 和 `sources/SPRITES-CONTRIBUTING_SPRITES.md`。

按独立宝可梦记录统计，4 条缺立绘，9 条缺像素正面／背面图。按更细的形态记录统计，45 条没有独立立绘，49 条没有独立像素正面／背面图。后两项包含部分共用外观但上游没有单独文件的形态。缺少独立图片时索引保存 `null`，不会自动替换成另一形态。

201 条具有形态标识的记录没有上游简体中文形态标签；物种中文名仍可用。未自行翻译或把英文标签冒充中文。

完整名单与统计见 [coverage-report.json](coverage-report.json)。这份报告描述上游覆盖；[download-report.json](download-report.json) 描述本地文件是否下载成功，两者须分开判断。

## 使用入口

| 文件／目录 | 用途 |
| --- | --- |
| [species.json](species.json) | 物种编号、多语言名称、中文分类与图鉴描述、世代、蛋组、性别比例、捕获率、成长组、进化条件等 |
| [pokemon.json](pokemon.json) | 每种数据形态的属性、六项种族值、努力值产出、普通／隐藏特性、身高体重、图片路径和形态关联 |
| [forms.json](forms.json) | 外观形态、中文形态标签、战斗／Mega 标记、属性覆盖与对应图片 |
| `raw/pokeapi/` | 187 张未改写的上游表，包括全部招式、学习表、特性、道具、进化、属性相克、性格和经验表 |
| `../assets/pokemon/artwork/` | 大立绘；保留该上游目录中的普通配色图片、雌性及历史立绘文件，不含异色大立绘 |
| `../assets/pokemon/front/` | 像素正面图，`shiny/` 为异色，`female/` 为雌性差异 |
| `../assets/pokemon/back/` | 像素背面图，包含对应的异色及雌性差异子目录 |
| [download-manifest.json](download-manifest.json) | 每个下载文件的原始 URL、字节数、Git blob SHA-1 和本地路径 |
| `sources/` | 固定提交版本、上游文件树、原始署名与许可说明，以及抽查用的 API 形态样本 |

图片路径均相对于项目根目录。没有统一拉伸、裁切或重采样，使用时保留原图长宽比；像素图放大时使用最近邻采样。大立绘通常为 475×475，小图通常为 96×96，具体尺寸以 `download-report.json` 为准。未采集 HOME 3D 渲染、动态 GIF 或每一代游戏的全部素材。

### 编号与字段含义

- `species.id` 为物种 ID，`pokemon.id` 为宝可梦数据记录 ID，`forms.id` 为外观形态 ID，三者不能混用。
- `pokemon.species_id` 关联物种，`forms.pokemon_id` 关联宝可梦记录，`pokemon.form_ids` 列出其全部外观形态。
- 例如，`pokemon.id = 10001` 是攻击形态代欧奇希斯，`forms.id = 10001` 是未知图腾 B；图片分别为 `front/10001.png` 与 `front/201-b.png`。
- `height_dm` 单位是分米，`weight_hg` 单位是百克。`gender_rate` 保留上游定义：雌性概率以八分之一计，`-1` 代表无性别。
- `hatch_counter` 是原作孵化周期计数，不是本作孵化秒数；`capture_rate` 也不是直接可用的捕获概率。
- CSV 空字段转换为 JSON `null`，不会解释为 `0`。形态中文标签缺失时保留 `null`。
- `pokemon.name_zh_hans` 是物种中文名；区分形态应结合 `forms` 中的标签和 `identifier`，不能只按中文物种名分组。
- `evolution_rules_as_target` 保存进化到该物种的上游规则，包含版本字段；特殊形态条件需要继续读取对应的形态表。
- `introduced_in_version_group_id` 等上游版本字段原样保留；历史招式、特性、属性和进化差异不能未经选择就混入单一战斗规则。

### 后续接入常用表

| 需求 | 原始表 |
| --- | --- |
| 招式定义与中文名 | `moves.csv`、`move_names.csv`、`move_meta.csv`、`move_effect_prose.csv` |
| 按版本／等级／学习方式查询招式 | `pokemon_moves.csv`、`pokemon_move_methods.csv`、`version_groups.csv` |
| 特性与中文说明 | `abilities.csv`、`ability_names.csv`、`ability_flavor_text.csv`、`ability_prose.csv` |
| 进化与形态变更 | `pokemon_evolution.csv`、`evolution_chains.csv`、`pokemon_form_conditions.csv` |
| 道具与携带物 | `items.csv`、`item_names.csv`、`pokemon_items.csv`、`item_prose.csv` |
| 性格、经验、属性相克 | `natures.csv`、`nature_names.csv`、`experience.csv`、`growth_rates.csv`、`type_efficacy.csv` |

学习表、效果描述、翻译与新形态的上游覆盖不一定相同。这里保留来源数据，不将文字效果描述视为已实现的战斗逻辑。

## 复现与检查

在项目根目录运行；Python 3 标准库即可，无需安装依赖。

```powershell
python scripts/download_pokemon_data.py
python scripts/build_pokemon_index.py
python scripts/download_pokemon_data.py --verify
python scripts/verify_pokemon_data.py
```

下载命令读取已保存的上游清单，固定到下列提交；已存在且哈希正确的文件会跳过，失败可重跑。`--verify` 不访问网络，检查所有文件字节数、Git blob SHA-1 与 PNG 分块 CRC。索引校验另外核对编号、物种关系、种族值、图片引用和缺图报告。

原始异色图 `assets/pokemon/front/shiny/10035.png` 的 PNG 结束标记后有两个零字节；已核实上游哈希一致、像素解码正常，按原字节保留。校验器允许末尾的纯零填充，仍拒绝 CRC 错误、截断或非零尾随内容。

- 数据提交：`8a92bfa7dab2f12b84b5d151562f9857c133ff30`，2026-11-12。
- 图片提交：`c0542f7c51215d9672439012838c99f520596cbd`，2026-11-13。

脚本不会自动升级快照。更新时需重新获取相互对应的上游版本和文件树，再重新生成清单、下载并校验。`sources/api-examples/` 是采集时的映射抽查样本，不参与构建或代替固定版本清单。
