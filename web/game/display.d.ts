export const statNames: Record<string, string>;
export function displayName(names: Record<string, Record<string, string>>, kind: string, value: string): string;
export function findSpecies<T extends {number: number; name: string; key: string}>(entries: T[], query: string, limit?: number): T[];
export function battleLines(events: string[], names: Record<string, Record<string, string>>): string[];
export function battleOutcome(battle: {status: string; viewerSide?: string; winnerSide?: string | null; stale?: boolean}): {
  label: string;
  detail: string;
  tone: string;
};
