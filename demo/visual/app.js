/* Presentation only. All rewards, counts, times and battle events are fixed visual fixtures. */
(() => {
  "use strict";

  const pages = [
    { id: "overview", name: "冒险总览", en: "YOUR ADVENTURE", hint: "旅途的新收获，正在等你查看。" },
    { id: "dex", name: "宝可梦图鉴", en: "POKÉDEX & PARTNERS", hint: "每一只宝可梦，都有自己的故事。" },
    { id: "team", name: "编队与战术", en: "TEAM & TACTICS", hint: "把你的想法，交给并肩作战的伙伴。" },
    { id: "explore", name: "地区探索", en: "EXPLORE THE WORLD", hint: "设置目的地，让冒险在离线时继续。" },
    { id: "nursery", name: "育成屋", en: "POKÉMON NURSERY", hint: "每一颗蛋里，都藏着新的可能。" },
    { id: "industry", name: "产业与果园", en: "A PLACE FOR EVERYONE", hint: "伙伴们的拿手本领，让小镇一天比一天热闹。" },
    { id: "trade", name: "联机广场", en: "LINK PLAZA", hint: "交换一位伙伴，也交换一段新的旅途。" },
    { id: "league", name: "道馆与联盟", en: "THE POKÉMON LEAGUE", hint: "六位伙伴，两两并肩，向下一枚徽章出发。" },
    { id: "shop", name: "背包与百货", en: "BAG & DEPARTMENT STORE", hint: "为下一次远行，装好你的背包。" },
    { id: "growth", name: "成长与赛季", en: "RESEARCH & SEASON", hint: "记录每一步成长，收藏每一份荣誉。" },
    { id: "logs", name: "重要日志", en: "ADVENTURE JOURNAL", hint: "让每一份收获和每一次胜负，都有迹可循。" }
  ];
  const party = [25, 133, 448, 445, 197, 94];
  const dexGroups = {
    "全部伙伴": [25, 133, 448, 445, 197, 94, 147, 131, 196, 1, 175, 393],
    "主力队": [25, 133, 448, 445, 197, 94],
    "收藏": [147, 131, 175, 393, 196, 248],
    "工作中": [68, 74, 95, 152, 252, 219]
  };
  const levels = { 25: 28, 133: 25, 448: 30, 445: 31, 197: 27, 94: 29, 147: 18, 131: 26, 196: 27, 175: 12 };
  const typeClasses = {
    "草": "grass", "虫": "bug", "电": "electric", "火": "fire", "水": "water", "冰": "ice",
    "超能力": "psychic", "妖精": "fairy", "幽灵": "ghost", "恶": "dark", "毒": "poison",
    "格斗": "fighting", "地面": "ground", "岩石": "rock", "龙": "dragon", "钢": "steel",
    "一般": "normal", "飞行": "flying"
  };
  const ui = { page: "overview", state: "normal", selected: 25, tabs: {}, shopCategory: "探索道具", log: "battle" };
  const stateLabels = { normal: "常规样例", complete: "整批孵化完成", shortage: "探索补给不足", empty: "初次空状态" };
  const specialStates = { explore: "shortage", nursery: "complete" };
  const assets = window.POKEMON_ASSETS;
  const content = document.querySelector("#page-content");
  const modalLayer = document.querySelector("#modal-layer");
  let toastTimer;
  let previousFocus;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function sprite(id, size = 96, back = false, className = "") {
    const item = assets[String(id)];
    return `<img class="sprite ${className}" src="${back ? item.back : item.front}" alt="${item.name}" width="${size}" height="${size}">`;
  }

  function icon(key, className = "") {
    const names = {
      ball: "精灵球", egg: "宝可梦蛋", bag: "旅行背包", badge: "联盟徽章",
      mine: "矿场", lumber: "木场", workshop: "工坊", berrytree: "果树"
    };
    return `<img class="item-icon ${className}" src="assets/icons/${key}.png" alt="${names[key]}">`;
  }

  function types(id) {
    return assets[String(id)].types.map((type) => `<span class="tag ${typeClasses[type] || "normal"}">${type}</span>`).join(" ");
  }

  function button(label, attributes = "", style = "") {
    return `<button class="button ${style}" ${attributes}>${label}</button>`;
  }

  function progress(width = "68%", style = "") {
    return `<div class="progress ${style}"><span style="width:${width}"></span></div>`;
  }

  function panelTitle(title, more = "") {
    return `<div class="panel-title"><h2>${title}</h2>${more}</div>`;
  }

  function title(page, subtitle, actions = "") {
    const states = { complete: "完成待查看", shortage: "补给不足样例", empty: "初次空状态" };
    const right = ui.state === "normal" ? actions : `<span class="pill gold">${states[ui.state]}</span>`;
    return `<div class="page-title"><div><div class="eyebrow">${page.en}</div>
      <h1>${page.name}<span class="subtitle">${subtitle}</span></h1></div><div class="title-actions">${right}</div></div>`;
  }

  function tabs(items, selected = items[0]) {
    return `<div class="tabs">${items.map((item) => `<button class="tab ${selected === item ? "active" : ""}"
      data-tab="${item}">${item}</button>`).join("")}</div>`;
  }

  function pokemonCard(id, attributes = "", selected = false) {
    const item = assets[String(id)];
    return `<button class="pokemon-card ${selected ? "selected" : ""}" ${attributes}>
      <span class="dex-number">No. ${String(item.id).padStart(3, "0")}</span>${sprite(id)}
      <strong>${item.name}</strong><div class="card-types">${types(id)}</div></button>`;
  }

  function miniTeam() {
    return `<div class="mini-team">${party.map((id) => `<button class="mini-member" data-modal="pokemon" data-id="${id}">
      ${sprite(id)}<strong>${assets[String(id)].name}</strong><span class="level">${levels[id]}</span>${progress("82%")}</button>`).join("")}</div>`;
  }

  function overview() {
    return `<div class="home-grid"><div>
      <div class="map-scene home-map">
        <div class="map-location"><small>CURRENT DESTINATION</small>常青森林 · Lv. 15–30</div>
        <div class="map-status">${ui.state === "shortage" ? "补给耗尽 · 仍在探索" : "探索进行中"}</div>
        <img class="map-sprite" src="${assets[25].front}" alt="森林中的皮卡丘" style="left:41%;top:34%">
        <img class="map-sprite" src="${assets[133].front}" alt="森林中的伊布" style="left:53%;top:41%">
        <div class="map-route-note"><div><strong>你的伙伴，走得比想象中更远。</strong><small>本次离线 08 小时 16 分 · 发现了新的旅途故事</small></div>
          ${button("查看探索", 'data-page="explore"', "primary")}</div>
      </div>
      <div class="panel home-team">${panelTitle("正在冒险的伙伴", '<button class="text-link" data-page="team">调整编队</button>')}${miniTeam()}</div>
    </div><div class="stack">
      <div class="panel catch-card">${panelTitle("旅途中的惊喜", '<span class="tag gold">稀有发现</span>')}
        ${sprite(147)}<div class="catch-name">迷你龙</div><div class="small-text">Lv. 18 <span class="header-separator">/</span> ${types(147)}</div>
        ${button("认识新伙伴", 'data-modal="pokemon" data-id="147"', "primary")}<div class="catch-note">01:36 · 已通过心愿单自动捕获</div>
      </div>
      <div class="panel">${panelTitle("冒险速报", '<button class="text-link" data-page="logs">全部日志</button>')}
        <div class="activity-feed"><div class="feed-row"><time>07:40</time><div>道馆挑战结束<br><strong>你战胜了小刚！</strong></div></div>
          <div class="feed-row"><time>06:18</time><div>育成屋传来消息<br><strong>一批新的伙伴正在等你。</strong></div></div>
          <div class="feed-row"><time>04:25</time><div>木场完成生产<br><strong>获得木材 × 120</strong></div></div></div>
      </div>
    </div></div>
    <div class="home-small-cards">
      <div class="panel home-small-card"><div><div class="tiny-label">NURSERY</div><h3>育成屋 · 1 号盒</h3>
        <p class="small-text muted">5 枚蛋 · 即将迎来新生命</p>${button("前往查看", 'data-page="nursery"', "small")}</div>${icon("egg")}</div>
      <div class="panel home-small-card"><div><div class="tiny-label">RESEARCH</div><h3>博士的新发现</h3>
        <p class="small-text muted">图鉴收集 128 / 150</p>${button("查看研究", 'data-page="growth"', "small")}</div>${sprite(1)}</div>
      <div class="panel home-small-card"><div><div class="tiny-label">LEAGUE</div><h3>下一个目标 · 华蓝道馆</h3>
        <p class="small-text muted">新的对手，新的配合。</p>${button("准备挑战", 'data-page="league"', "small")}</div>${icon("badge")}</div>
    </div>`;
  }

  function statRows() {
    return [["HP", "84", "76%"], ["攻击", "61", "60%"], ["防御", "44", "44%"], ["特攻", "59", "58%"],
      ["特防", "53", "53%"], ["速度", "87", "88%"]].map(([name, value, width]) =>
      `<div class="stat-row"><span>${name}</span>${progress(width)}<strong>${value}</strong></div>`).join("");
  }

  function dex() {
    let tab = ui.tabs.dex || "全部伙伴";
    if (!dexGroups[tab].includes(ui.selected)) {
      const matchingTab = Object.keys(dexGroups).find((key) => dexGroups[key].includes(ui.selected));
      if (matchingTab) {
        tab = matchingTab;
        ui.tabs.dex = tab;
      } else {
        ui.selected = dexGroups[tab][0];
      }
    }
    const groups = dexGroups;
    const id = ui.selected;
    return `<div class="dex-layout"><div>${tabs(Object.keys(groups), tab)}
      <div class="dex-grid">${groups[tab].map((pid) => pokemonCard(pid, `data-dex="${pid}"`, pid === id)).join("")}</div>
      <div class="pagination"><span>收藏中 168 只</span><span class="header-separator">/</span>${button("上一页", 'data-toast="当前展示第 1 页样例"', "small")}<span>01 / 14</span>${button("下一页", 'data-toast="后续页沿用相同收藏组件"', "small")}</div>
    </div><div class="panel detail-panel">
      ${panelTitle("伙伴档案", '<span class="tag">主力伙伴</span>')}<div class="detail-portrait">${sprite(id)}</div>
      <div class="detail-name">${assets[String(id)].name}<small>Lv. ${levels[id] || 24}</small></div>
      <div class="detail-meta"><span>相遇于常青森林</span><span>亲密度 · 友好</span></div>
      <div>${types(id)}</div><div style="margin-top:17px">${statRows()}</div>
      <div class="info-pairs"><div><span>性格</span>爽朗</div><div><span>特性</span>${assets[String(id)].ability}</div>
        <div><span>个体</span>31 / 31 / 28</div><div><span>状态</span>档案样例</div></div>
      <div class="row">${button("培养配置", 'data-modal="training"', "primary small")}${button("招式与进化", 'data-modal="moves"', "small")}</div>
      <p class="section-note">个体、努力值与招式，共同构成伙伴的培养档案。</p>
    </div></div>`;
  }

  function team() {
    const roles = ["电系游击", "灵活补位", "核心进攻", "物理输出", "辅助保护", "特殊输出"];
    return `<div class="team-layout"><div>
      ${tabs(["探索编队", "道馆挑战", "联盟预设"], ui.tabs.team || "道馆挑战")}
      <div class="team-six">${party.map((id, index) => `<div class="team-card"><span class="slot-no">SLOT 0${index + 1}</span>
        ${sprite(id)}<h3>${assets[String(id)].name} <span class="muted small-text">Lv. ${levels[id]}</span></h3>
        <div class="row"><span>${roles[index]}</span><button class="text-link" data-modal="members">更换伙伴</button></div></div>`).join("")}</div>
      <div class="panel tactic-panel">${panelTitle("我的战斗风格", '<span class="tag">高级战斗使用</span>')}
        <textarea aria-label="战斗风格示例" maxlength="500">以稳定的双打配合为主，优先控制对方速度。路卡利欧与皮卡丘建立进攻节奏，遇到明显不利的属性对位及时换人。保护关键输出，集中火力处理威胁最大的目标；保留月亮伊布应对后半场。</textarea>
        <div class="tactic-footer"><span>最多 500 字 · 当前为可编辑展示文本</span>${button("预览提交", 'data-modal="tactic"', "small primary")}</div>
      </div>
    </div><div class="stack"><div class="panel mint">${panelTitle("本场规则")}
      <div class="note-block"><strong>六位伙伴，全员参战</strong>同时在场两只，其余伙伴等待换入。</div>
      <div class="note-block"><strong>对手完整配置隐藏</strong>观察战报，逐渐了解对方的战术。</div>
      <div class="note-block"><strong>提前安排，自动对决</strong>你的战斗风格与队伍一起提交。</div>
    </div><div class="panel">${panelTitle("队伍准备")}
      <div class="kv-row"><span>参赛成员</span><strong>6 / 6</strong></div><div class="kv-row"><span>携带道具</span><strong>已配置</strong></div>
      <div class="kv-row"><span>战斗风格</span><strong>已填写</strong></div>${button("前往联盟", 'data-page="league"', "primary")}
    </div></div></div>`;
  }

  function explore() {
    return `<div class="explore-layout"><div><div class="map-scene explore-map">
      <div class="map-location"><small>KANTO · ROUTE 02</small>常青森林</div><div class="map-status">${ui.state === "shortage" ? "补给不足" : "自动探索中"}</div>
      <img class="map-sprite" src="${assets[25].front}" alt="探索中的皮卡丘" style="left:38%;top:39%;width:140px;height:140px">
      <img class="map-sprite" src="${assets[133].front}" alt="探索中的伊布" style="left:50%;top:48%">
      <img class="map-sprite" src="${assets[1].front}" alt="草丛中的妙蛙种子" style="left:77%;top:19%;width:92px;height:92px">
      <div class="map-route-note"><div><strong>林间的脚步声，从未停下。</strong><small>主题属性：草 / 虫 / 电 · 遭遇等级 Lv. 15–30</small></div>
        ${button("调整探索", 'data-modal="explore"', "primary")}</div></div>
      <div class="region-bar"><button class="region-button active" data-toast="正在展示常青森林"><strong>常青森林</strong><small>Lv. 15–30 · 全天开放</small></button>
        <button class="region-button" data-modal="region"><strong>无人坟墓</strong><small>Lv. 1–20 · 幽灵 / 超能 / 妖精</small></button>
        <button class="region-button" data-modal="region"><strong>紫苑镇</strong><small>Lv. 30–50 · 更深的旅途</small></button></div>
      <div class="wide-note">离线期间，按原设置继续探索。遇到心愿单中的宝可梦时，使用允许自动投出的球。</div>
    </div><div class="stack"><div class="panel">${panelTitle("这次远行")}
      <div class="kv-row"><span>探索时间</span><strong>08:16:00</strong></div><div class="kv-row"><span>累计遭遇</span><strong>428 次</strong></div>
      <div class="kv-row"><span>成功捕获</span><strong>12 只</strong></div><div class="kv-row"><span>中心恢复</span><strong>20 分钟</strong></div>
      <div class="supply-row">${icon("ball")}<div><strong>高级球</strong><small>允许自动使用</small></div><span>${ui.state === "shortage" ? "0" : "42"}</span></div>
      <div class="supply-row">${icon("bag")}<div><strong>探索补给</strong><small>离线续航准备</small></div><span>${ui.state === "shortage" ? "0" : "18"}</span></div>
      ${button("准备补给", 'data-modal="supplies"', "small")}</div>
      <div class="panel mint">${panelTitle("捕获心愿单", '<button class="text-link" data-modal="wishlist">编辑</button>')}
        <div class="wish-row">${sprite(147)}<strong>迷你龙</strong><span>1 / 1</span></div>
        <div class="wish-row">${sprite(133)}<strong>伊布</strong><span>2 / 3</span></div>
        <div class="wish-row">${sprite(175)}<strong>波克比</strong><span>0 / 1</span></div>
        <p class="section-note">已达成的目标暂停对应捕获。</p></div>
    </div></div>`;
  }

  function nursery() {
    const complete = ui.state === "complete";
    return `<div class="hatch-layout"><div class="stack"><div class="panel hatch-box">
      ${panelTitle("1 号孵化盒", `<span class="pill ${complete ? "gold" : ""}">${complete ? "全批完成" : "孵化中 · 配置已固定"}</span>`)}
      <div class="egg-slots">${[1, 2, 3, 4, 5].map((slot) => `<div class="egg-slot">${complete ? sprite(172) : icon("egg")}
        <span>${complete ? "新伙伴等待查看" : `EGG 0${slot}`}</span></div>`).join("")}</div>
      <div class="hatch-timer"><div class="tiny-label">${complete ? "A NEW CHAPTER BEGINS" : "UNTIL THE WHOLE BATCH HATCHES"}</div>
        <div class="metric">${complete ? "00 : 00 : 00" : "02 : 18 : 40"}</div><small>${complete ? "五位新伙伴，已经准备好与你见面。" : "全批完成后，一起迎接新的伙伴。"}</small></div>
      ${progress(complete ? "100%" : "72%", "gold")}
      <div class="manager-card">${sprite(219)}<div><strong>本盒主理人 · 熔岩蜗牛</strong><p>火焰身躯 · 温暖地照顾整盒宝可梦蛋</p></div>
        ${button(complete ? "查看新伙伴" : "查看配置", `data-modal="${complete ? "hatch" : "hatchConfig"}"`, "small")}</div>
    </div><div class="panel soft"><div class="row between"><div><h3>2 号孵化盒</h3><p class="small-text muted">空闲 · 可以安排新的配对</p></div>
      ${button("安排配对", 'data-modal="pair"', "primary")}</div></div></div>
    <div class="stack"><div class="panel">${panelTitle("本批来源")}
      <div class="parent-card">${sprite(25)}<div><strong>皮卡丘</strong><div class="muted">亲代 A · 电 / 陆上组</div></div></div>
      <div class="parent-card">${sprite(132)}<div><strong>百变怪</strong><div class="muted">亲代 B · 产蛋已结束</div></div></div>
      <p class="section-note">产蛋与孵化分别进行，本批遗传输入已保存。</p></div>
      <div class="panel mint">${panelTitle("育成屋手记")}
        <div class="note-block"><strong>整盒一起等待</strong>开孵后不再补蛋或替换主理人。</div>
        <div class="note-block"><strong>离线也在成长</strong>回来的时候，看看有谁在等你。</div>
      </div></div></div>`;
  }

  function industry() {
    const tab = ui.tabs.industry || "产业经营";
    if (tab === "我的果园") {
      return `${tabs(["产业经营", "我的果园"], tab)}<div class="orchard-grid">${[
        ["berrytree", "橙橙果树", "可以收获", "成熟的果实 × 12", "100%"],
        ["berrytree", "桃桃果树", "生长中", "距离结果 01:40:00", "62%"],
        ["berrytree", "文柚果树", "生长中", "距离结果 03:20:00", "38%"],
        ["bag", "空闲地块", "等待种植", "选择你需要的树果", "0%"]
      ].map(([assetKey, name, status, note, width]) => `<div class="panel plot-card"><span class="tag">${status}</span>${icon(assetKey)}
        <h3>${name}</h3><p>${note}</p>${progress(width)}<div style="margin-top:20px">${button(status === "等待种植" ? "选择树种" : "查看果树", 'data-modal="orchard"', "small")}</div></div>`).join("")}</div>
        <div class="wide-note">果园位置有限。扩建需要产业材料，让伙伴们的劳动成果变成更多生长的空间。</div>`;
    }
    const facilities = [
      { name: "山麓矿场", kind: "MINING", art: "mine", workers: [74, 95, 68], amount: "240", material: "矿石 / 小时",
        level: "Lv. 3", note: "格斗与岩石伙伴的拿手工作" },
      { name: "林间木场", kind: "LUMBER", art: "lumber", workers: [152, 1, 252], amount: "180", material: "木材 / 小时",
        level: "Lv. 2", note: "草与虫伙伴，把森林照顾得很好" },
      { name: "小镇工坊", kind: "WORKSHOP", art: "workshop", workers: [133, 161, 52], amount: "1,280", material: "金钱 / 小时",
        level: "Lv. 2", note: "每一份努力，都在让小镇变好" }
    ];
    return `${tabs(["产业经营", "我的果园"], tab)}<div class="factory-grid">${facilities.map((item) => `<div class="panel factory-card">
      <div class="facility-portrait"><small>${item.kind}</small>${icon(item.art)}</div><div class="row between"><h2>${item.name}</h2><span class="tag">${item.level}</span></div>
      <div class="metric">${item.amount}<small> ${item.material}</small></div><p>${item.note}</p>
      <div class="worker-row">${item.workers.map((id) => sprite(id)).join("")}<span>岗位 3 / 3</span></div>
      <div class="row between">${button("管理岗位", 'data-modal="workers"', "small primary")}${button("扩建设施", 'data-modal="expand"', "small")}</div>
    </div>`).join("")}</div><div class="wide-note">每一只伙伴都有位置。后备成员的贡献逐渐递减，设施建设决定可用产能。</div>`;
  }

  function trade() {
    const tab = ui.tabs.trade || "心愿交换";
    const publicOffers = [["阿澄", 133, 280, "携带：安抚之铃", "想要：拉鲁拉丝"], ["林间旅人", 147, 131, "携带：神秘水滴", "想要：拉普拉斯"],
      ["小满", 175, 393, "携带：橙橙果", "想要：波加曼"], ["远方来信", 94, 196, "携带：文柚果", "想要：太阳伊布"],
      ["夏日海风", 194, 183, "携带：桃桃果", "想要：玛力露"], ["石桥", 95, 68, "携带：金属膜", "想要：怪力"]];
    const offers = tab === "心愿交换" ? publicOffers : tab === "我的挂单"
      ? [["小叶 · 我的挂单", 133, 280, "携带：安抚之铃", "等待符合心愿的伙伴"]]
      : [["已完成 · 与小满交换", 175, 393, "已交给新的训练家", "已成为你的伙伴"]];
    return `${tabs(["心愿交换", "我的挂单", "交换记录"], tab)}
      <div class="trade-grid">${offers.map(([name, offered, wanted, held, wish]) => `<div class="panel trade-card">
        <div class="trade-person">训练家 · ${name}<span style="float:right">公开交换</span></div>
        <div class="trade-pair"><div>${sprite(offered)}<h3>${assets[String(offered)].name}</h3><small>${held}</small></div>
          <span class="trade-arrow">⇄</span><div>${sprite(wanted)}<h3>${assets[String(wanted)].name}</h3><small>${wish}</small></div></div>
        <div class="row between"><span>宝可梦与持物一起交换</span>${button("查看详情", 'data-modal="trade"', "small")}</div></div>`).join("")}</div>
        ${tab === "心愿交换" ? "" : '<div class="wide-note">查看自己的交换安排，以及已经走向新旅途的伙伴。</div>'}`;
  }

  function league() {
    const tab = ui.tabs.league || "八大道馆";
    if (tab === "重要 NPC") {
      return `${tabs(["八大道馆", "联盟赛程", "重要 NPC"], tab)}<div class="factory-grid">${[
        [445, "竹兰", "神奥联盟冠军", "沉着地观察局势，以稳定的队伍配合掌控节奏。"],
        [149, "阿渡", "龙之训练家", "鲜明的进攻风格，让每一次换入都充满威胁。"],
        [282, "卡露乃", "卡洛斯联盟冠军", "在从容的节奏里，寻找决定胜负的机会。"]]
        .map(([id, name, role, text]) => `<div class="panel factory-card"><div class="facility-portrait">${sprite(id)}</div>
          <span class="tag gold">当季重要 NPC</span><h2 style="margin-top:20px">${name}</h2><p>${role}</p>
          <p style="margin-block:22px">${text}</p>${button("查看挑战", 'data-modal="challenge"', "primary")}</div>`).join("")}</div>
          <div class="wide-note">每个赛季都有新的挑战。研究对手的风格，再安排你的队伍。</div>`;
    }
    if (tab === "联盟赛程") {
      return `${tabs(["八大道馆", "联盟赛程", "重要 NPC"], tab)}<div class="league-layout"><div class="panel">
        ${panelTitle("秋叶杯 · 淘汰赛", '<span class="tag gold">决赛日</span>')}<div class="league-bracket">
          <div class="bracket-column"><div class="bracket-match"><div class="winner">小叶 <b>胜</b></div><div>林间旅人 <span>负</span></div></div>
            <div class="bracket-match"><div>阿澄 <span>负</span></div><div class="winner">小满 <b>胜</b></div></div></div>
          <div class="bracket-column"><div class="bracket-match"><div class="winner">小叶 <b>待开始</b></div><div>小满</div></div></div>
          <div class="bracket-column"><div style="text-align:center">${icon("badge")}<h3 style="margin-top:20px">秋叶杯冠军</h3><p class="small-text muted">等待新故事</p></div></div>
        </div></div><div class="panel mint">${panelTitle("我的报名")}
          <div class="kv-row"><span>参赛编队</span><strong>道馆挑战</strong></div><div class="kv-row"><span>成员</span><strong>6 / 6</strong></div>
          <div class="kv-row"><span>战术</span><strong>已提交</strong></div><div class="kv-row"><span>本轮时间</span><strong>19:30</strong></div>
          <p class="small-text muted" style="margin:23px 0">队伍与风格已固定。你可以稍后回来查看结果。</p>${button("查看参赛配置", 'data-page="team"', "primary")}</div></div>`;
    }
    const gyms = [["小刚", "尼比道馆", 95, "岩石", "01"], ["小霞", "华蓝道馆", 121, "水", "02"],
      ["马志士", "枯叶道馆", 26, "电", "03"], ["莉佳", "玉虹道馆", 45, "草", "04"],
      ["阿桔", "浅红道馆", 169, "毒", "05"], ["娜姿", "金黄道馆", 65, "超能力", "06"],
      ["夏伯", "红莲道馆", 59, "火", "07"], ["坂木", "常青道馆", 112, "地面", "08"]];
    return `${tabs(["八大道馆", "联盟赛程", "重要 NPC"], tab)}<div class="gym-grid">${gyms.map(([name, gym, id, type, number]) =>
      `<div class="panel gym-card"><div class="gym-header"><span>GYM ${number}</span><span class="tag ${typeClasses[type]}">${type}</span></div>
        ${sprite(id)}<h3>${gym}</h3><small>馆主 · ${name} / 队伍详情隐藏</small>${button("发起挑战", 'data-modal="challenge"', "small primary")}</div>`).join("")}</div>`;
  }

  function shop() {
    const tab = ui.tabs.shop || "百货公司";
    const exploration = [["ball", "精灵球", "P 200", "精灵球 · 日常捕获"], ["ball", "超级球", "P 600", "精灵球 · 远行储备"],
      ["ball", "高级球", "P 1,200", "精灵球 · 心愿捕获"], ["ball", "黑暗球", "P 1,000", "精灵球 · 夜间探索"],
      ["bag", "伤药", "P 300", "恢复用品 · 日常补给"], ["bag", "好伤药", "P 700", "恢复用品 · 长途准备"],
      ["bag", "解毒药", "P 100", "状态恢复 · 解除中毒"], ["bag", "解麻药", "P 200", "状态恢复 · 解除麻痹"]];
    const important = [["badge", "雷之石", "P 8,000", "进化道具 · 本期货架"], ["badge", "水之石", "P 8,000", "进化道具 · 本期货架"],
      ["badge", "吃剩的东西", "P 12,000", "携带物 · 持续恢复"], ["badge", "气势披带", "P 12,000", "携带物 · 关键保护"],
      ["badge", "生命宝珠", "P 16,000", "携带物 · 攻击强化"], ["badge", "技能机 · 守住", "P 10,000", "技能机 · 首次习得"],
      ["badge", "技能机 · 十万伏特", "P 18,000", "技能机 · 首次习得"], ["badge", "技能机 · 岩崩", "P 15,000", "技能机 · 首次习得"]];
    const owned = [["ball", "精灵球", "持有 × 126", "基础捕获用品"], ["ball", "高级球", "持有 × 48", "未携入探索的库存"],
      ["bag", "探索补给", "持有 × 32", "为下一次远行准备"], ["badge", "道具自选礼包", "持有 × 1", "尚未选择奖励"]];
    const gifts = [["badge", "高级道具自选礼包", "查看可选内容", "免费通行证 · Lv. 12"],
      ["bag", "研究里程碑礼包", "查看获得条件", "博士 · 图鉴里程碑"]];
    const storeGoods = ui.shopCategory === "探索道具" ? exploration : important;
    const visibleGoods = tab === "百货公司" ? storeGoods : tab === "我的背包" ? owned : gifts;
    const categoryTabs = `<div class="shop-categories" role="group" aria-label="百货商品分类">${["探索道具", "重要道具"].map((category) =>
      `<button class="shop-category ${ui.shopCategory === category ? "active" : ""}" data-shop-category="${category}"
        aria-pressed="${ui.shopCategory === category}">${category}<small>${category === "探索道具" ? "精灵球 / 恢复与补给" : "进化道具 / 携带物 / 技能机"}</small></button>`).join("")}</div>`;
    const shelfNote = tab !== "百货公司" ? "出发前检查库存，为下一次冒险做好准备。"
      : ui.shopCategory === "探索道具" ? "探索常备 · 捕获与恢复用品" : "重要道具 · 本期进化道具、携带物与技能机";
    return `${tabs(["百货公司", "我的背包", "礼包与道具"], tab)}<div class="shop-layout"><div>
      ${tab === "百货公司" ? categoryTabs : ""}
      <div class="shop-grid">${visibleGoods.map(([key, name, price, note]) => `<div class="panel shop-card">${icon(key)}<strong>${name}</strong>
        <small>${note}</small>${button(price, `data-modal="${tab === "礼包与道具" ? "reward" : "shop"}"`, "small")}</div>`).join("")}</div>
      <div class="panel inventory-summary"><div class="row between"><span class="small-text">${shelfNote}</span>
        ${tab === "百货公司" ? '<span class="tiny-label">REFRESH 03 : 24 : 00</span>' : ""}</div></div>
    </div><div class="stack"><div class="panel mint">${panelTitle("我的背包")}
      <div class="supply-row">${icon("ball")}<div><strong>精灵球</strong><small>背包库存</small></div><span>126</span></div>
      <div class="supply-row">${icon("ball")}<div><strong>高级球</strong><small>探索中另有携带</small></div><span>48</span></div>
      <div class="supply-row">${icon("bag")}<div><strong>恢复补给</strong><small>下一次远行准备</small></div><span>32</span></div>
      <div class="supply-row">${icon("badge")}<div><strong>自选礼包</strong><small>有一份待查看</small></div><span>1</span></div>
      ${button("查看礼包", 'data-modal="reward"', "primary small")}</div>
      <div class="panel soft"><h3>百货小贴士</h3><p class="small-text muted" style="margin-top:12px">探索补给与队伍培养分开准备。重要道具货架可查看进化道具、携带物和技能机。</p></div></div></div>`;
  }

  function growth() {
    const tab = ui.tabs.growth || "成长机构";
    const institutions = [
      [1, "博士的研究", "图鉴收集", "128 / 150", "85%", "发现不同的伙伴，补全自己的图鉴。"],
      [52, "市委的委托", "小镇建设", "3 / 5", "60%", "开拓产业，给每一只伙伴一个位置。"],
      [448, "联盟的认可", "高级战斗", "8 / 10", "80%", "用配合与战术，留下属于你的成绩。"]
    ];
    const institutionView = `<div class="institution-grid">${institutions.map(([id, name, task, value, width, note]) => `<div class="panel institution-card">
        <div class="row">${sprite(id)}<div><h2>${name}</h2><p class="small-text muted" style="margin-top:8px">${note}</p></div></div>
        ${progress(width)}<div class="row between small-text"><span>${task}</span><strong>${value}</strong></div>
        ${button("查看里程碑", 'data-modal="milestone"', "small")}</div>`).join("")}</div>`;
    const passView = `<div class="panel pass-panel">${panelTitle("秋叶赛季 · 免费通行证", '<div class="row"><span class="tag gold">全部免费</span><span class="metric">Lv. 12</span></div>')}
        <div class="row between small-text muted"><span>下一站，也有新的收获。</span><span>赛季历程 · 12 / 30</span></div>
        <div class="pass-track">${[8, 10, 12, 15, 20, 30].map((level, index) => `<button class="pass-node ${level === 12 ? "current" : ""}" data-modal="reward">
          <strong>Lv. ${level}</strong>${icon(index % 2 ? "badge" : "bag")}<small>${level < 12 ? "已领取" : level === 12 ? "可查看奖励" : "旅途中解锁"}</small></button>`).join("")}</div>
      </div>`;
    const honorsView = `<div class="institution-grid">${["尼比道馆徽章", "秋叶新秀", "博士研究助手"].map((name) =>
      `<div class="panel plot-card">${icon("badge")}<h2 style="margin:30px 0 18px">${name}</h2>
        <p class="small-text muted">把值得纪念的成长，留在训练家档案里。</p><div style="margin-top:24px">${button("外显预览", 'data-modal="reward"', "small")}</div></div>`).join("")}</div>
        <div class="wide-note">馆主身份、称号、徽章与历史成绩，是重要战斗带来的外显收获。</div>`;
    return tabs(["成长机构", "免费通行证", "赛季荣誉"], tab)
      + (tab === "成长机构" ? institutionView + passView : tab === "免费通行证" ? passView : honorsView);
  }

  function logs() {
    const logEntries = [
      ["battle", 95, "尼比道馆 · 挑战获胜", "07:40 · 12 回合结束"],
      ["catch", 147, "发现新伙伴 · 迷你龙", "01:36 · 心愿捕获成功"],
      ["hatch", 172, "1 号盒 · 新生命的消息", "06:18 · 育成屋"],
      ["industry", 68, "山麓矿场 · 生产汇总", "04:25 · 经营手记"]
    ];
    let detail;
    if (ui.log === "battle") {
      detail = `<div class="panel">${panelTitle("尼比道馆挑战", '<span class="tag gold">挑战获胜</span>')}
        <div class="battle-stage"><div class="battle-label" style="left:20px;top:20px">我方 · 六位伙伴</div>
          <div class="battle-label" style="right:20px;bottom:20px">对手 · 尼比道馆</div>
          <img class="sprite" src="${assets[25].back}" alt="我方皮卡丘背面" style="left:9%;top:44%">
          <img class="sprite" src="${assets[448].back}" alt="我方路卡利欧背面" style="left:28%;top:50%">
          <img class="sprite" src="${assets[95].front}" alt="对方大岩蛇" style="right:14%;top:4%">
          <img class="sprite" src="${assets[74].front}" alt="对方小拳石" style="right:34%;top:8%"></div>
        <div class="turn-line"><span>TURN 01</span><div><strong>皮卡丘</strong> 使用辅助招式，帮助我方建立速度优势。</div></div>
        <div class="turn-line"><span>TURN 02</span><div><strong>路卡利欧</strong> 集中攻击对方前排，造成伤害。</div></div>
        <div class="turn-line"><span>TURN 03</span><div><strong>我方队伍</strong> 调整站位，保护关键输出。</div></div>
        <div class="turn-line"><span>TURN 12</span><div>对方最后一只宝可梦失去战斗能力，<strong>挑战结束。</strong></div></div>
        <p class="section-note">回顾关键回合，找到下一次配合可以改进的地方。</p></div>`;
    } else {
      const item = logEntries.find((entry) => entry[0] === ui.log);
      detail = `<div class="panel">${panelTitle(item[2], '<span class="tag">重要事件</span>')}
        <div class="detail-portrait" style="height:360px">${sprite(item[1])}</div>
        <h2 style="margin:24px 0 15px">旅途中，又多了一段值得记住的故事。</h2>
        <p class="small-text muted">发生时间、来源、获得内容与下一步操作在这里集中展示。普通探索事件合并汇总，重要收获单独保留。</p>
        <div style="margin-top:28px">${button("查看相关页面", `data-page="${ui.log === "catch" ? "dex" : ui.log === "hatch" ? "nursery" : "industry"}"`, "primary")}</div></div>`;
    }
    const tab = ui.tabs.logs || "全部日志";
    const shownLogs = tab === "战斗" ? [logEntries[0]] : tab === "稀有收获" ? [logEntries[1], logEntries[2]] : logEntries;
    return `<div class="log-layout"><div>${tabs(["全部日志", "战斗", "稀有收获"], tab)}
      ${shownLogs.map(([key, id, name, time]) => `<button class="log-item ${ui.log === key ? "active" : ""}" data-log="${key}">
        ${sprite(id)}<div><strong>${name}</strong><small>${time}</small></div></button>`).join("")}
      <div class="panel soft small-text muted" style="margin-top:22px">优先记录稀有收获、关键比赛与影响效率的重要事件。</div></div>${detail}</div>`;
  }

  const renderers = { overview, dex, team, explore, nursery, industry, trade, league, shop, growth, logs };
  const subtitles = {
    overview: "欢迎回来，小叶。", dex: "和每一位伙伴重新认识。", team: "默契，从出发前开始。",
    explore: "世界正在继续展开。", nursery: "新的相遇，值得等待。", industry: "每一只，都有自己的位置。",
    trade: "让心愿在这里相遇。", league: "向下一枚徽章出发。", shop: "把下一次远行准备好。",
    growth: "把成长，慢慢收进图鉴。", logs: "那些不该错过的时刻。"
  };

  function emptyState() {
    return `<div class="panel empty-state">${sprite(133)}<h2>新的故事，还在路上。</h2>
      <p>这里展示此页面的首次使用状态。完成准备后，将在这里看到伙伴与旅途的记录。</p>
      ${button("查看常规样例", 'data-action="normal"', "primary")}</div>`;
  }

  function render() {
    const page = pages.find((item) => item.id === ui.page);
    const availableStates = ["normal", ...(specialStates[ui.page] ? [specialStates[ui.page]] : []), "empty"];
    if (!availableStates.includes(ui.state)) ui.state = "normal";
    document.querySelector("#state-picker").innerHTML = availableStates.map((state) =>
      `<option value="${state}">${stateLabels[state]}</option>`).join("");
    document.querySelector("#state-picker").value = ui.state;
    document.querySelectorAll(".nav-button").forEach((item) => item.classList.toggle("active", item.dataset.page === ui.page));
    document.querySelector("#page-picker").value = ui.page;
    document.querySelector("#footer-hint").textContent = page.hint;
    content.dataset.demoState = ui.state;
    content.innerHTML = title(page, subtitles[page.id], '<span class="pill">秋叶赛季 · 旅途进行中</span>')
      + (ui.state === "empty" ? emptyState() : renderers[ui.page]());
  }

  function navigate(page) {
    if (!renderers[page]) return;
    closeModal();
    ui.page = page;
    window.history.replaceState(null, "", `#${page}`);
    render();
  }

  function modalContent(kind, id, previewText = "") {
    const chosen = id || ui.selected;
    if (kind === "pokemon") {
      return { title: "伙伴档案", body: `<div class="detail-portrait">${sprite(chosen)}</div>
        <div class="row between"><h2>${assets[String(chosen)].name} · Lv. ${levels[chosen] || 24}</h2><div>${types(chosen)}</div></div>
        <div class="info-pairs"><div><span>相遇地点</span>旅途之中</div><div><span>性格</span>爽朗</div>
          <div><span>亲密度</span>友好</div><div><span>身份</span>新的伙伴</div></div>
        <p>一位新的伙伴，一种新的可能。可以在图鉴中查看培养、招式与进化信息。</p>`,
        footer: button("前往图鉴", 'data-page="dex"', "primary") };
    }
    if (kind === "members" || kind === "workers" || kind === "pair") {
      return { title: kind === "pair" ? "选择配对伙伴" : kind === "workers" ? "岗位成员" : "选择队伍伙伴",
        body: `<p style="margin-bottom:20px">成员卡显示等级、属性和当前占用状态。</p>
          <div class="modal-grid">${party.map((pid) => pokemonCard(pid, `data-modal="pokemon" data-id="${pid}"`)).join("")}</div>`,
        footer: button("返回", 'data-action="close"') };
    }
    if (kind === "tactic") {
      return { title: "战斗风格预览", body: `<div class="modal-reward">${icon("badge")}
        <div><h3>六位伙伴的作战安排</h3><p class="small-text muted">这次准备使用的战斗风格</p></div></div>
        <div class="tactic-preview">${escapeHtml(previewText || "尚未填写战斗风格。")}</div>
        <p style="margin-top:20px">出发之前，再检查一次你的安排。</p>`,
        footer: button("返回编辑", 'data-action="close"', "primary") };
    }
    const fixtures = {
      training: ["培养配置", "badge", "努力值收集器", "训练点 1,280 · 自行分配到六项属性", "不同的培养方向，让伙伴在队伍中承担不同的职责。分配之前，先想一想它最擅长什么。"],
      moves: ["招式与进化", "badge", "把培养成果留给下一段旅途", "招式库 / 当前四个招式位 / 可进化资格", "查看已掌握的招式，选择当前作战配置。满足进化条件后，可以在准备好时再点击进化。"],
      tactic: ["战斗风格预览", "badge", "准备与伙伴并肩作战", "六只全员参战 · 同时在场两只", "这里展示提交确认的样式。当前文本只用于视觉走查，不会提交模型或启动比赛。"],
      supplies: ["准备远行物资", "bag", "把背包装好，再次出发", "精灵球 / 恢复用品 / 自动使用设置", "为远行选择合适的球与恢复用品。别忘了为下一次特别的相遇留一点库存。"],
      wishlist: ["捕获心愿单", "ball", "想见的伙伴，记在心里", "物种 / 目标数量 / 球策略 / 保留库存", "设置想遇见的伙伴、目标数量和允许使用的球。达成目标后，将暂停对应的自动捕获。"],
      explore: ["探索安排", "bag", "前往常青森林", "主力探索队 · Lv. 15–30 地区", "离线期间，伙伴们会继续按既定安排探索。出发之前，记得检查队伍与携带物资。"],
      region: ["地区档案", "ball", "前往更远的地方", "地区主题 / 等级范围 / 限定时段", "了解这里的主题属性、遭遇等级和特殊时段，选择适合当前队伍的路线。"],
      hatch: ["育成屋的新消息", "egg", "新的伙伴们，正在等你", "1 号盒 · 本批全部完成", "这批蛋都已经孵化完成。新的伙伴正在育成屋里，期待你来开启下一段旅程。"],
      hatchConfig: ["本批孵化配置", "egg", "温暖的照顾，安静的等待", "主理人：熔岩蜗牛 · 火焰身躯", "本批条件在开孵时固定。整批结束之前，让主理人安心照顾每一枚蛋。"],
      expand: ["设施扩建预览", "bag", "为伙伴们留出更多位置", "金钱 P 12,000 / 木材 × 120 / 矿石 × 80", "设施扩建需要上列资源。增加岗位，让更多伙伴找到适合自己的工作。"],
      orchard: ["果园手记", "bag", "从一颗树果，到一片小小果园", "树种 / 生长阶段 / 产出 / 改种", "选择树种，留意生长阶段与结果时间。在有限的地块里，为下一次远行准备树果。"],
      trade: ["心愿交换确认", "ball", "一段旅途，交到另一位训练家手中", "提供的宝可梦与携带道具一起交换", "请核对双方成员和携带道具。交换完成后，宝可梦与持物将一起走向新的训练家。"],
      challenge: ["道馆挑战准备", "badge", "向下一枚徽章出发", "已选编队：道馆挑战 / 6 位成员", "确认编队和战斗风格。对方完整的队伍配置，需要在战斗中逐渐了解。"],
      shop: ["商品详情", "bag", "下一次远行的准备", "效果说明 / 价格 / 库存 / 购买数量", "先回背包检查已有库存，再决定下一次远行需要补充哪些用品。"],
      reward: ["一份属于旅途的礼物", "badge", "高级道具自选礼包", "免费通行证 · 等级节点奖励", "查看可以选择的道具，找到最适合当前队伍的培养方向。"],
      milestone: ["成长里程碑", "badge", "每一步，都值得被记录", "收集 / 建设 / 高级战斗", "收集图鉴、发展产业、参加高级战斗，向博士、市委和联盟展示你的新进展。"]
    };
    const [heading, assetKey, name, note, text] = fixtures[kind] || fixtures.reward;
    return { title: heading, body: `<div class="modal-reward">${icon(assetKey)}<div><h3>${name}</h3><p class="small-text muted">${note}</p></div></div><p>${text}</p>`,
      footer: button("返回浏览", 'data-action="close"') + button("知道了", 'data-action="close"', "primary") };
  }

  function openModal(kind, id) {
    if (kind === "pokemon" && id) ui.selected = id;
    const previewText = kind === "tactic" ? content.querySelector("textarea")?.value || "" : "";
    const info = modalContent(kind, id, previewText);
    previousFocus = document.activeElement;
    modalLayer.innerHTML = `<section class="modal-window" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><h2 id="modal-title">${escapeHtml(info.title)}</h2><button class="modal-close" data-action="close" aria-label="关闭弹窗">X</button></div>
      <div class="modal-body">${info.body}</div><div class="modal-footer">${info.footer}</div></section>`;
    modalLayer.hidden = false;
    modalLayer.querySelector("button")?.focus();
  }

  function closeModal() {
    if (modalLayer.hidden) return;
    modalLayer.hidden = true;
    previousFocus?.focus();
  }

  function toast(message) {
    const node = document.querySelector("#toast");
    clearTimeout(toastTimer);
    node.textContent = message;
    node.hidden = false;
    toastTimer = setTimeout(() => { node.hidden = true; }, 2400);
  }

  function resize() {
    const scale = Math.min((window.innerWidth - 28) / 1920, (window.innerHeight - 80) / 1080);
    const safeScale = Math.max(.15, scale);
    document.querySelector("#screen").style.transform = `scale(${safeScale})`;
    document.querySelector("#stage-wrap").style.width = `${1920 * safeScale}px`;
    document.querySelector("#stage-wrap").style.height = `${1080 * safeScale}px`;
  }

  document.querySelector("#navigation").innerHTML = pages.map((page, index) => `<button class="nav-button"
    data-page="${page.id}"><span class="nav-no">${String(index + 1).padStart(2, "0")}</span><span>${page.name}</span><span class="nav-arrow">&gt;</span></button>`).join("");
  document.querySelector("#page-picker").innerHTML = pages.map((page) => `<option value="${page.id}">${page.name}</option>`).join("");
  document.querySelector("#page-picker").addEventListener("change", (event) => navigate(event.target.value));
  document.querySelector("#state-picker").addEventListener("change", (event) => { ui.state = event.target.value; render(); });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) {
      if (event.target === modalLayer) closeModal();
      return;
    }
    if (target.dataset.page) navigate(target.dataset.page);
    else if (target.dataset.dex) { ui.selected = Number(target.dataset.dex); render(); }
    else if (target.dataset.modal) openModal(target.dataset.modal, Number(target.dataset.id) || undefined);
    else if (target.dataset.shopCategory) { ui.shopCategory = target.dataset.shopCategory; render(); }
    else if (target.dataset.tab) {
      ui.tabs[ui.page] = target.dataset.tab;
      if (ui.page === "dex" && !dexGroups[target.dataset.tab].includes(ui.selected)) {
        ui.selected = dexGroups[target.dataset.tab][0];
      }
      if (ui.page === "logs") ui.log = target.dataset.tab === "稀有收获" ? "catch" : "battle";
      render();
    }
    else if (target.dataset.log) { ui.log = target.dataset.log; render(); }
    else if (target.dataset.toast) toast(target.dataset.toast);
    else if (target.dataset.action === "close") closeModal();
    else if (target.dataset.action === "normal") {
      ui.state = "normal";
      document.querySelector("#state-picker").value = "normal";
      render();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
    if (event.key === "Tab" && !modalLayer.hidden) {
      const controls = Array.from(modalLayer.querySelectorAll("button:not(:disabled), input, textarea, select"));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener("resize", resize);
  const initialPage = window.location.hash.slice(1);
  if (renderers[initialPage]) ui.page = initialPage;
  render();
  resize();
})();
