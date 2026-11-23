# 功能 H5 像素美术

2026-11-14，按用户要求用内置 `image_gen` 生成，未使用 API/CLI 生成脚本。文件已复制到项目中，原始输出保留不动。图标通过 CSS 的4×4 atlas 定位使用，没有运行时绘图或裁切脚本。

| 项目内文件 | 实际尺寸 | 内容 | 用途 |
| --- | --- | --- | --- |
| module-atlas.png | 1254×1254 RGBA | 16个模块/设施图标 | 十个导航模块、页首、中心、矿山、木场、资源等 |
| item-atlas.png | 1254×1254 RGBA | 16个道具/资源图标 | 商店、库存、探索补给、蛋位和钱包 |
| adventure-village.png | 2172×724 RGB | 像素村庄全景 | 登录页与冒险总览场景 |

module-atlas 按行依次：总览/队伍/探索/产业；育成/果园/百货/道馆；日志/终端/中心/金钱；矿山/木场/精灵球/技能。

item-atlas 按行依次：精灵球/超级球/高级球/伤药；橙橙果/文柚果/吃剩的东西/生命宝珠；气势披带/喷火龙进化石Y/木材/矿石；训练点/金币/技能机/蛋。未知物品使用通用购物袋，不把未知物品画成精灵球。

这些是本项目的风格化 UI 素材，不作为官方原版图标或精确官方道具立绘。宝可梦个体精灵图仍使用既有来源素材。

## 生成提示词

以下为最终使用的三个生成提示词。两个 atlas 请求透明背景，场景请求不透明背景；未使用参考图或图像编辑。

### module-atlas.png

Use case: stylized-concept. Asset: a single transparent game UI sprite atlas for a red and white Pokemon AFK H5 game. Create exactly 16 separate polished GBA/DS-era pixel-art icons arranged in an absolutely regular 4 by 4 grid on a 1024x1024 transparent canvas; each cell exactly 256x256 pixels. Center each icon at its cell center with 40px clear padding on all sides. No labels, no text, no numbers, no borders, no shadows outside cells. Clean crisp square pixels, rich 16-bit shading, dark plum outlines, warm red and cream highlights, friendly original handheld game menu style. All icons same visual weight, isolated with genuine transparent backgrounds. In reading order, row1: a red handheld Pokedex with tiny map screen (overview), three red-white monster balls on a party tray (team), a forest route sign with green grass and a compass (explore), a golden gear with hammer and small workshop roof (industry). Row2: cream egg with green spots in red incubator (nursery), lush berry tree with red and blue fruit (orchard), red-white department store shopping bag (shop), gold and silver eight-point gym badge with red ribbon (gyms). Row3: open adventurer journal with feather and bookmark (logs), green monochrome handheld command terminal (test console), red-roof healing center with small heart sign (recovery), three shiny gold game currency coins (money). Row4: mining pickaxe and lavender crystals (mine), wood logs and a teal axe (lumber), iconic red and white capture ball (ball), a glossy blue technical-machine disc (skills). Do not merge cells. The output is a usable sprite sheet, not a mockup.

### adventure-village.png

Use case: stylized-concept. Asset: panoramic pixel-art background illustration for the adventure overview of a Pokemon idle H5 game. Wide landscape 1920 by 640 composition, no text, no UI, no borders. Authentic charming GBA/DS 16-bit overworld pixel art, crisp square pixels and carefully clustered limited colors. A peaceful monster-training village beside a forest route at warm late-afternoon sunlight. Red-roof white healing center and cream cottages on the right, green tall grass and a winding stone walking route, low wooden fence, berries and a distant small gym with red pennants. Tiny familiar Pikachu and Bulbasaur standing on the grass at the lower-right; no oversized characters. Keep the left third visually calm and low-detail with pale warm sky and a light green meadow, suitable for dark foreground page text. Trees frame the upper-right and foreground corners, soft distant mountains. The palette connects to a red-and-white interface: warm ivory sky, coral red roofs, sage and emerald greens, warm golden sun. Highly polished handcrafted handheld-RPG background; friendly, nostalgic, readable at a shallow wide crop. Avoid photorealism, smooth vector art, 3D rendering, detailed noisy outlines, typography, or logos.

### item-atlas.png

Use case: stylized-concept. Asset: transparent 16-icon inventory sprite atlas for a red-and-white Pokemon GBA/DS style H5 idle RPG. Exactly 4 columns and 4 rows of equally sized square cells on a square 1024x1024 PNG, each cell 256x256. Every object centered in its cell, clear 45-pixel gutters on all sides, genuine transparent background, no text or labels or grid. Crisp colorful 16-bit pixel art, consistent dark plum outlines, small sharp stepped highlights and 3 shade clusters, pleasing readable silhouettes, same scale and lighting. Row1 from left to right: standard red-white Poke Ball, blue/red Great Ball, black/yellow Ultra Ball, small purple Potion spray bottle. Row2: blue Oran Berry with pale seed bumps, yellow-green Sitrus Berry, Leftovers apple core, glowing magenta Life Orb. Row3: red Focus Sash rolled like a martial-arts belt, Charizardite Y orange translucent Mega stone with a yellow flame swirled core, stacked cut timber logs, purple iron ore chunks. Row4: a silver-and-gold training-point medallion, three gold currency coins with a simple center sparkle, a light-blue technical-machine CD disc, small warm golden egg with green spots. Maintain separate icon cells; these are inventory art objects, no settings or screenshots. No colored background squares, no floating detached decorations, no words. Real transparency.
