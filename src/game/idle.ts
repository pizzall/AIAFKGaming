import {Engine} from '../battle/engine.ts';
import {chooseFromRequest, battleFormat} from '../battle/runner.ts';
import {battleMember, dex, experienceAt, gameConfig as cfg, heal, makePartner, random, refreshPartner} from './catalog.ts';
import {sourceSpecies, sourceVariant} from './catalog.ts';
import type {Partner, PlayerState} from './types.ts';
import {healingAmount, takeSupply} from './supplies.ts';

export function log(player: PlayerState, at: number, kind: string, message: string): void {
  player.logs.push({at, kind, message});
  if (player.logs.length > 150) player.logs.splice(0, player.logs.length - 150);
}

export function occupation(player: PlayerState, id: string, ignoreReady = false): string | null {
  if (player.exploration?.team.includes(id)) return player.exploration.recoveryUntil ? '恢复中' : '探索中';
  if (player.centerUntil && player.centerTeam?.includes(id)) return '恢复中';
  if (player.facilities.some((value) => value.workers.includes(id))) return '工作中';
  if (player.nursery.phase === 'producing' && player.nursery.parents.includes(id)) return '配对中';
  if (player.nursery.phase === 'hatching' && player.nursery.manager === id) return '孵化主理人';
  if (!ignoreReady && player.readyPresetId && player.team.includes(id)) return '备战中';
  return null;
}
export const occupied = (player: PlayerState, id: string, ignoreReady = false): boolean => !!occupation(player, id, ignoreReady);

export function recoveryDuration(team: Partner[]): number {
  const maximum = team.reduce((sum, partner) => sum + partner.maxHp, 0);
  const missing = team.reduce((sum, partner) => sum + partner.maxHp - Math.max(0, Math.min(partner.hp, partner.maxHp)), 0);
  return maximum > 0 ? Math.ceil((cfg.recoverySeconds * missing) / maximum) : 0;
}

function fight(player: PlayerState, team: Partner[], wild: Partner): boolean {
  for (const partner of team) {
    // Exploration carries only HP between encounters. PP and ailments belong to this encounter alone.
    partner.status = '';
    for (const move of new Set([...partner.learnedMoves, ...partner.moves])) partner.pp[move] = dex.moves.get(move).pp;
    if (partner.hp > 0 && partner.hp < partner.maxHp / 2) {
      const medicine = ['potion', 'oranberry', 'sitrusberry'].find((key) => takeSupply(player, key));
      if (medicine) partner.hp = Math.min(partner.maxHp, partner.hp + healingAmount(medicine, partner.maxHp));
    }
  }
  const alive = team.filter((value) => value.hp > 0);
  if (!alive.length) return false;
  const lead = alive[0];
  const simpleAbilities = ['runaway', 'keeneye', 'shielddust', 'tangledfeet'];
  const safeMoves = ['tackle', 'scratch', 'pound', 'quickattack', 'ember', 'watergun', 'vinewhip', 'bite', 'gust', 'peck'];
  const simpleOwnAbilities = [...simpleAbilities, 'overgrow', 'blaze', 'torrent', 'swarm'];
  const usableMove = lead.moves.find(
    (move) => safeMoves.includes(dex.moves.get(move).id) && dex.getImmunity(dex.moves.get(move).type, dex.species.get(wild.species))
  );
  if (
    lead.level >= wild.level + 15 &&
    !lead.heldItem &&
    !lead.status &&
    lead.hp > lead.maxHp / 3 &&
    simpleAbilities.includes(dex.abilities.get(wild.ability).id) &&
    simpleOwnAbilities.includes(dex.abilities.get(lead.ability).id) &&
    usableMove
  ) {
    lead.hp = Math.max(1, lead.hp - Math.floor(random(player) * 3));
    return true;
  }
  const format = new Engine.Format({
    id: 'afkexploration',
    name: 'AFK ordinary exploration',
    effectType: 'Format',
    mod: battleFormat().mod,
    gameType: 'singles',
    ruleset: ['Dynamax Clause', 'Terastal Clause', 'Z-Move Clause'],
    onBegin(this: any) {
      for (let i = 0; i < alive.length; i++) {
        const pokemon = this.p1.pokemon[i];
        const saved = alive[i];
        pokemon.hp = Math.min(pokemon.maxhp, saved.hp);
      }
    }
  });
  const seed = Array.from({length: 4}, () => Math.floor(random(player) * 65536));
  const battle = new Engine.Battle({format, seed});
  battle.setPlayer('p1', {name: 'Explorer', team: alive.map((partner, index) => ({...battleMember(partner), name: `idle${index}`}))});
  battle.setPlayer('p2', {name: 'Wild', team: [battleMember(wild)]});
  for (let step = 0; !battle.ended && step < 400; step++) {
    const choices = battle.sides
      .map((side: any) => structuredClone(side.activeRequest))
      .map((request: any) => (request ? chooseFromRequest(request) : ''));
    for (let i = 0; i < 2; i++) {
      if (choices[i] && !battle.sides[i].choose(choices[i])) throw new Error(`Exploration action: ${battle.sides[i].choice.error}`);
    }
    battle.commitChoices();
  }
  for (const pokemon of battle.p1.pokemon) {
    // Side order changes on switches; the original nickname preserves identity, including duplicate species.
    const target = alive[Number(pokemon.set.name.slice(4))];
    if (!target) continue;
    target.hp = pokemon.hp;
    target.heldItem = pokemon.item;
  }
  return battle.ended && battle.winner === battle.p1.name;
}

function encounter(player: PlayerState, at: number): void {
  const exploration = player.exploration!;
  const region = cfg.regions.find((value: any) => value.key === exploration.region);
  const hour = new Date(at + 8 * 3600000).getUTCHours();
  const pool = [...region.species, ...(hour < 4 ? [region.nightSpecies] : [])];
  const species = pool[Math.floor(random(player) * pool.length)];
  const level = region.minLevel + Math.floor(random(player) * (region.maxLevel - region.minLevel + 1));
  const wild = makePartner(player, species, level, 'wild');
  const team = exploration.team.map((id) => player.pokemon.find((value) => value.id === id)!);
  if (!fight(player, team, wild)) {
    exploration.summary.losses++;
    const seconds = recoveryDuration(team);
    exploration.recoveryUntil = seconds ? at + seconds * 1000 : null;
    log(player, at, 'recovery', `探索队战败，按损失体力恢复${seconds}秒；完成后继续原路线。`);
    return;
  }
  exploration.summary.wins++;
  const base = sourceVariant(species)?.base_experience ?? 64;
  const xp = Math.max(1, Math.floor(((base * level) / 7) * cfg.xpMultiplier));
  for (const member of team) {
    const before = member.level;
    member.exp = Math.min(member.exp + xp, experienceAt(member.species, 100));
    refreshPartner(member);
    if (member.level > before) log(player, at, 'level', `${member.name} 升到 ${member.level} 级。`);
  }
  exploration.summary.xp += xp * team.length;
  player.inventory.training = (player.inventory.training ?? 0) + 1;
  if (random(player) < cfg.extraItemDropRate) {
    player.inventory.sitrusberry = (player.inventory.sitrusberry ?? 0) + 1;
    log(player, at, 'drop', '野外掉落了文柚果。');
  }
  if (!player.wishlist.includes(species)) return;
  const ball = ['ultraball', 'greatball', 'pokeball'].find((key) => takeSupply(player, key));
  if (!ball) return;
  const multiplier = ball === 'ultraball' ? 2 : ball === 'greatball' ? 1.5 : 1;
  const probability = Math.min(0.95, (sourceCapture(species) / 255) * multiplier * cfg.captureScale);
  if (random(player) < probability) {
    heal(wild);
    player.pokemon.push(wild);
    exploration.summary.captures++;
    log(player, at, 'capture', `心愿捕获成功：${wild.name} Lv.${wild.level}（${ball}）。`);
  }
}

function sourceCapture(name: string): number {
  return sourceSpecies(name)?.capture_rate ?? 120;
}

export function advancePlayer(player: PlayerState, now: number): void {
  for (const facility of player.facilities) {
    const config = cfg.industries.find((value: any) => value.key === facility.key);
    const workers = facility.workers.map((id) => player.pokemon.find((value) => value.id === id)!).filter(Boolean);
    const efficiency = workers.reduce((sum, worker) => {
      const suitable = dex.species.get(worker.species).types.some((type: string) => config.types.includes(type));
      return sum + (suitable ? 1 : 0.5);
    }, 0);
    const capacity = config.baseRate * facility.level;
    const rate = workers.length ? capacity * (1 - Math.exp(-efficiency / 2)) : 0;
    const value = (Math.max(0, now - facility.cursor) / 3600000) * rate + facility.remainder;
    const quantity = Math.floor(value + 1e-9);
    facility.remainder = value - quantity;
    facility.cursor = now;
    player.inventory[config.output] = (player.inventory[config.output] ?? 0) + quantity;
    player.inventory.money += quantity * cfg.industryMoneyPerOutput;
  }
  for (const plot of player.plots) {
    if (!plot.berry) continue;
    const first = plot.plantedAt + cfg.plantMatureSeconds * 1000;
    const next = Math.max(first, plot.cursor + cfg.fruitPeriodSeconds * 1000);
    if (now >= next) {
      const periods = 1 + Math.floor((now - next) / (cfg.fruitPeriodSeconds * 1000));
      plot.buffer = Math.min(cfg.fruitBuffer, plot.buffer + periods * cfg.fruitYield);
      plot.cursor = next + (periods - 1) * cfg.fruitPeriodSeconds * 1000;
    }
  }
  const box = player.nursery;
  if (box.phase === 'producing' && now >= box.completeAt) {
    box.phase = 'ready';
    log(player, box.completeAt, 'breeding', `${box.eggCount} 枚蛋已准备好，可以开始整盒孵化。`);
  }
  if (box.phase === 'hatching' && now >= box.completeAt) {
    player.pokemon.push(...box.offspring);
    box.phase = 'complete';
    log(player, box.completeAt, 'hatch', `整盒 ${box.eggCount} 枚蛋已全部孵化。`);
  }
  const exploration = player.exploration;
  player.catchingUp = false;
  if (!exploration) return;
  const interval = cfg.encounterSeconds * 1000;
  let events = 0;
  while (events < cfg.settlementBatch) {
    if (exploration.recoveryUntil !== null) {
      if (now < exploration.recoveryUntil) break;
      exploration.summary.recoverySeconds += (exploration.recoveryUntil - exploration.cursor) / 1000;
      for (const id of exploration.team) heal(player.pokemon.find((value) => value.id === id)!);
      exploration.cursor = exploration.recoveryUntil;
      exploration.recoveryUntil = null;
    }
    const next = exploration.cursor + interval;
    if (next > now) break;
    encounter(player, next);
    exploration.cursor = next;
    events++;
  }
  player.catchingUp = exploration.recoveryUntil !== null ? exploration.recoveryUntil <= now : exploration.cursor + interval <= now;
}
