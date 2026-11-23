import {readFileSync} from 'node:fs';
import {Engine} from '../battle/engine.ts';
import type {Partner, PlayerState, Stats} from './types.ts';
import type {TeamMember} from '../battle/fixtures.ts';
import {buildMoveCatalog, machines} from './move-data.ts';
import {chineseName} from './localization.ts';

export const gameConfig = JSON.parse(readFileSync(new URL('../../config/gameplay.test.json', import.meta.url), 'utf8'));
export const dex = Engine.Dex.mod('gen9');
export const moveCatalog = buildMoveCatalog(dex);
export const machineCatalog = machines;
export const itemCatalog = Object.fromEntries(
  dex.items
    .all()
    .map((item: any) => [item.id, {equippable: !item.isPokeball && !item.zMove, isBall: !!item.isPokeball, isBerry: !!item.isBerry}])
);
for (const machine of machineCatalog) {
  gameConfig.resources[machine.resource] = {
    name: `技能机${String(machine.number).padStart(3, '0')}（${chineseName('moves', machine.move)}）`,
    kind: 'machine',
    machineNumber: machine.number,
    move: machine.move,
    ...gameConfig.resources[machine.resource]
  };
}
const variants: any[] = JSON.parse(readFileSync(new URL('../../data/pokemon.json', import.meta.url), 'utf8'));
const species: any[] = JSON.parse(readFileSync(new URL('../../data/species.json', import.meta.url), 'utf8'));
const byVariant = new Map(variants.map((entry) => [Engine.toID(entry.identifier), entry]));
const bySpecies = new Map(species.map((entry) => [entry.id, entry]));
export const speciesCatalog = species
  .map((entry) => {
    const variant = variants.find((value) => value.species_id === entry.id && value.is_default);
    const form = dex.species.get(variant?.identifier ?? entry.identifier);
    const data = form.exists ? form : dex.species.get(entry.identifier);
    return {key: data.id, number: entry.id, name: entry.name_zh_hans, image: variant?.images.front ?? null};
  })
  .filter((entry) => dex.species.get(entry.key).exists);
const curves = new Map<string, number>();
for (const line of readFileSync(new URL('../../data/raw/pokeapi/experience.csv', import.meta.url), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)) {
  const [curve, level, xp] = line.split(',').map(Number);
  curves.set(`${curve}:${level}`, xp);
}
export const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

export function random(player: PlayerState): number {
  let value = player.rng | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  player.rng = value >>> 0 || 1;
  return player.rng / 4294967296;
}

export function sourceSpecies(name: string): any {
  const data = dex.species.get(name);
  const variant = byVariant.get(data.id) ?? variants.find((entry) => entry.id === data.num);
  return bySpecies.get(variant?.species_id ?? data.num);
}

export function sourceVariant(name: string): any {
  return byVariant.get(dex.species.get(name).id);
}

export function experienceAt(name: string, level: number): number {
  return curves.get(`${sourceSpecies(name)?.growth_rate_id ?? 2}:${level}`) ?? 0;
}

export function learnedAt(name: string, level: number): string[] {
  const moves = new Set<string>();
  for (const set of dex.species.getFullLearnset(dex.species.get(name).id)) {
    for (const [id, sources] of Object.entries(set.learnset) as Array<[string, string[]]>) {
      if (sources.some((source) => /^[1-9]L\d+$/.test(source) && Number(source.slice(2)) <= level)) moves.add(id);
    }
  }
  return [...moves]
    .map((id) => dex.moves.get(id))
    .filter((move) => move.exists && move.gen <= 9)
    .sort((a, b) => Number(b.basePower > 0) - Number(a.basePower > 0) || b.basePower - a.basePower)
    .map((move) => move.name);
}

export function refreshPartner(partner: Partner): void {
  let level = 1;
  while (level < 100 && partner.exp >= experienceAt(partner.species, level + 1)) level++;
  partner.level = level;
  const base = dex.species.get(partner.species).baseStats;
  const oldMax = partner.maxHp || 0;
  partner.maxHp =
    partner.species === 'shedinja'
      ? 1
      : Math.floor(((2 * base.hp + partner.ivs.hp + Math.floor(partner.evs.hp / 4)) * level) / 100) + level + 10;
  partner.hp = oldMax > 0 && partner.hp === 0 ? 0 : Math.max(0, Math.min(partner.maxHp, partner.hp + partner.maxHp - oldMax));
  for (const name of learnedAt(partner.species, level)) {
    if (!partner.learnedMoves.includes(name)) partner.learnedMoves.push(name);
    if (partner.pp[name] === undefined) partner.pp[name] = dex.moves.get(name).pp;
  }
}

export function makePartner(player: PlayerState, name: string, level: number, origin: string, gender?: string): Partner {
  const data = dex.species.get(name);
  if (!data.exists || data.isMega || data.isPrimal || data.gen > 9) throw new Error('该物种或形态暂不支持。');
  const variant = byVariant.get(data.id) ?? variants.find((entry) => entry.id === data.num);
  const ivs = Object.fromEntries(statKeys.map((key) => [key, Math.floor(random(player) * 32)])) as Stats;
  const nature = dex.natures.all()[Math.floor(random(player) * dex.natures.all().length)].name;
  const moves = learnedAt(data.id, level).slice(0, 4);
  const partner: Partner = {
    id: `${player.id}:${++player.serial}`,
    species: data.id,
    name: variant?.name_zh_hans ?? data.name,
    image: variant?.images.front ?? null,
    level,
    exp: experienceAt(data.id, level),
    nature,
    ability: data.abilities['0'],
    gender: gender ?? data.gender ?? (random(player) < (data.genderRatio?.F ?? 0.5) ? 'F' : 'M'),
    ivs,
    evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
    friendship: sourceSpecies(data.id)?.base_happiness ?? 70,
    moves,
    learnedMoves: [...moves],
    pp: {},
    heldItem: '',
    hp: 0,
    maxHp: 0,
    status: '',
    origin
  };
  refreshPartner(partner);
  return partner;
}

export function battleMember(partner: Partner): TeamMember {
  return {
    species: dex.species.get(partner.species).name,
    level: partner.level,
    ability: partner.ability,
    item: partner.heldItem,
    moves: [...partner.moves],
    nature: partner.nature,
    ivs: {...partner.ivs},
    evs: {...partner.evs}
  };
}

export function heal(partner: Partner): void {
  partner.hp = partner.maxHp;
  partner.status = '';
  for (const move of partner.learnedMoves) partner.pp[move] = dex.moves.get(move).pp;
}
