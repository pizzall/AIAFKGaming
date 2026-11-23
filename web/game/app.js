import {battleLines, battleOutcome, displayName, findSpecies, statNames} from './display.js?v=6';
import {closeEvolution, playEvolution} from './evolution.js?v=6';
const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[char]);
const pages = {
  overview: '冒险总览',
  team: '伙伴与编队',
  explore: '地区探索',
  industry: '产业经营',
  nursery: '育成屋',
  orchard: '果园',
  shop: '仓库与百货',
  gyms: '道馆',
  logs: '重要日志',
  console: '测试指令'
};
const moduleInfo = {
  overview: ['冒险手记', '旅途中的收获、伙伴与下一份期待，都在这里。'],
  team: ['伙伴档案', '每一位伙伴，都有独一无二的成长故事。'],
  explore: ['野外探索', '选一条路线，让伙伴带回新的发现。'],
  industry: ['训练家工坊', '找到合适的岗位，让每一位伙伴都发光。'],
  nursery: ['培育与孵化', '从一枚小小的蛋，等待一段新的相遇。'],
  orchard: ['树果花园', '种下今天的树果，收获往后的日常。'],
  shop: ['物资仓库', '管理收藏物资，为出发和下一次成长做好准备。'],
  gyms: ['道馆挑战', '六位伙伴并肩上场，争取属于你的道馆徽章。'],
  logs: ['旅途记录', '重要的相遇与成长，值得好好记住。'],
  console: ['测试终端', '在联调环境中，快速检查每一段成长。']
};
const iconNames = [
  'overview',
  'team',
  'explore',
  'industry',
  'nursery',
  'orchard',
  'shop',
  'gyms',
  'logs',
  'console',
  'recovery',
  'money',
  'mine',
  'lumber',
  'ball',
  'skill'
];
const itemNames = [
  'pokeball',
  'greatball',
  'ultraball',
  'potion',
  'oranberry',
  'sitrusberry',
  'leftovers',
  'lifeorb',
  'focussash',
  'charizarditey',
  'wood',
  'ore',
  'training',
  'money',
  'tm',
  'egg'
];
function sprite(index, className, size = '') {
  return `<span class="${className} ${size}" style="--x:${((index % 4) * 100) / 3}%;--y:${(Math.floor(index / 4) * 100) / 3}%" aria-hidden="true"></span>`;
}
const icon = (key, size = '') => sprite(Math.max(0, iconNames.indexOf(key)), 'pixel-icon', size);
function itemIcon(key, size = '') {
  const index = itemNames.indexOf(key);
  return index < 0 ? icon('shop', size) : sprite(index, 'item-icon', size);
}
const sectionTitle = (key, title, detail = '') =>
  `<div class="section-title">${icon(key)}<div><h2>${title}</h2>${detail ? `<p>${detail}</p>` : ''}</div></div>`;
function moduleIntro(key, title, description, tag = '') {
  return `<div class="module-intro">${icon(key, 'large')}<div><small>${moduleInfo[page][0]}</small><h2>${title}</h2><p>${description}</p></div>${tag ? `<span class="chip">${tag}</span>` : ''}</div>`;
}
const duration = (seconds) =>
  seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分${seconds % 60 ? `${seconds % 60} 秒` : '钟'}`;
let state,
  page = 'overview',
  detailId,
  busy = false,
  refreshing = false,
  clockReceivedAt = 0,
  activeReport = null;
let draftTeam = null,
  draftTactic = null,
  shopTab = 'explore',
  rosterPage = 0,
  toastTimer;
const consoleLines = [];
let accountEpoch = 0;
let authBusy = false;
let speedDraft = null,
  consoleDraft = '';
let pickerDrafts = {},
  nicknameDrafts = {},
  explorePresetId = '',
  exploreRegion = '';
let draftSupplies = Array(6).fill(null),
  bagEditingSlot = null,
  bagResource = '',
  bagQuantityDraft = null;
let warehouseTab = 'warehouse',
  warehouseItem = null,
  warehouseMode = 'item-use',
  warehouseQuery = '';
let moveDetailKey = '',
  moveDetailPartner = null;
let catalog = null,
  draftPresetId = null,
  draftPresetName = null,
  draftWishlist = null,
  wishlistQuery = '';
const button = (text, action, extra = '', style = '') => `<button data-action="${action}" ${extra} class="${style}">${text}</button>`;
const zh = (kind, value) => displayName(catalog?.names, kind, value);
const nameOf = (key) => state?.config.resources[key]?.name ?? zh('items', key);
const genderName = (value) => ({M: '雄性', F: '雌性', N: '无性别'})[value] ?? '无性别';
const partnerName = (p) => p.nickname || p.name;
const partnerCode = (p) => `个体 ${p.id.split(':').at(-1).padStart(4, '0')}`;
const keyOf = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const evolutionStones = [
  'firestone',
  'waterstone',
  'thunderstone',
  'leafstone',
  'icestone',
  'sunstone',
  'moonstone',
  'dawnstone',
  'duskstone',
  'shinystone'
];
const date = (value) => new Date(value).toLocaleString('zh-CN', {hour12: false});
const deadline = (at) => `<span data-deadline="${at}"></span>`;
function displayClock() {
  const elapsed = Math.max(0, performance.now() - clockReceivedAt);
  const rate = state.clock?.rate ?? 1;
  return {
    gameTime: state.serverTime + elapsed * rate,
    realTime: (state.clock?.realTime ?? state.serverTime - state.clockOffset) + elapsed,
    rate
  };
}
function pickerBlock(p, config) {
  if (config.mode === 'explore' && state.battles.some((b) => ['queued', 'running'].includes(b.status)) && state.team.includes(p.id))
    return '比赛中';
  const activity = role(p.id);
  if (config.facility && state.facilities.find((f) => f.key === config.facility)?.workers.includes(p.id)) return '';
  if (activity !== '空闲' && !(config.mode === 'explore' && activity === '备战中')) return activity;
  if (config.mode === 'item-use') {
    const resource = state.config.resources[config.resource];
    if (resource?.kind === 'machine') {
      if (!p.machineMoves.includes(resource.move)) return '无法学习';
      if (p.learnedMoves.some((move) => keyOf(move) === resource.move)) return '已经掌握';
    } else if (resource?.healHp || resource?.healFraction) {
      if (p.hp <= 0) return '已经倒下';
      if (p.hp >= p.maxHp) return '体力已满';
    } else if (evolutionStones.includes(config.resource) && !p.evolutions.some((e) => keyOf(e.item) === config.resource))
      return '无法使用此进化石';
  }
  return '';
}
function pickerConfig(node) {
  const d = node.dataset;
  return {
    key: d.picker,
    name: d.field,
    title: d.title,
    min: Number(d.min),
    max: Number(d.max),
    mode: d.mode,
    resource: d.resource,
    facility: d.facility,
    readOnly: d.locked === 'true',
    initial: JSON.parse(d.initial)
  };
}
function pickerTiles(config, ids, query = '') {
  const matches = state.pokemon.filter((p) => `${partnerName(p)} ${p.name} ${partnerCode(p)}`.includes(query.trim()));
  return (
    matches
      .map((p) => {
        const selected = ids.includes(p.id),
          blocked = pickerBlock(p, config);
        const full = config.max > 1 && ids.length >= config.max && !selected;
        const disabled = config.readOnly || (!selected && (!!blocked || full));
        const status = blocked || (selected ? '已选择' : full ? '名额已满' : '点击加入');
        return `<button type="button" class="pick-tile ${selected ? 'chosen' : ''} ${blocked ? 'unavailable' : ''}" data-action="picker-toggle" data-id="${escape(p.id)}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''} aria-label="${escape(partnerName(p))}，${escape(partnerCode(p))}，${p.level}级，${selected && !config.readOnly ? '点击移除' : status}">
      <span class="pick-check">${selected ? '✓' : '+'}</span><span class="pick-number">${escape(partnerCode(p))}</span>
      <span class="pick-image">${p.image ? `<img src="/${escape(p.image)}" alt="">` : ''}</span><strong>${escape(partnerName(p))}</strong>
      <span class="pick-species">${escape(p.name)} · ${p.level}级 · ${genderName(p.gender)}</span><span class="pick-hp">体力 ${p.hp} / ${p.maxHp}</span>
      <span class="pick-status">${escape(status)}${selected && !config.readOnly ? ' · 点击移除' : ''}</span></button>`;
      })
      .join('') || '<p class="pick-no-match">没有匹配的伙伴，试试昵称、物种名或个体编号。</p>'
  );
}
function partnerPicker(config) {
  const {key, name, title, min = 0, max = 6, mode = '', resource = '', facility = '', readOnly = false, initial = []} = config;
  const draft = (pickerDrafts[key] ??= {ids: [...initial], query: ''});
  const ids = readOnly ? initial : draft.ids;
  const selected = ids.map((id) => state.pokemon.find((p) => p.id === id)).filter(Boolean);
  const blocked = selected.filter((p) => pickerBlock(p, config));
  return `<section class="partner-picker" data-picker="${key}" data-field="${name}" data-title="${escape(title)}" data-min="${min}" data-max="${max}" data-mode="${mode}" data-resource="${escape(resource)}" data-facility="${facility}" data-locked="${readOnly}" data-initial="${escape(JSON.stringify(initial))}">
    <div class="row pick-heading"><h3>${escape(title)}</h3><span>已选 <b>${ids.length}</b> / ${max} 位</span>${!readOnly ? button('清空选择', 'picker-clear', 'type="button"', 'small secondary') : '<span class="chip">预设成员</span>'}</div>
    <p class="pick-help">${readOnly ? '使用保存预设的完整成员；切换为手动选择后可自行增删。' : `点击方块加入，再次点击移除；${min ? `需选择${min === max ? min : `${min}–${max}`}位` : '可不安排成员'}。尚未提交，不会占用伙伴。`}</p>
    <div class="pick-selected">${selected.map((p, i) => `<div class="pick-slot ${pickerBlock(p, config) ? 'conflict' : ''}">${p.image ? `<img src="/${escape(p.image)}" alt="">` : ''}<span><small>${i + 1} · ${escape(partnerCode(p))}</small><b>${escape(partnerName(p))}</b><small>${escape(p.name)} · ${p.level}级</small></span>${!readOnly ? button('×', 'picker-remove', `type="button" data-id="${escape(p.id)}" aria-label="移除${escape(partnerName(p))}"`, 'quiet') : ''}</div>`).join('') || '<div class="pick-empty">尚未选择伙伴</div>'}</div>
    ${blocked.length ? `<div class="notice">暂不能提交：${blocked.map((p) => `${escape(partnerName(p))}（${pickerBlock(p, config)}）`).join('、')}。请移除或先结束对应活动。</div>` : ''}
    <label class="pick-search">查找伙伴<input type="search" data-picker-search placeholder="昵称 / 物种名 / 个体编号" value="${escape(draft.query)}" autocomplete="off"></label>
    <div class="pick-pool">${pickerTiles({...config, max, readOnly}, ids, draft.query)}</div>
    ${ids.map((id) => `<input type="hidden" name="${name}" value="${escape(id)}">`).join('')}</section>`;
}

async function api(path, data) {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(data)
        }
  );
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || '请求失败');
    error.status = response.status;
    throw error;
  }
  return result;
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
  }, 4500);
}
function clearAccount() {
  accountEpoch++;
  closeEvolution();
  state = null;
  activeReport = null;
  detailId = null;
  draftTeam = null;
  draftTactic = null;
  draftPresetId = null;
  draftPresetName = null;
  draftWishlist = null;
  wishlistQuery = '';
  page = 'overview';
  shopTab = 'explore';
  rosterPage = 0;
  clockReceivedAt = 0;
  speedDraft = null;
  consoleDraft = '';
  pickerDrafts = {};
  nicknameDrafts = {};
  explorePresetId = '';
  exploreRegion = '';
  draftSupplies = Array(6).fill(null);
  bagEditingSlot = null;
  bagResource = '';
  bagQuantityDraft = null;
  warehouseTab = 'warehouse';
  warehouseItem = null;
  warehouseMode = 'item-use';
  warehouseQuery = '';
  moveDetailKey = '';
  moveDetailPartner = null;
  busy = false;
  refreshing = false;
  consoleLines.length = 0;
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
  $('#content').replaceChildren();
  $('#wallet').replaceChildren();
  $('#account-label').textContent = '';
  delete document.body.dataset.page;
  $('#auth').hidden = false;
  $('#game').hidden = true;
  $('#refresh').hidden = true;
  $('#refresh').disabled = false;
  $('#game').removeAttribute('aria-busy');
  $('#logout').hidden = true;
}
function role(id) {
  return state.pokemon.find((partner) => partner.id === id)?.activity ?? '空闲';
}
function editedPreset() {
  if (draftPresetId === 'new') return {id: null, name: '新编队', team: [], tactic: ''};
  return (
    state.presets.find((preset) => preset.id === draftPresetId) ??
    state.presets.find((preset) => preset.id === state.readyPresetId) ??
    state.presets[0]
  );
}
function selectPreset(id) {
  draftPresetId = id;
  draftPresetName = null;
  draftTeam = null;
  draftTactic = null;
}
function card(p, selectable = false) {
  const selected = (selectable ? (draftTeam ?? editedPreset().team) : state.team).includes(p.id);
  const locked = selectable && !!editedPreset().id && editedPreset().id === state.readyPresetId;
  const gender = p.gender === 'M' ? '♂' : p.gender === 'F' ? '♀' : '—';
  return `<div class="partner ${selected ? 'selected' : ''}"><div class="partner-top"><span class="partner-level">${p.level}级</span><span class="role-tag" data-role="${role(p.id)}">${role(p.id)}</span></div>
    <div class="sprite-stage">${p.image ? `<img src="/${escape(p.image)}" alt="${escape(partnerName(p))}">` : ''}</div>
    <strong>${escape(partnerName(p))} <span class="gender">${gender}</span></strong><p class="partner-identity">${escape(p.name)} · ${escape(partnerCode(p))}</p><p class="partner-hp">探索体力 <b>${p.hp}<span> / ${p.maxHp}</span></b></p>
    <div class="progress"><span style="width:${(100 * p.hp) / p.maxHp}%"></span></div><div class="actions">
      ${button('档案', 'detail', `data-id="${escape(p.id)}"`, 'small secondary')}
      ${selectable ? button(selected ? '移出预设' : '加入预设', 'toggle-team', `data-id="${escape(p.id)}" ${locked ? 'disabled' : ''}`, 'small secondary') : ''}</div></div>`;
}
function logs() {
  return `<div class="panel logs">${sectionTitle('logs', '冒险手记', '记下旅途中那些值得期待的时刻')}${[...state.logs]
    .reverse()
    .map((log) => `<div class="log"><time>${date(log.at)}</time>${escape(log.message)}</div>`)
    .join('')}</div>`;
}
function overview() {
  const e = state.exploration;
  return `<section class="adventure-hero"><div class="hero-copy"><span class="eyebrow"><i></i> ${e ? '旅途正在继续' : '新的旅途，正在等你'}</span><h2>把冒险，<br>交给下一次相见。</h2>
    <p>${e ? `正在探索${state.config.regions.find((r) => r.key === e.region)?.name}，期待下一份发现。` : '和伙伴一起出发，让每次归来都有新的收获。'}</p>${button(e ? '查看探索进度 ↗' : '开启下一段探索 ↗', 'page', 'data-page="explore"')}</div><span class="hero-caption">每天，都有一段小小的冒险。</span></section>
    <div class="grid overview-stats"><div class="panel metric-card">${icon('explore', 'large')}<div><h2>探索旅途</h2><div class="metric">${e ? '进行中' : '待出发'}</div>
    <p>${e ? `${state.config.regions.find((r) => r.key === e.region)?.name} · ${e.summary.wins} 胜 / ${e.summary.losses} 次战败` : '选择地区、伙伴和心愿目标，开启离线探索。'}</p>
    ${e ? `<p>下一次推进 ${deadline(e.recoveryUntil ?? e.cursor + state.config.encounterSeconds * 1000)}</p>` : ''}
    </div></div>
    <div class="panel metric-card">${icon('team', 'large')}<div><h2>伙伴与收藏</h2><div class="metric">${state.pokemon.length}<small>位伙伴</small></div><p>已记录 ${new Set(state.pokemon.map((p) => p.species)).size} 种宝可梦</p></div></div>
    <div class="panel metric-card">${icon('gyms', 'large')}<div><h2>道馆与荣誉</h2><div class="metric">${state.gyms.filter((g) => g.ownerId === state.id).length}<small>/ 8 席位</small></div>
      <p>历史道馆荣誉 ${state.honors.length} 枚 · 第 ${state.season} 赛季</p></div></div></div>
    <div class="panel"><div class="row">${sectionTitle('team', state.readyPresetId ? '备战中的伙伴' : '最近使用的队伍', state.readyPresetId ? '成员已预留，取消备战后可安排工作' : '保存预设后可选择进入备战')}${button('管理编队 ↗', 'page', 'data-page="team"', 'small secondary')}</div><div class="roster">${state.team.map((id) => card(state.pokemon.find((p) => p.id === id))).join('')}</div></div>
    ${logs()}`;
}
function moveDetails(value) {
  const m = catalog.moves[keyOf(value)];
  if (!m) return '<div class="move-details-empty">选择一个招式，查看它的详细数据。</div>';
  return `<article class="move-data" data-move-key="${m.key}"><div class="row"><div><small>招式资料</small><h4>${escape(m.name)}</h4></div><span class="move-type">${escape(m.type)} · ${m.category}</span></div><div class="move-facts">${[
    ['威力', m.powerText],
    ['命中', m.accuracy === null ? '不进行命中判定' : `${m.accuracy}%`],
    ['基础PP', m.pp],
    ['优先度', m.priority > 0 ? `+${m.priority}` : m.priority]
  ]
    .map(([label, data]) => `<div><small>${label}</small><b>${data}</b></div>`)
    .join(
      ''
    )}</div><p class="move-target">作用目标 <b>${escape(m.target)}</b></p>${m.effects.length ? `<ul class="move-effects">${m.effects.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>` : ''}${m.flags.length ? `<div class="move-flags">${m.flags.map((flag) => `<span>${escape(flag)}</span>`).join('')}</div>` : ''}</article>`;
}
function packAvailable(resource, except = null) {
  return Math.max(
    0,
    (state.inventory[resource] ?? 0) -
      draftSupplies.reduce((sum, slot, i) => sum + (i !== except && slot?.resource === resource ? slot.quantity : 0), 0)
  );
}
function bagEditor() {
  if (bagEditingSlot === null) return '';
  const resource = state.config.resources[bagResource];
  const available = packAvailable(bagResource, bagEditingSlot),
    limit = Math.min(99, available);
  const old = draftSupplies[bagEditingSlot];
  const quantity = bagQuantityDraft ?? (old?.resource === bagResource ? old.quantity : limit);
  return `<div class="bag-editor"><div class="row"><h3>装填第 ${bagEditingSlot + 1} 格</h3>${button('关闭', 'bag-editor-close', 'type="button"', 'small quiet')}</div><p>从仓库选择一种补给，再确认数量。真正出发时统一扣除仓库库存。</p><div class="bag-resource-options">${Object.entries(
    state.config.resources
  )
    .filter(([, r]) => r.explorationSupply)
    .map(([key]) =>
      button(
        `${itemIcon(key)}<strong>${escape(nameOf(key))}</strong><small>可装 ${packAvailable(key, bagEditingSlot)} 件</small>`,
        'bag-resource',
        `type="button" data-resource="${key}" ${packAvailable(key, bagEditingSlot) ? '' : 'disabled'}`,
        `bag-resource ${key === bagResource ? 'chosen' : ''}`
      )
    )
    .join(
      ''
    )}</div>${resource ? `<form data-form="bag-slot" class="bag-quantity-form"><label>${escape(resource.name)} · 本格数量<input id="bag-quantity" name="quantity" type="number" min="1" max="${Math.max(1, limit)}" value="${quantity}" ${limit ? '' : 'disabled'} required></label><p>每格最多99件 · 扣除其他格的装包方案后，仓库可用 ${available} 件</p><button ${limit ? '' : 'disabled'}>确认放入本格</button></form>` : '<p>先点选上方的补给卡片。</p>'}${old ? button('移除此格道具', 'bag-remove', `type="button" data-slot="${bagEditingSlot}"`, 'small secondary') : ''}</div>`;
}
function supplyBag() {
  const active = !!state.exploration,
    slots = state.exploration?.supplies ?? draftSupplies;
  return `<section class="panel supply-bag" id="exploration-bag"><div class="row">${sectionTitle('shop', active ? '探索背包 · 剩余补给' : '出发前装包', '固定6格 · 每格99件 · 同种道具可占多格')}<span class="chip">${slots.filter(Boolean).length} / 6 格</span></div><div class="supply-slots">${Array.from(
    {length: 6},
    (_, i) => {
      const slot = slots[i];
      return `<button type="button" data-action="bag-slot" data-slot="${i}" class="supply-slot ${slot ? 'filled' : ''}" ${active ? 'disabled' : ''}><small>第 ${i + 1} 格</small>${slot ? `${itemIcon(slot.resource, 'large')}<strong>${escape(nameOf(slot.resource))}</strong><b data-bag-resource="${slot.resource}">× ${slot.quantity}</b><span>${active ? '本次探索余量' : '点击修改或移除'}</span>` : `<b class="slot-plus">${active ? '—' : '+'}</b><strong>${active ? '空格' : '装入补给'}</strong><span>${active ? '探索中无法补给' : '从仓库取出'}</span>`}</button>`;
    }
  ).join(
    ''
  )}</div><div class="bag-footer"><p>${active ? '探索只使用以上物资。结束探索后，未用道具归还仓库；野外掉落直接存入仓库。' : '现在编辑的是装包方案；开始探索时取出道具。出发后无法远程补给，余料在结束时归库。'}</p>${active ? button('查看仓库', 'warehouse-tab', 'data-tab="warehouse" data-page="shop"', 'small secondary') : button('清空装包方案', 'bag-clear', 'type="button"', 'small secondary')}</div>${!active ? bagEditor() : ''}</section>`;
}
function warehouseCards() {
  const rows = Object.entries(state.inventory).filter(([key, n]) => n > 0 && nameOf(key).includes(warehouseQuery.trim()));
  return (
    rows
      .map(([key, amount]) => {
        const r = state.config.resources[key] ?? {},
          item = catalog.items[key] ?? {};
        const machine = r.kind === 'machine',
          healing = r.healHp || r.healFraction,
          stone = evolutionStones.includes(key);
        const description = machine
          ? `学习「${catalog.moves[r.move]?.name ?? ''}」· 单次消耗1份`
          : healing
            ? r.healHp
              ? `回复${r.healHp}点探索体力`
              : `回复最大体力的${r.healFraction[0]}/${r.healFraction[1]}`
            : item.isBerry
              ? '可携带或用于果园种植'
              : item.isBall
                ? '装入探索包后按心愿单自动捕获'
                : stone
                  ? '满足条件时可对伙伴使用，帮助进化'
                  : item.equippable
                    ? '可以交给伙伴携带'
                    : '用于建设、培养或购买';
        return `<article class="warehouse-card"><div class="warehouse-card-top">${itemIcon(machine ? 'tm' : key, 'large')}<div><small>${machine ? '技能机' : item.isBerry ? '树果' : item.isBall ? '宝可梦球' : '仓库物资'}</small><h3>${escape(nameOf(key))}</h3></div><b>× ${amount.toLocaleString()}</b></div><p>${escape(description)}</p><div class="actions">${machine || healing || stone ? button(machine ? '学习招式' : '使用', 'warehouse-use', `data-resource="${key}" data-mode="item-use"`, 'small') : ''}${item.equippable && !machine ? button('装备给伙伴', 'warehouse-use', `data-resource="${key}" data-mode="equip"`, 'small secondary') : ''}${r.explorationSupply ? button('装入探索包', 'warehouse-pack', `data-resource="${key}" ${state.exploration ? 'disabled' : ''}`, 'small secondary') : ''}${r.kind === 'berry' ? button('前往种植', 'page', 'data-page="orchard"', 'small secondary') : ''}${['wood', 'ore'].includes(key) ? button('前往产业', 'page', 'data-page="industry"', 'small secondary') : key === 'training' ? button('分配努力值', 'page', 'data-page="team"', 'small secondary') : key === 'money' ? button('前往百货公司', 'warehouse-tab', 'data-tab="shop"', 'small secondary') : ''}</div></article>`;
      })
      .join('') || '<div class="wish-empty">没有符合条件的仓库物资。</div>'
  );
}
function warehouseUse() {
  if (!warehouseItem) return '';
  const r = state.config.resources[warehouseItem] ?? {},
    machine = r.kind === 'machine';
  return `<section class="panel warehouse-use-panel" id="warehouse-use"><div class="row">${sectionTitle(machine ? 'skill' : 'shop', `${warehouseMode === 'equip' ? '装备' : machine ? '学习' : '使用'} · ${escape(nameOf(warehouseItem))}`)}${button('取消', 'warehouse-use-close', 'type="button"', 'small secondary')}</div><p>仓库余量 ${state.inventory[warehouseItem] ?? 0} 份 · ${warehouseMode === 'equip' ? '交给一位伙伴携带，原持物会归还仓库。' : machine ? '使用后消耗1份；学会后进入已掌握招式，不会覆盖当前四招。' : '选择适用的空闲伙伴，确认后消耗1份。'}</p>${machine ? moveDetails(r.move) : ''}<form data-form="${warehouseMode}"><input type="hidden" name="resource" value="${warehouseItem}">${partnerPicker({key: 'warehouse-target', name: 'partner', title: '选择使用对象', min: 1, max: 1, mode: warehouseMode, resource: warehouseItem})}<button>确认${warehouseMode === 'equip' ? '装备' : machine ? '学习招式' : '使用'}</button></form></section>`;
}
function trainingLimit(p, stat) {
  const total = Object.values(p.evs).reduce((a, b) => a + b, 0);
  return Math.max(0, Math.min(state.inventory.training ?? 0, 510 - total, 252 - p.evs[stat]));
}
function updateTrainingForm(clamp = false) {
  document.querySelectorAll('[data-training-reserve]').forEach((node) => {
    node.textContent = (state.inventory.training ?? 0).toLocaleString();
  });
  const form = document.querySelector('form[data-form="train"]');
  if (!form) return;
  const p = state.pokemon.find((partner) => partner.id === form.elements.partner.value);
  const cap = trainingLimit(p, form.elements.stat.value);
  form.elements.amount.max = Math.max(1, cap);
  form.elements.amount.disabled = !cap;
  form.querySelector('button').disabled = !cap || busy;
  if (clamp) form.elements.amount.value = cap ? Math.min(Number(form.elements.amount.value) || 4, cap) : 0;
  form.querySelector('[data-training-limit]').textContent = cap ? `当前最多可投入 ${cap} 点` : '暂无可分配点数，或该项/总量已达上限。';
}
function dossierSection(key, number, title, hint, body) {
  return `<section class="dossier-section dossier-${key}"><header class="dossier-section-heading"><span class="dossier-number">${number}</span><div><h3>${title}</h3><p>${hint}</p></div></header>${body}</section>`;
}
function partnerDetails(p, held) {
  if (moveDetailPartner !== p.id) {
    moveDetailPartner = p.id;
    moveDetailKey = keyOf(p.moves[0]);
  }
  const total = Object.values(p.evs).reduce((a, b) => a + b, 0),
    reserve = state.inventory.training ?? 0;
  const cap = trainingLimit(p, 'hp');
  const origin = {'test-kit': '初始伙伴', wild: '野外捕获', hatched: '孵化获得', 'test-command': '测试获得'}[p.origin] ?? '冒险获得';
  const nickname = `<form data-form="rename" class="nickname-form"><input name="partner" type="hidden" value="${escape(p.id)}"><label>伙伴昵称（最多12字）<input id="partner-nickname" name="nickname" value="${escape(nicknameDrafts[p.id] ?? p.nickname ?? '')}" placeholder="为这位伙伴取个名字" autocomplete="off"></label><button>保存昵称</button>${button('恢复物种名', 'clear-nickname', `type="button" data-id="${escape(p.id)}"`, 'secondary')}</form><p class="dossier-note">昵称独立于物种名，进化后继续保留；留空保存可恢复物种名。</p>`;
  const training = `<div class="effort-summary"><div class="effort-bank">${itemIcon('training')}<div><span>可分配努力值储备</span><strong data-training-reserve>${reserve.toLocaleString()}</strong><small>训练点 · 1点分配1努力值</small></div></div><div><span>本伙伴已分配</span><strong>${total} <small>/ 510</small></strong></div><div><span>总量剩余空间</span><strong>${510 - total}</strong></div></div>
    <div class="effort-layout"><table class="effort-table"><thead><tr><th>属性</th><th>个体值</th><th>努力值 / 252</th></tr></thead><tbody>${['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map((key) => `<tr><td>${statNames[key]}</td><td>${p.ivs[key]}</td><td><b>${p.evs[key]}</b><div class="effort-bar"><i style="width:${(p.evs[key] / 252) * 100}%"></i></div></td></tr>`).join('')}</tbody></table>
    <form data-form="train" class="training-form"><input name="partner" type="hidden" value="${escape(p.id)}"><label>选择训练属性<select name="stat" id="training-stat">${['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map((k) => `<option value="${k}">${statNames[k]}</option>`).join('')}</select></label><label>投入努力值<input name="amount" type="number" value="${Math.min(4, cap)}" min="1" max="${Math.max(1, cap)}" ${cap ? '' : 'disabled'} required></label><p data-training-limit>${cap ? `当前最多可投入 ${cap} 点` : '暂无可分配点数，或该项/总量已达上限。'}</p><button ${cap ? '' : 'disabled'}>确认分配</button><p class="dossier-note">单项上限252，总量上限510。分配后立即生效，消耗相同数量的训练点。</p></form></div>`;
  const equipment = `<div class="held-current">${itemIcon(p.heldItem)}<div><small>当前携带</small><strong>${escape(nameOf(p.heldItem) || '未携带道具')}</strong></div></div><form data-form="equip" class="dossier-form"><input name="partner" type="hidden" value="${escape(p.id)}"><label>选择仓库中的道具<select name="resource"><option value="">卸下持物</option>${held.map((k) => `<option value="${escape(k)}">${escape(nameOf(k))} × ${state.inventory[k]}</option>`).join('')}</select></label><button>更换持物</button></form>`;
  const moves = `<form data-form="moves" class="move-slots"><input name="partner" type="hidden" value="${escape(p.id)}">${[0, 1, 2, 3].map((i) => `<label><span class="move-slot-number">${i + 1}</span>招式槽<select name="move${i}"><option value="">不装备</option>${p.learnedMoves.map((m) => `<option value="${escape(m)}" ${p.moves[i] === m ? 'selected' : ''}>${escape(zh('moves', m))}</option>`).join('')}</select></label>`).join('')}<button>保存招式</button></form><div id="move-details">${moveDetails(moveDetailKey)}</div>`;
  const evolution = p.evolutions.length
    ? `<div class="evolution-options">${p.evolutions
        .map((e) => {
          const target = catalog.species.find((s) => s.key === e.key);
          const item = e.item?.toLowerCase().replace(/[^a-z0-9]/g, '');
          const eligible = role(p.id) === '空闲' && (e.level ? p.level >= e.level : item && state.inventory[item] > 0);
          const requirement = e.level
            ? `需要${e.level}级 · 当前${p.level}级`
            : e.item
              ? `需要${zh('items', e.item)} · 持有${state.inventory[item] ?? 0}`
              : '特殊进化条件暂未接入';
          return `<form data-form="evolve" class="evolution-option"><input name="partner" type="hidden" value="${escape(p.id)}"><input name="target" type="hidden" value="${e.key}"><div class="evolution-preview">${p.image ? `<img src="/${p.image}" alt="${escape(p.name)}">` : ''}<span>→</span>${target?.image ? `<img src="/${target.image}" alt="${escape(target.name)}">` : ''}</div><h4>${escape(zh('species', e.key))}</h4><p>${escape(requirement)}</p>${role(p.id) !== '空闲' ? `<p class="evolution-blocked">当前${role(p.id)}，请先结束占用。</p>` : ''}<button ${eligible ? '' : 'disabled'}>确认进化</button></form>`;
        })
        .join('')}</div>`
    : '<div class="dossier-complete">已抵达这条进化路线的终点。<p>继续培养，让它以现在的模样发光。</p></div>';
  return `<section id="partner-details" class="partner-dossier"><header class="dossier-hero"><div class="dossier-portrait">${p.image ? `<img src="/${p.image}" alt="${escape(partnerName(p))}">` : ''}</div><div class="dossier-identity"><small>伙伴档案 · ${escape(partnerCode(p))}</small><h2>${escape(partnerName(p))}<span>${p.level}级</span></h2><p>${escape(p.name)} · ${genderName(p.gender)} · ${origin}</p><div class="dossier-facts"><span>性格 <b>${escape(zh('natures', p.nature))}</b></span><span>特性 <b>${escape(zh('abilities', p.ability))}</b></span><span>亲密度 <b>${p.friendship}</b></span><span>当前 <b>${role(p.id)}</b></span></div></div></header><div class="dossier-grid">
    ${dossierSection('identity', '01', '名字与身份', '给独一无二的伙伴，一个属于它的名字', nickname)}
    ${dossierSection('equipment', '02', '携带道具', '从仓库选择一件同行的装备', equipment)}
    ${dossierSection('training', '03', '能力与努力值', '储备、已分配与上限，在这里一目了然', training)}
    ${dossierSection('moves', '04', '招式配置', '从已经掌握的招式中，保存最多四个', moves)}
    ${dossierSection('evolution', '05', '进化之路', '满足条件后，由你决定何时迎接新的模样', evolution)}</div></section>`;
}
function regionCards(active) {
  const level = Math.max(...state.pokemon.map((p) => p.level));
  const selected = state.config.regions.find((r) => r.key === (active?.region || exploreRegion)) ?? state.config.regions[0];
  if (!active) exploreRegion = selected.key;
  return `<div class="region-picker"><div class="row"><h3>${active ? '当前探索地区' : '选择探索地区'}</h3><p>拥有的最高等级：${level}级</p></div><div class="region-choices">${state.config.regions
    .map((r) => {
      const locked = level < r.unlockLevel,
        chosen = selected.key === r.key;
      return `<button type="button" data-action="region-select" data-region="${r.key}" class="region-choice ${r.key} ${chosen ? 'chosen' : ''}" aria-pressed="${chosen}" ${locked || active ? 'disabled' : ''}>
      <span class="region-art"><i></i><i></i><i></i><b>${locked ? '尚未解锁' : chosen ? (active ? '探索进行中' : '已选目的地') : '点击选择'}</b></span><span class="region-choice-body"><strong>${escape(r.name)}</strong><span>${r.minLevel}–${r.maxLevel}级野生伙伴</span><small>${r.unlockLevel}级伙伴解锁${locked ? ` · 还差${r.unlockLevel - level}级` : ' · 已解锁'}</small><span class="region-species">${r.species
        .slice(0, 4)
        .map((key) => {
          const p = catalog.species.find((s) => s.key === key);
          return p?.image ? `<img src="/${p.image}" alt="${escape(p.name)}" title="${escape(p.name)}">` : '';
        })
        .join('')}</span></span></button>`;
    })
    .join('')}</div></div>`;
}
function team() {
  const preset = editedPreset();
  const members = draftTeam ?? preset.team;
  const locked = !!preset.id && preset.id === state.readyPresetId;
  const ready = state.presets.find((value) => value.id === state.readyPresetId);
  const blocked = members.map((id) => state.pokemon.find((p) => p.id === id)).filter((p) => p.activity && p.activity !== '备战中');
  const current = state.pokemon.find((p) => p.id === detailId) ?? state.pokemon[0];
  detailId = current.id;
  const held = Object.keys(state.inventory).filter(
    (key) => state.inventory[key] > 0 && !['money', 'wood', 'ore', 'training'].includes(key)
  );
  return `${moduleIntro('team', '不同旅途，不同搭档', '保存多套成员与战术方案；进入备战后，伙伴会为这支队伍预留。', `${state.presets.length} / ${state.config.teamPresetLimit ?? 10} 套预设`)}
    <div class="ready-banner"><div>${icon('team')}<span>${ready ? `正在备战：<b>${escape(ready.name)}</b> · ${state.team.length}位成员已预留` : '尚未进入备战，保存预设不会占用伙伴。'}</span></div>${ready ? button('取消备战', 'command', 'data-kind="cancel-ready"', 'small secondary') : ''}</div>
    <div class="preset-tabs">${state.presets.map((p) => button(`${escape(p.name)} <small>${p.team.length}位${p.id === state.readyPresetId ? ' · 备战中' : ''}</small>`, 'preset-select', `data-id="${p.id}"`, p.id === preset.id ? 'active' : 'secondary')).join('')}${button('＋ 新建预设', 'preset-new', '', 'secondary')}</div>
    <div class="panel"><div class="row">${sectionTitle('team', preset.id ? '编辑编队预设' : '创建编队预设')}<div class="preset-actions">
      ${button('复制为新预设', 'preset-copy', '', 'small secondary')}${preset.id ? button('删除预设', 'preset-delete', `data-id="${preset.id}" ${locked || state.presets.length === 1 ? 'disabled' : ''}`, 'small secondary') : ''}
      ${button('保存预设', 'save-team', locked ? 'disabled' : '')}${preset.id && !locked ? button('进入备战', 'prepare', `data-id="${preset.id}" ${blocked.length ? 'disabled' : ''}`, 'secondary') : ''}</div></div>
      <div class="forms"><label>预设名称<input id="preset-name" value="${escape(draftPresetName ?? preset.name)}" maxlength="20" ${locked ? 'disabled' : ''}></label><div class="preset-count">已选择 <b>${members.length}</b> / 6 位伙伴</div></div>
      <p>${locked ? '这套预设已固定用于备战。取消备战后可以编辑，也可以复制出一套新方案。' : '可先保存包含工作中伙伴的方案；真正备战或出发时，会检查每一位成员的占用。'}</p>
      ${!locked && blocked.length ? `<div class="notice">暂不能备战：${blocked.map((p) => `${escape(partnerName(p))}（${p.activity}）`).join('、')}。请先结束对应活动。</div>` : ''}
      <div class="preset-members">${
        members
          .map((id) => {
            const p = state.pokemon.find((v) => v.id === id);
            return `<span>${p.image ? `<img src="/${p.image}" alt="${escape(partnerName(p))}">` : ''}<b>${escape(partnerName(p))}</b><small>${escape(p.name)} · ${escape(partnerCode(p))} · ${role(id)}</small></span>`;
          })
          .join('') || '<p>从下方伙伴收藏中加入成员。</p>'
      }</div>
      <label>战斗风格（最多500字）<textarea id="tactic" maxlength="500" ${locked ? 'disabled' : ''} placeholder="例如：优先集中攻击，对方强化时尝试打断。当前策略分析尚未接入。">${escape(draftTactic ?? preset.tactic)}</textarea></label></div>
    <div class="panel"><div class="row"><h2>伙伴收藏</h2><div>${button('上一页', 'roster-prev', '', 'small secondary')} ${button('下一页', 'roster-next', '', 'small secondary')}</div></div>
    <div class="roster">${state.pokemon
      .slice(rosterPage * 30, rosterPage * 30 + 30)
      .map((p) => card(p, true))
      .join('')}</div></div>
    ${partnerDetails(current, held)}`;
}
function explore() {
  const e = state.exploration;
  const recovery = state.recoveryPreview;
  const preset = state.presets.find((p) => p.id === explorePresetId);
  return `${moduleIntro('explore', e ? '旅途正在继续' : '选择你的下一站', '探索仅持续消耗体力；每次遭遇的招式次数和异常状态独立，不影响长时间挂机。', e ? '探索进行中' : '准备出发')}
    ${regionCards(e)}${supplyBag()}
    <div class="panel"><div class="row">${sectionTitle('explore', e ? '探索进行中' : '整装待发')}${e ? button('停止探索', 'command', 'data-kind="explore-stop"', 'secondary') : ''}</div>
    <p>胜利后获得经验与训练点，心愿目标会自动使用探索包中捕获率较高的球。球耗尽继续战斗；恢复完成后继续原路线。</p>
    ${
      e
        ? `<p>战胜 ${e.summary.wins} · 战败 ${e.summary.losses} · 捕获 ${e.summary.captures} · 总经验 ${e.summary.xp} · 累计恢复（游戏时长）${duration(e.summary.recoverySeconds)}</p><p>游戏进度已结算至 ${date(e.cursor)}，${e.recoveryUntil ? '恢复剩余 ' + deadline(e.recoveryUntil) : '下一次遭遇 ' + deadline(e.cursor + state.config.encounterSeconds * 1000)}</p><h3>当前在途成员</h3><p>停止探索后可重新选择成员；修改预设不会替换这次探索队伍。</p><div class="roster">${e.team.map((id) => card(state.pokemon.find((p) => p.id === id))).join('')}</div>`
        : `<form data-form="explore-start"><input type="hidden" name="region" value="${exploreRegion}">
      <div class="preset-tabs explore-modes">${button('手动选择成员', 'explore-preset', 'type="button" data-id=""', !preset ? 'active' : 'secondary')}${state.presets.map((p) => button(`${escape(p.name)} · ${p.team.length}位`, 'explore-preset', `type="button" data-id="${p.id}"`, p.id === preset?.id ? 'active' : 'secondary')).join('')}</div><input type="hidden" name="presetId" value="${preset?.id ?? ''}">
      ${partnerPicker({key: 'explore-team', name: 'team', title: preset ? `预设：${preset.name}` : '手动选择探索成员', min: 1, max: 6, mode: 'explore', readOnly: !!preset, initial: preset?.team ?? []})}<div class="pick-submit"><p>确认成员与地区后再出发。探索途中需先停止，才能调整成员。</p><button>开始探索</button></div></form>`
    }
    <p class="exploration-supply-note">补给耗尽后仍继续探索；自动捕获与额外回复依照随身物资余量执行。</p></div>
    <div class="panel recovery-card">${icon('recovery', 'large')}<div><h2>宝可梦中心</h2><p>探索体力 ${recovery.hp} / ${recovery.maxHp} · 按缺失体力比例恢复，等待时间已按当前倍率折算</p>
      ${recovery.until ? `<p>伙伴正在休息 · 现实剩余 ${deadline(recovery.until)}</p>` : `<p>${recovery.seconds ? `预计等待 ${duration(recovery.realSeconds ?? recovery.seconds)}，完成后继续旅途。` : '伙伴们精神满满，无需恢复。'}</p>`}</div>
      ${recovery.until ? '<span class="chip">恢复中</span>' : button(recovery.seconds ? `恢复体力 · ${duration(recovery.realSeconds ?? recovery.seconds)}` : '体力已满', 'command', `data-kind="rest" ${recovery.seconds ? '' : 'disabled'}`, 'secondary')}</div>
    ${wishlist()}`;
}
function wishResult(p, selected = false) {
  return `<div class="wish-card">${p.image ? `<img src="/${escape(p.image)}" alt="${escape(p.name)}">` : ''}<div><small>图鉴 ${String(p.number).padStart(4, '0')}</small><strong>${escape(p.name)}</strong></div>${selected ? button('移除', 'wish-remove', `data-id="${p.key}"`, 'small secondary') : button((draftWishlist ?? state.wishlist).includes(p.key) ? '已添加' : '＋ 添加', 'wish-add', `data-id="${p.key}" ${(draftWishlist ?? state.wishlist).includes(p.key) ? 'disabled' : ''}`, 'small secondary')}</div>`;
}
function wishResults() {
  const matches = findSpecies(catalog.species, wishlistQuery);
  return !wishlistQuery.trim()
    ? '<div class="wish-empty">输入图鉴编号或中文名字，寻找下一位心愿伙伴。</div>'
    : matches.length
      ? matches.map((p) => wishResult(p)).join('')
      : '<div class="wish-empty">没有找到对应宝可梦，试试更短的名字或全国图鉴编号。</div>';
}
function wishlist() {
  const selected = draftWishlist ?? state.wishlist;
  return `<div class="panel wishlist-panel"><div class="row">${sectionTitle('ball', '捕获心愿单', '搜索伙伴，加入后保存捕获安排')}<span class="chip">已选择 ${selected.length} / 100</span></div>
    <label>按全国图鉴编号／中文名字查找<input id="wishlist-search" type="search" placeholder="例如：25、皮卡丘、伊布" value="${escape(wishlistQuery)}" autocomplete="off"></label>
    <div id="wishlist-results" class="wishlist-results">${wishResults()}</div><div class="row"><h3>已选心愿伙伴</h3><div>${button('清空选择', 'wish-clear', '', 'small secondary')} ${draftWishlist !== null ? button('还原已保存', 'wish-reset', '', 'small secondary') : ''}</div></div>
    <div class="wishlist-selected">${
      selected
        .map((key) => catalog.species.find((p) => p.key === key))
        .filter(Boolean)
        .map((p) => wishResult(p, true))
        .join('') || '<div class="wish-empty">还没有心愿伙伴，从上方搜索添加吧。</div>'
    }</div>
    <div class="row wishlist-save"><p>${draftWishlist !== null ? '选择已修改，保存后将在后续遭遇中生效。' : '当前心愿单已保存。夜间目标仍按实际遭遇时段出现。'}</p>${button('保存心愿单', 'wish-save')}</div></div>`;
}
function industry() {
  return `${moduleIntro('industry', '每一位伙伴，都有擅长的事', '建设产业、安排岗位，用日常积累拓展你的冒险。')}<div class="grid two">${state.config.industries
    .map((cfg) => {
      const f = state.facilities.find((f) => f.key === cfg.key);
      return `<div class="panel facility-card"><div class="facility-art ${cfg.key}">${icon(cfg.key, 'feature')}<span>${f ? `设施${f.level}级` : '待建设'}</span></div>${sectionTitle(cfg.key, cfg.name, f ? `在岗 ${f.workers.length} 位伙伴` : '让闲下来的伙伴找到新工作')}<p>产出${nameOf(cfg.output)}与金钱；${cfg.types.map((type) => zh('types', type)).join(' / ')}属性适性更高，多人投入边际递减。</p>
      ${
        f
          ? `<p>在岗 ${f.workers.length} · 当前库存 ${state.inventory[cfg.output] ?? 0}</p><form data-form="workers"><input type="hidden" name="facility" value="${cfg.key}">${partnerPicker({key: `workers-${cfg.key}`, name: 'workers', title: '岗位与后备', initial: f.workers, max: f.level * 2 + 5, facility: cfg.key})}<button>保存岗位</button></form><p></p>${button('升级设施', 'upgrade', `data-facility="${cfg.key}"`, 'secondary')}`
          : button(`建设 · ${cfg.buildMoney}金币`, 'build', `data-facility="${cfg.key}"`)
      }
      <form data-form="sell" class="forms"><input type="hidden" name="resource" value="${cfg.output}"><label>出售数量<input name="quantity" type="number" min="1" value="10"></label><button>出售产物</button></form></div>`;
    })
    .join('')}</div>`;
}
function nursery() {
  const n = state.nursery;
  return `${moduleIntro('nursery', '等待下一次，小小的相遇', '配对、产蛋、整盒孵化。新的故事，从这里开始。')}<div class="panel nursery-box"><div class="row">${sectionTitle('nursery', '1 号育成盒')}<span class="chip">${n.eggCount} / 5 蛋位</span></div>
    <div class="egg-slots">${Array.from({length: 5}, (_, i) => `<div class="egg-slot ${i < n.eggCount ? 'filled' : ''}">${i < n.eggCount ? itemIcon('egg', 'feature') : '<span class="empty-egg">+</span>'}<small>${i < n.eggCount ? (n.phase === 'complete' ? '已孵化' : '等待相遇') : '空余蛋位'}</small></div>`).join('')}</div><div class="metric">${{empty: '准备配对', producing: '正在产蛋', ready: '等待开孵', hatching: '整盒孵化中', complete: '整盒已完成'}[n.phase]}</div>
    <p>双亲配对时独占；产蛋结束解除占用。开始孵化后固定整批与主理人，直到全部孵化。</p>
    ${['producing', 'hatching'].includes(n.phase) ? `<p>${n.eggCount} 枚蛋 · 剩余 ${deadline(n.completeAt)}</p>` : ''}
    ${['empty', 'complete'].includes(n.phase) ? `<form data-form="breed-start">${partnerPicker({key: 'parents', name: 'parents', title: '选择双亲（前两位已选伙伴）', min: 2, max: 2})}<div class="forms"><label>目标蛋数<input name="eggCount" type="number" min="1" max="5" value="2"></label><button>开始配对产蛋</button></div></form>` : ''}
    ${n.phase === 'ready' ? `<form data-form="hatch-start">${partnerPicker({key: 'manager', name: 'manager', title: '孵化盒主理人（可不安排）', max: 1})}<button>开始整盒孵化</button></form><p>火焰之躯、熔岩铠甲或蒸汽机主理人可加速。开孵后不更换。</p>` : ''}
    ${n.phase === 'complete' ? '<p>新伙伴已进入收藏，重复刷新不会再次生成。</p>' : ''}</div>`;
}
function orchard() {
  return `${moduleIntro('orchard', '一片属于你的树果小园', '有限地块，长久收获。用产业材料慢慢拓展花园。')}<div class="panel"><div class="row">${sectionTitle('orchard', `果园 · ${state.plots.length} 个地块`)}${button('扩建地块', 'upgrade', 'data-facility="orchard"')}</div>
    <p>成熟后周期结果，满载停止新增产出，不因晚登录枯萎。</p></div><div class="grid">${state.plots
      .map(
        (p, i) => `<div class="panel plot-card"><div class="plot-art ${p.berry ? 'planted' : ''}">${p.berry ? icon('orchard', 'feature') : '<span class="empty-plot">+</span>'}</div><div class="row"><h2>${i + 1} 号地块</h2><span class="chip">${p.berry ? '生长中' : '等待种植'}</span></div>
      ${
        p.berry
          ? `<h3>${nameOf(p.berry)}</h3><div class="metric">${p.buffer} / ${state.config.fruitBuffer}</div><p>下一次结果 ${deadline(Math.max(p.plantedAt + state.config.plantMatureSeconds * 1000, p.cursor + state.config.fruitPeriodSeconds * 1000))}</p>
        ${button('收获', 'plot', `data-kind="harvest" data-plot="${i}"`)} ${button('移除果树', 'plot', `data-kind="remove-tree" data-plot="${i}"`, 'secondary')}`
          : `<form data-form="plant"><input name="plot" type="hidden" value="${i}"><label>选择树果<select name="resource"><option value="oranberry">橙橙果</option><option value="sitrusberry">文柚果</option></select></label><p>种植消耗1颗对应树果。</p><button>种下果树</button></form>`
      }</div>`
      )
      .join('')}</div>`;
}
function shop() {
  const entries = Object.entries(state.config.resources).filter(([, r]) => r.price && (r.shopCategory ?? 'explore') === shopTab);
  const intro = `${moduleIntro('shop', '把每一份收获，妥善收藏', '购买、生产和探索掉落都进入仓库；出发时再装入六格随身背包。')}<div class="tabs warehouse-tabs">${button(icon('shop') + '物资仓库', 'warehouse-tab', 'data-tab="warehouse"', warehouseTab === 'warehouse' ? 'active' : 'secondary')}${button(icon('money') + '百货公司', 'warehouse-tab', 'data-tab="shop"', warehouseTab === 'shop' ? 'active' : 'secondary')}</div>`;
  if (warehouseTab === 'warehouse')
    return `${intro}<div class="panel warehouse-heading"><div class="row">${sectionTitle('shop', '仓库收藏', '道具按用途使用，技能机可以交给指定伙伴学习')}${button('前往探索装包', 'page', 'data-page="explore"', 'secondary')}</div><label>查找仓库道具<input id="warehouse-search" type="search" placeholder="输入道具名称或技能机编号" value="${escape(warehouseQuery)}" autocomplete="off"></label></div>${warehouseUse()}<div class="warehouse-grid" id="warehouse-grid">${warehouseCards()}</div>`;
  return `${intro}<div class="tabs">${button(icon('ball') + '探索道具', 'shop-tab', 'data-tab="explore"', shopTab === 'explore' ? 'active' : 'secondary')}${button(icon('gyms') + '重要道具', 'shop-tab', 'data-tab="important"', shopTab === 'important' ? 'active' : 'secondary')}</div><p class="shop-note">${shopTab === 'important' ? '重要道具每种每个游戏小时限购1份，下次刷新后可再次购买。' : '补充探索消耗品，购买后进入仓库，出发前需自行装包。'}</p>
    <div class="grid shop-grid">${entries.map(([key, r]) => `<div class="panel product-card"><div class="product-art">${itemIcon(r.kind === 'machine' ? 'tm' : key, 'feature')}</div><small>${shopTab === 'important' ? '珍贵精选' : '旅途常备'}</small><h2>${escape(r.name)}</h2><p>仓库持有 <b>${state.inventory[key] ?? 0}</b> 份</p><form data-form="buy" class="forms"><input type="hidden" name="resource" value="${key}"><label>份数<input name="quantity" type="number" min="1" max="${shopTab === 'important' ? 1 : 999}" value="1"></label><button>购买 · ${r.price.toLocaleString()}金币</button></form></div>`).join('')}</div>`;
}

function gyms() {
  return `${moduleIntro('gyms', '下一枚徽章，属于谁？', '先在伙伴与编队进入备战；出战成员须结束探索、工作或其它活动。六只全员双打，实际等级，赛前隐藏名单。', `第${state.season}赛季`)}
    ${!state.readyPresetId ? `<div class="notice">当前还没有备战队伍。${button('前往选择预设', 'page', 'data-page="team"', 'small secondary')}</div>` : ''}
    <div class="grid gym-grid">${state.gyms
      .map(
        (g, i) => `<div class="panel gym-card ${g.ownerId === state.id ? 'gold' : ''}"><div class="gym-badge" style="--badge-hue:${i * 30}deg">${icon('gyms', 'feature')}</div><small>第${String(i + 1).padStart(2, '0')}道馆</small><h2>${g.name}</h2><p>当前馆主 <b>${escape(g.ownerName)}</b><br>${g.ownerId === state.id ? '这是你的防守存档' : g.holderKind === 'npc' ? `联盟馆主 · 基准${g.level}级` : '其他玩家的防守存档'}</p>
      <div class="hidden-party" aria-label="对方队伍赛前保密">${'<span>?</span>'.repeat(6)}</div>${
        g.ownerId === state.id
          ? '<span class="chip">你正在担任馆主</span>'
          : g.activeBattleId
            ? '<span class="chip">挑战处理中</span>'
            : button(
                `挑战 · ${state.config.gymChallengeMoney}金币`,
                'challenge',
                `data-gym="${g.key}" ${state.readyPresetId ? '' : 'disabled'}`
              )
      }</div>`
      )
      .join('')}</div>
    <div class="panel"><h2>我的道馆战报</h2><p>战报记录当场结果；上方卡片展示当前席位。你查看的防守存档可能属于其他玩家。</p>${
      state.battles
        .map((b) => {
          const outcome = battleOutcome(b);
          return `<div class="gym-result-row"><div><strong>${escape(state.gyms.find((g) => g.key === b.gymKey)?.name)}</strong><span>我方身份：${b.viewerSide === 'p2' ? '防守方' : '挑战方'}</span><p>${outcome.detail}</p></div><span class="result-badge ${outcome.tone}">${outcome.label}</span>${button('查看战报', 'battle', `data-id="${b.id}"`, 'small secondary')}</div>`;
        })
        .join('') || '<p>还没有挑战记录。</p>'
    }</div>${activeReport ? battleReport(activeReport) : ''}`;
}
function battleReport(b) {
  const outcome = battleOutcome(b);
  return `<div class="panel battle-report"><div class="row"><h2>本场结果 · ${b.turns ?? 0} 回合</h2><span class="result-badge ${outcome.tone}">${outcome.label}</span></div><p>我方身份：${b.viewerSide === 'p2' ? '防守方' : '挑战方'} · ${outcome.detail}</p>
    <p>当前为固定策略，战术智能分析尚未接入。</p><div class="logs">${battleLines(b.events, catalog.names)
      .map((line) => `<div class="log">${escape(line)}</div>`)
      .join('')}</div></div>`;
}
function consolePage() {
  if (!state.testMode) return '<div class="panel"><h2>测试指令未启用</h2><p>请以测试模式启动本地服务后使用。</p></div>';
  const samples = [
    '/资源 金钱 100000',
    '/资源 精灵球 100',
    '/资源 木材 1000',
    '/资源 矿石 1000',
    '/资源 训练点 1000',
    '/资源 技能机125 1',
    '/加速 1小时',
    '/加速 8小时',
    '/加速 7天',
    '/等级 全体 100',
    '/伙伴 熔岩蜗牛 40',
    '/恢复',
    '/赛季 下一季'
  ];
  const rate = state.clock?.rate ?? 1;
  return `${moduleIntro('console', '把等待，调到快进', '补充资源、推进时间，快速走查一段完整冒险。')}
    <div class="panel speed-panel"><div class="row">${sectionTitle('industry', '挂机变速齿轮', '当前账号全部挂机模块共用一个游戏时钟')}<div class="speed-readout"><b id="speed-current">${rate}</b><span>倍流速</span></div></div>
      <form data-form="test-speed" class="forms speed-form"><label>设置倍率（1–1000整数）<input id="afk-speed" name="speed" type="number" min="1" max="1000" step="1" value="${escape(speedDraft ?? rate)}" required></label><button>应用倍率</button></form>
      <div class="speed-presets">${[1, 2, 5, 10, 50, 100, 1000].map((value) => button(value === 1 ? '恢复1倍' : `${value}倍`, 'set-speed', `data-speed="${value}"`, value === rate ? 'active' : 'secondary')).join('')}</div>
      <p>现实1秒推进<span id="speed-description-rate">${rate}</span>游戏秒。探索、恢复、产业、果园、产蛋和孵化同速；关闭浏览器后继续生效。切换倍率保留已积累进度，普通模式启动时恢复1倍。</p>
      <div class="speed-clocks"><span>现实时间 <b id="clock-real">${date(state.clock?.realTime ?? state.serverTime - state.clockOffset)}</b></span><span>游戏时间 <b id="clock-game">${date(state.serverTime)}</b></span></div></div>
    <div class="panel gold">${sectionTitle('console', '本地测试指令')}<p>资源和时间默认只作用于当前账号。一次性加速在当前流速之外直接推进游戏时间。“/赛季 下一季”是全服操作。</p>
    <form id="console-form"><input id="console-command" name="command" class="command" maxlength="160" placeholder="/资源 金钱 100000" value="${escape(consoleDraft)}" required><p></p><button>执行指令</button></form>
    <div class="examples">${samples.map((command) => button(escape(command), 'example', `data-command="${escape(command)}"`, 'small secondary')).join('')}</div>
    <p>/资源 资源名 数量 · /加速 时长（单次最多30天） · /变速 倍率 · /伙伴 中文名字 等级 · /等级 全体 等级 · /恢复 · /赛季 下一季</p>
    <div class="logs">${consoleLines.map((line) => `<div class="log">${escape(line)}</div>`).join('')}</div></div>`;
}
function render(passive = false) {
  $('#auth').hidden = true;
  $('#game').hidden = false;
  $('#refresh').hidden = false;
  $('#logout').hidden = false;
  $('#account-label').textContent = `${state.username} · ${state.pokemon.length} 位伙伴`;
  $('#navigation').innerHTML = Object.entries(pages)
    .map(([id, name], index) =>
      button(
        `${icon(id)}<span>${name}<small>${moduleInfo[id][0]}</small></span><b>${String(index + 1).padStart(2, '0')}</b>`,
        'page',
        `data-page="${id}" ${page === id ? 'aria-current="page"' : ''}`,
        page === id ? 'active' : ''
      )
    )
    .join('');
  $('#page-title').textContent = pages[page];
  document.body.dataset.page = page;
  $('#page-symbol').innerHTML = icon(page, 'large');
  $('#page-english').textContent = moduleInfo[page][0];
  $('#page-subtitle').textContent = moduleInfo[page][1];
  $('#season-label').textContent = `第 ${state.season} 赛季`;
  $('#wallet').innerHTML =
    `<div class="wallet-main">${itemIcon('money')}<span><small>冒险资金</small><strong>${state.inventory.money.toLocaleString()}</strong></span></div><div class="wallet-training">${itemIcon('training')}<span>训练点 <b>${state.inventory.training ?? 0}</b></span></div>`;
  $('#banner').textContent = state.catchingUp
    ? `正在补结算离线过程… 已推进至 ${date(state.exploration.cursor)}`
    : `存档已同步 · ${state.testMode ? '联调模式' : '冒险就绪'} · 挂机${state.clock?.rate ?? 1}倍${state.clockOffset ? ` · 游戏时间已领先${(state.clockOffset / 3600000).toFixed(1)}小时` : ''}`;
  const views = {overview, team, explore, industry, nursery, orchard, shop, gyms, logs: () => logs() + ledger(), console: consolePage};
  const editing =
    $('#content').contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  const sameView = $('#content').dataset.page === page && $('#content').dataset.testMode === String(state.testMode);
  if (!(passive && sameView && (page === 'console' || editing))) {
    $('#content').innerHTML = views[page]();
    $('#content').dataset.page = page;
    $('#content').dataset.testMode = String(state.testMode);
  }
  tick();
}
function ledger() {
  return `<div class="panel logs"><h2>资源收支记录</h2>${state.ledger
    .map(
      (l) =>
        `<div class="log"><time>${date(l.at)}</time>${escape(l.reason)} · ${Object.entries(l.deltas)
          .map(([key, n]) => `${escape(nameOf(key))} ${n > 0 ? '+' : ''}${n}`)
          .join(' / ')}</div>`
    )
    .join('')}</div>`;
}
async function refresh(forceContent = false) {
  if (refreshing) return;
  let epoch = accountEpoch;
  refreshing = true;
  try {
    do {
      const result = await api('/api/game/state');
      if (epoch !== accountEpoch) return;
      if (!catalog) {
        const data = await api('/api/game/catalog');
        if (epoch !== accountEpoch) return;
        catalog = data;
      }
      if (state && state.id !== result.id) {
        clearAccount();
        epoch = accountEpoch;
        refreshing = true;
      }
      state = result;
      if (activeReport && ['queued', 'running'].includes(activeReport.status)) {
        const summary = state.battles.find((b) => b.id === activeReport.id);
        if (summary && summary.status !== activeReport.status) {
          const report = await api(`/api/game/battles/${summary.id}`);
          if (epoch !== accountEpoch) return;
          activeReport = report;
        }
      }
      clockReceivedAt = performance.now();
      render(forceContent === true ? false : true);
      if (state.catchingUp) await new Promise((resolve) => setTimeout(resolve, 50));
    } while (epoch === accountEpoch && state?.catchingUp && !busy);
  } catch (error) {
    if (epoch !== accountEpoch) return;
    if (error.status === 401) clearAccount();
    else toast(error.message);
  } finally {
    if (epoch === accountEpoch) refreshing = false;
  }
}
async function perform(input) {
  if (busy) {
    toast('正在处理上一项操作，请稍候。');
    return;
  }
  const epoch = accountEpoch;
  busy = true;
  const controls = [...document.querySelectorAll('#game button, #game input, #game select, #game textarea, #refresh')].map((node) => ({
    node,
    disabled: node.disabled
  }));
  controls.forEach(({node}) => {
    node.disabled = true;
  });
  $('#game').setAttribute('aria-busy', 'true');
  try {
    while (refreshing && epoch === accountEpoch) await new Promise((resolve) => setTimeout(resolve, 20));
    if (epoch !== accountEpoch) return;
    const evolutionBefore = ['evolve', 'item-use'].includes(input.kind)
      ? structuredClone(state.pokemon.find((p) => p.id === input.partner))
      : null;
    const result = await api('/api/game/command', {commandId: crypto.randomUUID(), ...input});
    if (epoch !== accountEpoch) return;
    toast(result.message);
    if (input.kind === 'debug') consoleLines.unshift(`${input.command} → ${result.message}`);
    if (input.kind === 'debug') consoleDraft = '';
    if (input.kind === 'test-speed') speedDraft = null;
    if (input.kind === 'rename') delete nicknameDrafts[input.partner];
    if (input.kind === 'workers') delete pickerDrafts[`workers-${input.facility}`];
    if (input.kind === 'breed-start') delete pickerDrafts.parents;
    if (input.kind === 'hatch-start') delete pickerDrafts.manager;
    if (['explore-start', 'explore-stop'].includes(input.kind)) {
      draftSupplies = Array(6).fill(null);
      bagEditingSlot = null;
      bagResource = '';
      bagQuantityDraft = null;
    }
    if (['item-use', 'equip'].includes(input.kind)) {
      warehouseItem = null;
      delete pickerDrafts['warehouse-target'];
    }
    if (input.kind === 'preset-save') selectPreset(result.presetId);
    if (input.kind === 'preset-delete') selectPreset(null);
    if (input.kind === 'prepare') selectPreset(input.presetId);
    if (input.kind === 'wishlist') draftWishlist = null;
    if (result.battleId) {
      page = 'gyms';
      activeReport = null;
    }
    await refresh(true);
    if (evolutionBefore && epoch === accountEpoch) {
      const evolved = state.pokemon.find((p) => p.id === input.partner);
      if (evolved && evolved.species !== evolutionBefore.species) await playEvolution(evolutionBefore, evolved);
    }
  } catch (error) {
    if (epoch !== accountEpoch) return;
    if (error.status === 401) {
      clearAccount();
      return;
    }
    toast(error.message);
    if (input.kind === 'debug') {
      consoleLines.unshift(`${input.command} → ${error.message}`);
      render();
    }
  } finally {
    if (epoch === accountEpoch) {
      busy = false;
      controls.forEach(({node, disabled}) => {
        if (node.isConnected) node.disabled = disabled;
      });
      $('#game').removeAttribute('aria-busy');
    }
  }
}
$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authBusy) return;
  authBusy = true;
  const form = new FormData(event.target);
  const mode = event.submitter.value;
  clearAccount();
  const epoch = accountEpoch;
  $('#auth-error').textContent = '';
  try {
    await api(`/api/auth/${mode}`, {username: form.get('username'), password: form.get('password')});
    if (epoch !== accountEpoch) return;
    event.target.reset();
    await refresh();
  } catch (error) {
    if (epoch === accountEpoch) $('#auth-error').textContent = error.message;
  } finally {
    authBusy = false;
  }
});
$('#refresh').onclick = refresh;
$('#logout').onclick = async () => {
  if (authBusy) return;
  authBusy = true;
  clearAccount();
  try {
    await api('/api/auth/logout', {});
  } catch (error) {
    $('#auth-error').textContent = error.message;
  } finally {
    authBusy = false;
  }
};
document.addEventListener('input', (event) => {
  if (event.target.id === 'bag-quantity') bagQuantityDraft = event.target.value;
  if (event.target.id === 'warehouse-search') {
    warehouseQuery = event.target.value;
    $('#warehouse-grid').innerHTML = warehouseCards();
  }
  if (event.target.id === 'partner-nickname') nicknameDrafts[detailId] = event.target.value;
  if (event.target.matches('[data-picker-search]')) {
    const picker = event.target.closest('[data-picker]');
    const config = pickerConfig(picker),
      draft = pickerDrafts[config.key];
    draft.query = event.target.value;
    picker.querySelector('.pick-pool').innerHTML = pickerTiles(config, config.readOnly ? config.initial : draft.ids, draft.query);
  }
  if (event.target.id === 'afk-speed') speedDraft = event.target.value;
  if (event.target.id === 'console-command') consoleDraft = event.target.value;
  if (event.target.id === 'tactic') draftTactic = event.target.value;
  if (event.target.id === 'preset-name') draftPresetName = event.target.value;
  if (event.target.id === 'wishlist-search') {
    wishlistQuery = event.target.value;
    $('#wishlist-results').innerHTML = wishResults();
  }
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'training-stat') updateTrainingForm(true);
  if (event.target.form?.dataset.form === 'moves' && event.target.name.startsWith('move')) {
    moveDetailKey = keyOf(event.target.value);
    $('#move-details').innerHTML = moveDetails(moveDetailKey);
  }
});
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id === 'auth-form') return;
  event.preventDefault();
  const values = new FormData(form);
  if (form.id === 'console-form') {
    await perform({kind: 'debug', command: values.get('command')});
    return;
  }
  const kind = form.dataset.form;
  if (!kind) return;
  if (kind === 'bag-slot') {
    if (state.exploration) return;
    const amount = Number(values.get('quantity'));
    if (
      bagEditingSlot === null ||
      !state.config.resources[bagResource]?.explorationSupply ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > 99 ||
      amount > packAvailable(bagResource, bagEditingSlot)
    ) {
      toast('装包数量超出每格上限或仓库可用库存。');
      return;
    }
    draftSupplies[bagEditingSlot] = {resource: bagResource, quantity: amount};
    bagEditingSlot = null;
    bagResource = '';
    bagQuantityDraft = null;
    render();
    return;
  }
  for (const picker of form.querySelectorAll('[data-picker]')) {
    const config = pickerConfig(picker);
    const ids = config.readOnly ? config.initial : pickerDrafts[config.key].ids;
    if (ids.length < config.min || ids.length > config.max) {
      toast(`${config.title}需要选择${config.min === config.max ? config.min : `${config.min}–${config.max}`}位伙伴。`);
      return;
    }
    if (
      ids.some((id) =>
        pickerBlock(
          state.pokemon.find((p) => p.id === id),
          config
        )
      )
    ) {
      toast('已选成员正在其他活动中，请移除或先结束对应活动。');
      return;
    }
  }
  const input = {kind, ...Object.fromEntries(values)};
  if (kind === 'explore-start') input.supplies = draftSupplies;
  for (const key of ['amount', 'quantity', 'plot', 'eggCount', 'speed']) if (key in input) input[key] = Number(input[key]);
  if (['explore-start', 'workers'].includes(kind))
    input[kind === 'workers' ? 'workers' : 'team'] = values.getAll(kind === 'workers' ? 'workers' : 'team');
  if (kind === 'breed-start') input.parents = values.getAll('parents');
  if (kind === 'rename' && Array.from(input.nickname.trim()).length > 12) {
    toast('昵称最多12字。');
    return;
  }
  if (kind === 'moves') input.moves = [0, 1, 2, 3].map((i) => values.get(`move${i}`)).filter(Boolean);
  await perform(input);
});
document.addEventListener('click', async (event) => {
  const target = event.target.closest('button[data-action]');
  if (!target || !state) return;
  const d = target.dataset;
  if (d.action === 'bag-slot' && !state.exploration) {
    bagEditingSlot = Number(d.slot);
    bagResource = draftSupplies[bagEditingSlot]?.resource ?? '';
    bagQuantityDraft = null;
    render();
    $('.bag-editor').scrollIntoView({block: 'center'});
  }
  if (d.action === 'bag-resource') {
    bagResource = d.resource;
    bagQuantityDraft = null;
    render();
  }
  if (d.action === 'bag-editor-close') {
    bagEditingSlot = null;
    bagQuantityDraft = null;
    render();
  }
  if (d.action === 'bag-remove' && !state.exploration) {
    draftSupplies[Number(d.slot)] = null;
    bagEditingSlot = null;
    bagQuantityDraft = null;
    render();
  }
  if (d.action === 'bag-clear' && !state.exploration) {
    draftSupplies = Array(6).fill(null);
    bagEditingSlot = null;
    render();
  }
  if (d.action === 'warehouse-tab') {
    warehouseTab = d.tab;
    if (d.page) page = d.page;
    render();
  }
  if (d.action === 'warehouse-use') {
    warehouseItem = d.resource;
    warehouseMode = d.mode;
    delete pickerDrafts['warehouse-target'];
    render();
    $('#warehouse-use').scrollIntoView({block: 'start'});
  }
  if (d.action === 'warehouse-use-close') {
    warehouseItem = null;
    delete pickerDrafts['warehouse-target'];
    render();
  }
  if (d.action === 'warehouse-pack' && !state.exploration) {
    const slot = draftSupplies.findIndex((s) => !s);
    if (slot < 0) {
      toast('六格装包方案已满，请先移除或调整一个格子。');
      return;
    }
    page = 'explore';
    bagEditingSlot = slot;
    bagResource = d.resource;
    bagQuantityDraft = null;
    render();
    $('.bag-editor').scrollIntoView({block: 'center'});
  }
  if (d.action === 'region-select') {
    exploreRegion = d.region;
    render();
  }
  if (['picker-toggle', 'picker-remove', 'picker-clear'].includes(d.action)) {
    const picker = target.closest('[data-picker]'),
      config = pickerConfig(picker);
    if (config.readOnly) return;
    const draft = pickerDrafts[config.key];
    if (d.action === 'picker-clear') draft.ids = [];
    else if (draft.ids.includes(d.id)) draft.ids = draft.ids.filter((id) => id !== d.id);
    else if (
      !pickerBlock(
        state.pokemon.find((p) => p.id === d.id),
        config
      )
    ) {
      if (config.max === 1) draft.ids = [d.id];
      else if (draft.ids.length < config.max) draft.ids.push(d.id);
    }
    const scroll = picker.querySelector('.pick-pool').scrollTop;
    picker.outerHTML = partnerPicker(config);
    const updated = document.querySelector(`[data-picker="${config.key}"]`);
    updated.querySelector('.pick-pool').scrollTop = scroll;
    updated.querySelector(`[data-action="picker-toggle"][data-id="${d.id}"]`)?.focus({preventScroll: true});
    return;
  }
  if (d.action === 'explore-preset') {
    explorePresetId = d.id;
    render();
  }
  if (d.action === 'clear-nickname') await perform({kind: 'rename', partner: d.id, nickname: ''});
  if (d.action === 'set-speed') await perform({kind: 'test-speed', speed: Number(d.speed)});
  if (d.action === 'page') {
    page = d.page;
    render();
    window.scrollTo({top: 0, behavior: 'auto'});
  }
  if (d.action === 'detail') {
    detailId = d.id;
    page = 'team';
    render();
    $('#partner-details').scrollIntoView({block: 'start', behavior: 'auto'});
  }
  if (d.action === 'toggle-team') {
    if (editedPreset().id && editedPreset().id === state.readyPresetId) return;
    draftTeam = [...(draftTeam ?? editedPreset().team)];
    const index = draftTeam.indexOf(d.id);
    if (index >= 0) draftTeam.splice(index, 1);
    else if (draftTeam.length < 6) draftTeam.push(d.id);
    else {
      toast('最多6位成员。');
      return;
    }
    render();
  }
  if (d.action === 'save-team') {
    const preset = editedPreset();
    await perform({
      kind: 'preset-save',
      presetId: preset.id,
      name: draftPresetName ?? preset.name,
      team: draftTeam ?? preset.team,
      tactic: draftTactic ?? preset.tactic
    });
  }
  if (d.action === 'preset-select') {
    selectPreset(d.id);
    render();
  }
  if (d.action === 'preset-new') {
    selectPreset('new');
    render();
  }
  if (d.action === 'preset-copy') {
    const preset = editedPreset();
    const team = [...(draftTeam ?? preset.team)],
      tactic = draftTactic ?? preset.tactic,
      name = draftPresetName ?? preset.name;
    selectPreset('new');
    draftTeam = team;
    draftTactic = tactic;
    draftPresetName = `${name}副本`.slice(0, 20);
    render();
  }
  if (d.action === 'preset-delete') await perform({kind: 'preset-delete', presetId: d.id});
  if (d.action === 'prepare') {
    if (draftTeam || draftTactic !== null || draftPresetName !== null) {
      toast('请先保存预设修改，再进入备战。');
      return;
    }
    await perform({kind: 'prepare', presetId: d.id});
  }
  if (d.action === 'wish-add') {
    draftWishlist = [...(draftWishlist ?? state.wishlist)];
    if (draftWishlist.length >= 100) {
      toast('心愿单最多100个物种。');
      return;
    }
    if (!draftWishlist.includes(d.id)) draftWishlist.push(d.id);
    render();
  }
  if (d.action === 'wish-remove') {
    draftWishlist = (draftWishlist ?? state.wishlist).filter((key) => key !== d.id);
    render();
  }
  if (d.action === 'wish-clear') {
    draftWishlist = [];
    render();
  }
  if (d.action === 'wish-reset') {
    draftWishlist = null;
    render();
  }
  if (d.action === 'wish-save') await perform({kind: 'wishlist', species: draftWishlist ?? state.wishlist});
  if (d.action === 'command') await perform({kind: d.kind});
  if (d.action === 'build') await perform({kind: 'build', facility: d.facility, workers: []});
  if (d.action === 'upgrade') await perform({kind: 'upgrade', facility: d.facility});
  if (d.action === 'plot') await perform({kind: d.kind, plot: Number(d.plot)});
  if (d.action === 'challenge') await perform({kind: 'gym-challenge', gym: d.gym});
  if (d.action === 'shop-tab') {
    shopTab = d.tab;
    render();
  }
  if (d.action === 'example') {
    $('#console-command').value = d.command;
    consoleDraft = d.command;
    $('#console-command').focus();
  }
  if (d.action === 'roster-prev') {
    rosterPage = Math.max(0, rosterPage - 1);
    render();
  }
  if (d.action === 'roster-next') {
    rosterPage = Math.min(Math.floor((state.pokemon.length - 1) / 30), rosterPage + 1);
    render();
  }
  if (d.action === 'battle') {
    const epoch = accountEpoch;
    try {
      const report = await api(`/api/game/battles/${d.id}`);
      if (epoch !== accountEpoch) return;
      activeReport = report;
      render();
    } catch (error) {
      if (epoch === accountEpoch) toast(error.message);
    }
  }
});
let nextAutoRefresh = 0;
function tick() {
  if (!state) return;
  updateTrainingForm();
  const clock = displayClock();
  const now = clock.gameTime;
  let due = state.catchingUp || (!!state.centerUntil && now >= state.centerUntil);
  document.querySelectorAll('[data-deadline]').forEach((node) => {
    const seconds = Math.max(0, Math.ceil((Number(node.dataset.deadline) - now) / clock.rate / 1000));
    node.textContent = seconds ? `${Math.floor(seconds / 3600)}时 ${Math.floor((seconds % 3600) / 60)}分 ${seconds % 60}秒` : '等待结算';
    if (!seconds) due = true;
  });
  if ($('#clock-real')) $('#clock-real').textContent = date(clock.realTime);
  if ($('#clock-game')) $('#clock-game').textContent = date(clock.gameTime);
  if ($('#speed-current')) $('#speed-current').textContent = clock.rate;
  if ($('#speed-description-rate')) $('#speed-description-rate').textContent = clock.rate;
  const speedInput = $('#afk-speed');
  if (speedInput && speedDraft === null && document.activeElement !== speedInput) speedInput.value = clock.rate;
  document.querySelectorAll('[data-action="set-speed"]').forEach((node) => {
    const selected = Number(node.dataset.speed) === clock.rate;
    node.classList.toggle('active', selected);
    node.classList.toggle('secondary', !selected);
  });
  const running = state.battles.some((b) => b.status === 'queued' || b.status === 'running');
  const working =
    !!state.exploration ||
    !!state.centerUntil ||
    state.facilities.some((facility) => facility.workers.length) ||
    state.plots.some((plot) => plot.berry) ||
    ['producing', 'hatching'].includes(state.nursery.phase);
  if ((due || running || (clock.rate > 1 && working)) && !refreshing && !busy && performance.now() > nextAutoRefresh) {
    nextAutoRefresh = performance.now() + 2000;
    void refresh();
  }
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state) void refresh();
});
clearAccount();
try {
  if ((await api('/api/auth/session')).authenticated) await refresh();
} catch (error) {
  $('#auth-error').textContent = error.message;
}
