import {GameError, type PlayerState, type SupplySlot} from './types.ts';
import {gameConfig as cfg} from './catalog.ts';

export function stockTotals(player: PlayerState): Record<string, number> {
  const total = {...player.inventory};
  for (const slot of player.exploration?.supplies ?? []) {
    if (slot) total[slot.resource] = (total[slot.resource] ?? 0) + slot.quantity;
  }
  return total;
}
export function packSupplies(player: PlayerState, input: unknown): Array<SupplySlot | null> {
  if (!Array.isArray(input) || input.length > cfg.explorationBagSlots) throw new GameError('探索背包最多6格。');
  const totals: Record<string, number> = {};
  const slots = Array.from({length: cfg.explorationBagSlots}, (_, index) => {
    const slot = input[index];
    if (slot === null || slot === undefined) return null;
    if (
      typeof slot !== 'object' ||
      typeof slot.resource !== 'string' ||
      !cfg.resources[slot.resource]?.explorationSupply ||
      !Number.isSafeInteger(slot.quantity) ||
      slot.quantity < 1 ||
      slot.quantity > cfg.explorationStackLimit
    )
      throw new GameError('每格需放入1–99件可用于探索的同种道具。');
    totals[slot.resource] = (totals[slot.resource] ?? 0) + slot.quantity;
    return {resource: slot.resource, quantity: slot.quantity};
  });
  for (const [key, amount] of Object.entries(totals)) {
    if ((player.inventory[key] ?? 0) < amount) throw new GameError(`${cfg.resources[key].name}的仓库库存不足。`);
  }
  for (const [key, amount] of Object.entries(totals)) player.inventory[key] -= amount;
  return slots;
}
export function takeSupply(player: PlayerState, resource: string): boolean {
  const slots = player.exploration?.supplies ?? [];
  const index = slots.findIndex((slot) => slot?.resource === resource && slot.quantity > 0);
  if (index < 0) return false;
  if (--slots[index]!.quantity === 0) slots[index] = null;
  return true;
}
export function returnSupplies(player: PlayerState): void {
  for (const slot of player.exploration?.supplies ?? []) {
    if (slot) player.inventory[slot.resource] = (player.inventory[slot.resource] ?? 0) + slot.quantity;
  }
  if (player.exploration) player.exploration.supplies = Array(cfg.explorationBagSlots).fill(null);
}
export function healingAmount(resource: string, maxHp: number): number {
  const resourceConfig = cfg.resources[resource];
  if (resourceConfig?.healHp) return resourceConfig.healHp;
  const fraction = resourceConfig?.healFraction;
  return fraction ? Math.max(1, Math.floor((maxHp * fraction[0]) / fraction[1])) : 0;
}
