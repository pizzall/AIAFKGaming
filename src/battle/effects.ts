import {createHash} from 'node:crypto';
import {Engine, ModdedDex} from './engine.ts';

type EffectKind = 'item' | 'ability' | 'condition';
type Parameters = {numerator: number; denominator: number};
type EffectData = {kind: EffectKind; engineId: string; handler?: string; parameters?: Parameters};
const revisions = new Map<string, {hash: string; mod: string}>();
const tables = {item: 'Items', ability: 'Abilities', condition: 'Conditions'} as const;
const handlers: Record<string, EffectKind> = {'residual-heal': 'item', 'attack-multiplier': 'ability'};

export abstract class EffectDefinition {
  readonly kind: EffectKind;
  readonly engineId: string;
  readonly handler?: string;
  readonly parameters?: Readonly<Parameters>;

  constructor(data: EffectData) {
    this.kind = data.kind;
    this.engineId = data.engineId;
    this.handler = data.handler;
    this.parameters = data.parameters ? Object.freeze({...data.parameters}) : undefined;
    Object.freeze(this);
  }

  apply(dex: any): void {
    const index = this.kind === 'item' ? dex.items : this.kind === 'ability' ? dex.abilities : dex.conditions;
    const resolved = index.get(this.engineId);
    if (!resolved.exists || resolved.id !== this.engineId) throw new Error(`Unknown or noncanonical ${this.kind}: ${this.engineId}`);
    if (!this.handler) return;
    const {numerator, denominator} = this.parameters!;
    const table = tables[this.kind];
    const original = dex.data[table][this.engineId];
    const patch = {...original};
    if (this.handler === 'residual-heal') {
      patch.onResidual = function (this: any, pokemon: any) { this.heal(pokemon.baseMaxhp * numerator / denominator); };
    } else if (this.handler === 'attack-multiplier') {
      patch.onModifyAtk = function (this: any) { return this.chainModify([numerator, denominator]); };
    }
    dex.data[table][this.engineId] = patch;
    // Validation above may have populated a value cache; invalidate only this adapter-owned entry.
    index[`${this.kind}Cache`]?.delete(this.engineId);
  }
}

export class ItemEffectDefinition extends EffectDefinition {}
export class AbilityEffectDefinition extends EffectDefinition {}
export class ConditionEffectDefinition extends EffectDefinition {}

export function deserializeEffects(input: unknown): EffectDefinition[] {
  if (!Array.isArray(input)) throw new Error('Effects must be an array');
  const seen = new Set<string>();
  return input.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid effect object');
    const data = value as Record<string, unknown>;
    const allowed = ['kind', 'engineId', 'handler', 'parameters'];
    if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error('Unknown effect field');
    if (typeof data.kind !== 'string' || !['item', 'ability', 'condition'].includes(data.kind)) throw new Error('Unknown effect kind');
    if (typeof data.engineId !== 'string' || !/^[a-z0-9]+$/.test(data.engineId)) throw new Error('Invalid engine ID');
    const identity = `${data.kind}:${data.engineId}`;
    if (seen.has(identity)) throw new Error(`Duplicate effect ${identity}`);
    seen.add(identity);
    if (data.handler !== undefined) {
      if (typeof data.handler !== 'string' || handlers[data.handler] !== data.kind) throw new Error('Unsupported effect handler');
      const params = data.parameters as Record<string, unknown>;
      if (!params || Object.keys(params).sort().join(',') !== 'denominator,numerator') throw new Error('Invalid parameters');
      for (const key of ['numerator', 'denominator']) {
        if (!Number.isSafeInteger(params[key]) || Number(params[key]) < 1 || Number(params[key]) > 4096) {
          throw new Error('Effect fractions must use positive integers up to 4096');
        }
      }
    } else if (data.parameters !== undefined) throw new Error('Parameters require a handler');
    const typed = data as EffectData;
    const classes = {item: ItemEffectDefinition, ability: AbilityEffectDefinition, condition: ConditionEffectDefinition};
    const Class = classes[typed.kind];
    return new Class(typed);
  });
}

export function createBattleDex(revision: string, definitions: EffectDefinition[]): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(revision)) throw new Error('Invalid effect revision');
  const hash = createHash('sha256').update(JSON.stringify(definitions)).digest('hex');
  const existing = revisions.get(revision);
  if (existing) {
    if (existing.hash !== hash) throw new Error('A published effect revision is immutable');
    return existing.mod;
  }
  const parent = Engine.Dex.mod('gen9');
  const mod = `afk${createHash('sha256').update(revision + hash).digest('hex').slice(0, 20)}`;
  const dex = new ModdedDex(mod);
  dex.gen = parent.gen;
  dex.parentMod = 'gen9';
  dex.dataCache = {...parent.data};
  for (const key of ['Items', 'Abilities', 'Conditions', 'Scripts']) dex.dataCache[key] = {...parent.data[key]};
  dex.dataCache.Scripts.inherit = 'gen9';
  for (const definition of definitions) definition.apply(dex);
  Engine.Dex.dexes[mod] = dex;
  revisions.set(revision, {hash, mod});
  return mod;
}
