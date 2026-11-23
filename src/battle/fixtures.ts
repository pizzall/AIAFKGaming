import {readFileSync} from 'node:fs';
import {contentFingerprint} from './publication.ts';

export interface TeamMember {
  species: string;
  level: number;
  ability: string;
  item: string;
  moves: string[];
  nature?: string;
  ivs?: Record<string, number>;
  evs?: Record<string, number>;
}

export interface NpcTemplate {key: string; name: string; tactic: string; team: TeamMember[]}
const config = JSON.parse(readFileSync(new URL('../../config/battle-teams.json', import.meta.url), 'utf8'));
export const fixtureFingerprint = contentFingerprint(config);
export const playerTeam: TeamMember[] = config.player;
export const npcTemplates: NpcTemplate[] = config.npcs;

export function selectNpcTemplate(index: number): NpcTemplate {
  if (!Number.isSafeInteger(index) || !npcTemplates[index]) throw new Error('Unknown NPC template');
  return structuredClone(npcTemplates[index]);
}
