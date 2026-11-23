const party = document.querySelector('#party');
const start = document.querySelector('#start');
const report = document.querySelector('#report');
const status = document.querySelector('#status');
const summary = document.querySelector('#summary');
const names = {
  leftovers: '吃剩的东西', lifeorb: '生命宝珠', focussash: '气势披带', sitrusberry: '文柚果',
  hugepower: '大力士', intimidate: '威吓', unseenfist: '无形拳', raindance: '雨天', electricterrain: '电气场地', tailwind: '顺风'
};

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

function eventText(line) {
  const [, kind, ...parts] = line.split('|');
  const who = value => value?.replace(/^p1[a-z]?: /, '我方 · ').replace(/^p2[a-z]?: /, '对方 · ');
  switch (kind) {
    case 'turn': return [`第 ${parts[0]} 回合`, 'turn'];
    case 'move': return [`${who(parts[0])} 使用 ${parts[1]} → ${who(parts[2]) || '场上'}`, ''];
    case 'switch': case 'drag': return [`${who(parts[0])} 登场 · ${parts[1]}`, ''];
    case '-damage': return [`${who(parts[0])} 受到伤害，剩余 ${parts[1]}`, ''];
    case '-heal': return [`${who(parts[0])} 恢复，当前 ${parts[1]}`, ''];
    case '-mega': return [`${who(parts[0])} 进行了 Mega 进化！`, 'turn'];
    case 'faint': return [`${who(parts[0])} 失去战斗能力`, ''];
    case '-weather': return [`天气变化：${parts.join(' · ')}`, ''];
    case '-ability': return [`${who(parts[0])} 的特性 ${parts[1]} 发动`, ''];
    case '-enditem': return [`${who(parts[0])} 的 ${parts[1]} 被消耗或失去`, ''];
    case 'win': return [`${parts[0]} 获胜`, 'turn'];
    case 'tie': return ['本场平局', 'turn'];
    default: return [line, 'raw'];
  }
}

function showEvents(lines) {
  report.replaceChildren();
  for (const line of lines.filter(value => value && !value.startsWith('|t:|'))) {
    const [text, style] = eventText(line);
    const row = document.createElement('div');
    row.className = `event ${style}`;
    row.textContent = text;
    report.append(row);
  }
}

start.addEventListener('click', async () => {
  start.disabled = true;
  summary.hidden = true;
  status.textContent = '服务器正在执行…';
  report.textContent = '双方固定策略正在决策，战斗由原版规则引擎执行。';
  try {
    const job = await api('/api/battles', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    history.replaceState(null, '', `#${job.id}`);
    let battle;
    do {
      battle = await api(`/api/battles/${job.id}`);
      if (battle.status === 'queued' || battle.status === 'running') await new Promise(resolve => setTimeout(resolve, 400));
    } while (battle.status === 'queued' || battle.status === 'running');
    if (battle.status === 'error') throw new Error(battle.error);
    status.textContent = '战斗完成 · 固定策略';
    summary.hidden = false;
    summary.textContent = `${battle.winner || '双方平局'} · ${battle.turns} 回合 · ${battle.decisionCount} 次阵营选择`;
    showEvents(battle.events);
  } catch (error) {
    status.textContent = '执行未完成';
    report.textContent = error.message;
  } finally {
    start.disabled = false;
    start.textContent = '再进行一场挑战';
  }
});

try {
  const data = await api('/api/lab');
  for (const member of data.party) {
    const card = document.createElement('div');
    card.className = 'member';
    if (member.image) {
      const image = document.createElement('img');
      image.src = `/${member.image}`;
      image.alt = member.name;
      card.append(image);
    }
    const name = document.createElement('strong');
    name.textContent = member.name;
    const detail = document.createElement('p');
    detail.textContent = `Lv. ${member.level} · ${member.item}`;
    card.append(name, detail);
    party.append(card);
  }
  for (const effect of data.effects.effects) {
    const row = document.createElement('div');
    row.className = 'effect';
    row.textContent = names[effect.engineId] || effect.engineId;
    const label = document.createElement('span');
    label.textContent = effect.parameters ? `配置参数 ${effect.parameters.numerator} / ${effect.parameters.denominator}` : '继承当前版本原版实现';
    row.append(label);
    document.querySelector('#effects').append(row);
  }
  start.disabled = false;
  start.textContent = '发起测试挑战';
} catch (error) {
  status.textContent = '后端连接失败';
  report.textContent = error.message;
}
