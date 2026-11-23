const id = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const unknownNames = {
  species: '未知宝可梦',
  moves: '未知招式',
  abilities: '未知特性',
  items: '未知道具',
  natures: '未知性格',
  types: '未知属性'
};
export function displayName(names, kind, value) {
  if (!value) return '';
  return names?.[kind]?.[id(value)] ?? (/[\u3400-\u9fff]/.test(value) ? value : (unknownNames[kind] ?? '未知内容'));
}
export function findSpecies(entries, query, limit = 12) {
  const value = String(query).trim();
  if (!value) return [];
  const numeric = /^#?\d+$/.test(value) ? Number(value.replace('#', '')) : null;
  return entries
    .filter((entry) =>
      numeric !== null ? entry.number === numeric : entry.name.includes(value) || entry.key.includes(value.toLowerCase())
    )
    .sort((a, b) => Number(b.number === numeric) - Number(a.number === numeric) || a.number - b.number)
    .slice(0, limit);
}
const stats = {hp: '生命值', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', accuracy: '命中', evasion: '闪避'};
const statuses = {par: '麻痹', brn: '灼伤', psn: '中毒', tox: '剧毒', slp: '睡眠', frz: '冰冻', fnt: '失去战斗能力'};
export const statNames = stats;
export function battleOutcome(b) {
  if (b.status === 'error') return {label: '执行异常', detail: '本场未判为玩家失败，席位未变更。', tone: 'neutral'};
  if (b.status !== 'completed')
    return {label: b.status === 'running' ? '对战中' : '等待开赛', detail: '结果尚未产生，席位尚未结算。', tone: 'neutral'};
  if (b.stale) return {label: '席位结算已失效', detail: '该场比赛的赛季或席位版本已变化，未据此转移席位。', tone: 'neutral'};
  if (!b.winnerSide) return {label: '双方战平', detail: '本场无人取得胜利，席位未变更。', tone: 'neutral'};
  const won = b.winnerSide === b.viewerSide;
  return {
    label: b.viewerSide === 'p2' ? (won ? '防守成功' : '防守失利') : won ? '挑战获胜' : '挑战未获胜',
    detail: b.winnerSide === 'p1' ? '本场挑战方获胜，席位在本场结束时由挑战者接任。' : '本场防守方获胜，原馆主保留席位。',
    tone: won ? 'win' : 'loss'
  };
}
export function battleLines(events, names) {
  const lines = [];
  const pokemon = (raw) => {
    const match = /^(p[12])[a-z]?:\s*(.+)$/.exec(raw ?? '');
    return match
      ? `${match[1] === 'p1' ? '挑战方' : '防守方'}的${displayName(names, 'species', match[2])}`
      : displayName(names, 'species', String(raw ?? '').split(',')[0]);
  };
  const effect = (raw) => {
    const value = String(raw ?? '').replace(/^\[from\]\s*/, '');
    if (/^ability:/i.test(value)) return `特性「${displayName(names, 'abilities', value.slice(8).trim())}」`;
    if (/^item:/i.test(value)) return `道具「${displayName(names, 'items', value.slice(5).trim())}」`;
    const move = value.replace(/^move:\s*/i, '');
    return statuses[move] ?? displayName(names, 'moves', move);
  };
  const health = (value) =>
    String(value ?? '')
      .split(' ')
      .map((part) => statuses[part] ?? (/^[0-9/]+$/.test(part) ? part : ''))
      .filter(Boolean)
      .join('，');
  for (const event of events ?? []) {
    const [, kind, a, b, c] = event.split('|');
    let text = '';
    if (kind === 'turn') text = `第 ${a} 回合`;
    else if (['switch', 'drag', 'replace'].includes(kind)) text = `${pokemon(a)}上场，生命值${health(c)}。`;
    else if (kind === 'move') text = `${pokemon(a)}使用「${displayName(names, 'moves', b)}」${c ? `，目标：${pokemon(c)}` : ''}。`;
    else if (kind === '-damage') text = `${pokemon(a)}受到伤害，剩余生命值${health(b)}。`;
    else if (kind === '-heal') text = `${pokemon(a)}回复生命值，当前${health(b)}。`;
    else if (kind === 'faint') text = `${pokemon(a)}失去战斗能力。`;
    else if (kind === '-status') text = `${pokemon(a)}陷入${statuses[b] ?? '异常'}状态。`;
    else if (kind === '-curestatus') text = `${pokemon(a)}解除${statuses[b] ?? '异常'}状态。`;
    else if (kind === '-ability') text = `${pokemon(a)}发动特性「${displayName(names, 'abilities', b)}」。`;
    else if (kind === '-item') text = `${pokemon(a)}获得道具「${displayName(names, 'items', b)}」。`;
    else if (kind === '-enditem') text = `${pokemon(a)}的道具「${displayName(names, 'items', b)}」已消耗或失去。`;
    else if (kind === '-mega') text = `${pokemon(a)}借助${displayName(names, 'items', c)}完成超级进化！`;
    else if (kind === '-formechange' || kind === 'detailschange') text = `${pokemon(a)}改变了形态。`;
    else if (kind === 'cant') text = `${pokemon(a)}因${effect(b)}无法行动。`;
    else if (kind === '-boost' || kind === '-unboost')
      text = `${pokemon(a)}的${stats[b] ?? '能力'}${kind === '-boost' ? '提高' : '降低'}${c}级。`;
    else if (kind === '-crit') text = `${pokemon(a)}被击中要害！`;
    else if (kind === '-supereffective') text = `对${pokemon(a)}效果绝佳！`;
    else if (kind === '-resisted') text = `对${pokemon(a)}效果不理想。`;
    else if (kind === '-immune') text = `${pokemon(a)}不受该效果影响。`;
    else if (kind === '-miss') text = `${pokemon(a)}的攻击未命中。`;
    else if (kind === '-fail') text = `${pokemon(a)}的行动未生效。`;
    else if (kind === '-activate' || kind === '-start' || kind === '-end')
      text = `${pokemon(a)}的${effect(b)}效果${kind === '-end' ? '结束' : '触发'}。`;
    else if (kind === '-weather') {
      const weather = {
        RainDance: '下雨',
        SunnyDay: '大晴天',
        Sandstorm: '沙暴',
        Snow: '下雪',
        Hail: '冰雹',
        PrimordialSea: '大雨',
        DesolateLand: '大日照',
        DeltaStream: '乱流',
        none: '恢复正常'
      };
      text = `天气${weather[a] === '恢复正常' ? '' : '变为'}${weather[a] ?? '发生变化'}。`;
    } else if (kind === '-fieldstart' || kind === '-fieldend') text = `场地「${effect(a)}」${kind === '-fieldstart' ? '生效' : '结束'}。`;
    else if (kind === '-sidestart' || kind === '-sideend')
      text = `${String(a).startsWith('p1') ? '挑战方' : '防守方'}的「${effect(b)}」${kind === '-sidestart' ? '生效' : '结束'}。`;
    else if (kind === 'win') text = '本场战斗已分出胜负。';
    else if (kind === 'tie') text = '双方战平。';
    if (text) lines.push(text);
  }
  return lines;
}
