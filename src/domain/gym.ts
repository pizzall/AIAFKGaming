import {randomUUID} from 'node:crypto';
import type {TeamMember} from '../battle/fixtures.ts';
import {TACTIC_LIMIT, tacticLength} from '../game/types.ts';

export interface DefenseSnapshot {id: string; ownerKey: string; team: TeamMember[]; tactic: string}
export interface GymSeat {gymKey: string; defense: DefenseSnapshot}

function freeze(value: any): any {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function createDefenseSnapshot(ownerKey: string, team: TeamMember[], tactic: string): DefenseSnapshot {
  if (!/^(player|npc):.+$/.test(ownerKey) || team.length !== 6) throw new Error('Invalid gym defense');
  if (tacticLength(tactic.replace(/\r\n?/g, '\n')) > TACTIC_LIMIT) throw new Error('Tactic exceeds 500 characters');
  return freeze({id: randomUUID(), ownerKey, team: structuredClone(team), tactic});
}

export function resetGymSeason<T extends {gymSeats: GymSeat[]}>(state: T, npcDefenses: DefenseSnapshot[]): T {
  if (npcDefenses.length !== state.gymSeats.length || npcDefenses.some(value => !value.ownerKey.startsWith('npc:'))) {
    throw new Error('Every gym needs a new NPC defense');
  }
  const gymSeats = state.gymSeats.map((seat, index) => ({...seat, defense: freeze(structuredClone(npcDefenses[index]))}));
  return {...state, gymSeats};
}
