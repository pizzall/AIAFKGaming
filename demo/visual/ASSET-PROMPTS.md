# 视觉 Demo 位图素材记录

生成方式：内置 ImageGen。所有选用输出已复制到本 Demo；图片不依赖生成工具的缓存路径。宝可梦像素图来自项目现有固定快照，来源说明见 [data/README.md](../../data/README.md)。

## 路线背景

文件：`assets/scenes/route.png`；非透明背景。原始输出完整保留，没有裁切或改色。

```text
Create a single beautiful high-quality pixel-art landscape background asset for a Pokemon-inspired GBA/Nintendo DS era idle adventure game UI. Wide 16:9 landscape, ideally 1920x1080. A top-down/isometric pixel game route at the edge of a small peaceful town: mint-green grass, a winding cream dirt path running from lower left toward upper right, small pond with sparkling aqua water on the right, layered forest on upper edges, a small red-roof research building at upper left, tiny flowers, wooden signposts, subtle tile texture. Daylight, nostalgic handheld console pixel art, crisp deliberate pixels, limited refined palette of deep teal, sage, cream, muted coral and turquoise. Clean and cohesive professionally made game environment, not a screenshot of an existing game. NO characters, NO Pokemon, NO text, NO typography, NO logos, NO UI, NO borders, NO grids or labels. Keep the middle area visually calm so real UI text and sprites can be overlaid separately. Return only the landscape bitmap asset.
```

## 宝可梦蛋

文件：`assets/icons/egg.png`；请求透明背景。

```text
A single small Pokemon-inspired monster egg inventory icon, ivory white egg with three sage green oval patches, crisp GBA Nintendo DS era pixel art, 3/4 view, subtle darker pixel outline and small shadow, centered isolated object occupying 65 percent of a square canvas, limited pastel palette, genuine transparent background. No text, no letters, no labels, no border, no ground, no extra objects.
```

## 精灵球

文件：`assets/icons/ball.png`；请求透明背景。

```text
A single classic red and ivory monster-catching ball inventory icon inspired by Pokemon GBA Nintendo DS pixel art, black dividing band and central pale button, crisp deliberate pixels, subtle darker pixel outline, centered isolated object occupying 65 percent of a square canvas, limited palette. Genuine transparent background. No text, no letters, no labels, no border, no ground, no extra objects.
```

## 旅行背包

文件：`assets/icons/bag.png`；请求透明背景。

```text
A single nostalgic green-teal trainer travel backpack inventory icon inspired by GBA Nintendo DS Pokemon game pixel art, small cream pocket and tan straps, crisp deliberate pixel clusters, dark teal outline, centered isolated object occupying 65 percent of a square canvas. Genuine transparent background. No text, no letters, no labels, no border, no ground, no extra objects.
```

## 联盟徽章

文件：`assets/icons/badge.png`；请求透明背景。

```text
A single gold gym adventure badge collectible icon inspired by GBA Nintendo DS Pokemon game pixel art. A small octagonal gold badge with emerald center, simple clean silhouette, crisp deliberate pixels with dark teal outline and limited gold cream mint palette, centered isolated object occupying 65 percent of square canvas. Genuine transparent background. No text, no letters, no labels, no border, no ground, no extra objects.
```

## 普通面板皮肤

`assets/ui/` 中的 8×8 PNG 是程序生成的独立纯色填充，只用于普通面板与按钮底色，不承担插画或图标职责。文字、边框与布局保留在 HTML/CSS，便于以后更换像素皮肤。

2026-11-14 按用户要求改为红白主题，重新生成普通纯色填充：`nav` 为 `#c83e4d`、`white` 为 `#ffffff`、`paper` 为 `#faf7f7`、`soft` 为 `#f1e9ec`、`mint` 为 `#fbecef`、`ink` 为 `#44353b`、`gold` 为 `#fff0cc`、`coral` 为 `#f2b8c2`、`sky` 为 `#edf2f5`。保留原文件名以复用绑定。已有 ImageGen 插画和宝可梦原图没有改色。

## 产业与果树补充素材

生成方式仍为内置 ImageGen，均请求透明背景。以下公共提示词中的 `{subject}` 分别替换为表中完整文本；每项单独生成一张位图，没有切分图集或重绘已有宝可梦素材。

```text
A single isolated game inventory or facility illustration: {subject}. Nostalgic Pokemon GBA/Nintendo DS era pixel art with crisp deliberate square pixel clusters and a clean dark teal outline. Warm cream, sage green, teal and muted coral palette consistent with a cozy handheld RPG. 3/4 top-down view, centered object occupies about 70 percent of a square canvas. Genuinely transparent background. No characters, no Pokemon, no text, no letters, no labels, no UI, no surrounding scenery, no frame. One asset only.
```

| 文件 | subject |
| --- | --- |
| `assets/icons/mine.png` | a small rocky mining entrance with timber supports, a tiny mine cart filled with gray ore, and two warm sandstone boulders |
| `assets/icons/lumber.png` | a small woodland lumber station with neatly stacked cut logs, a simple wooden awning and two leafy saplings |
| `assets/icons/workshop.png` | a small friendly mint-green and cream town workshop building with a coral roof, a tiny wooden workbench and a sign with no writing |
| `assets/icons/berrytree.png` | a single cheerful small orchard berry tree, rounded layered sage and emerald green leaves, several bright blue and orange berries among leaves, short warm brown trunk and a tiny patch of grass |
