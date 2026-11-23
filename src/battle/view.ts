// 从引擎请求里只读出「本方可见」的战局：本方宝可梦的体力、状态、招式，以及场上对手的身份与体力。
// 对手的队伍、招式池和选择永远不会出现在 request 里，所以这里读不到。

export type RequestState = 'move' | 'switch' | 'teampreview' | 'wait' | undefined;

export interface FieldPokemon {
  /** 引擎的出战位置：1 或 2。 */
  slot: number;
  ident: string;
  species: string;
  /** 百分比体力（0–100）。 */
  hpPercent: number;
  fainted: boolean;
  status: string;
  /** 本方宝可梦的攻击/速度（请求里带 stats）；对手没有请求，所以为 null。 */
  atk: number | null;
  spe: number | null;
  moves: string[];
}

export interface ViewSide {
  slot: number;
  name: string;
  hpPercent: number;
  fainted: boolean;
  status: string;
}

export interface View {
  /** 本方要到哪一步：普通回合还是替换。 */
  state: RequestState;
  /** 本方两只在场的位置（0 号/1 号），没上场为 null。 */
  own: Array<FieldPokemon | null>;
  /** 对手两只在场的位置，没上场为 null。 */
  foe: Array<ViewSide | null>;
  /** 本方替补（未上场、未倒下）。 */
  bench: FieldPokemon[];
  /** 已经倒下、不能换入的位置（side.pokemon 的下标）。 */
  downed: number[];
}

function parseCondition(condition: string): {hpPercent: number; fainted: boolean; status: string} {
  const [health = '0 fnt', status = ''] = condition.split(' ');
  const fainted = health.endsWith('fnt');
  if (fainted) return {hpPercent: 0, fainted, status};
  const [current = '0', maximum = '0'] = health.replace(/\D/g, '/').split('/').map((value) => value.trim());
  const hpPercent = Number(maximum) > 0 ? Math.floor((Number(current) / Number(maximum)) * 100) : 0;
  return {hpPercent, fainted, status};
}

function speciesOf(ident: string): string {
  return ident.replace(/^p[1-2][a-z]?: */, '').trim();
}

/** 从 `request.side.pokemon`（本方完整队伍）和 `request.active`（本方在场）拼出视角。 */
export function readView(request: any, requestState?: string): View {
  const side = request?.side;
  if (!side || !Array.isArray(side.pokemon)) {
    return {state: (requestState ?? 'move') as RequestState, own: [null, null], foe: [null, null], bench: [], downed: []};
  }
  const party = side.pokemon as any[];
  const activePositions = (request.active ?? [])
    .map((value: any, index: number) => (value ? index : -1))
    .filter((index: number) => index >= 0);
  const own = [0, 1].map((slot) => {
    const entry = activePositions[slot] !== undefined ? party[activePositions[slot]!] : undefined;
    if (!entry) return null;
    const state = parseCondition(String(entry.condition ?? '0 fnt'));
    const moves = (request.active?.[activePositions[slot]!]?.moves ?? []).map((move: any) => String(move.move));
    return {
      slot: slot + 1,
      ident: String(entry.ident),
      species: speciesOf(String(entry.ident)),
      hpPercent: state.hpPercent,
      fainted: state.fainted,
      status: state.status,
      atk: typeof entry.stats?.atk === 'number' ? entry.stats.atk : null,
      spe: typeof entry.stats?.spe === 'number' ? entry.stats.spe : null,
      moves
    } satisfies FieldPokemon;
  });
  const ordered = party.map((entry, index) => ({entry, index}));
  const bench = ordered
    .filter(({entry, index}) => !activePositions.includes(index) && !String(entry.condition).endsWith(' fnt'))
    .map(({entry, index}) => {
      const state = parseCondition(String(entry.condition ?? '0 fnt'));
      return {
        slot: index + 1,
        ident: String(entry.ident),
        species: speciesOf(String(entry.ident)),
        hpPercent: state.hpPercent,
        fainted: state.fainted,
        status: state.status,
        atk: typeof entry.stats?.atk === 'number' ? entry.stats.atk : null,
        spe: typeof entry.stats?.spe === 'number' ? entry.stats.spe : null,
        moves: []
      } satisfies FieldPokemon;
    });
  return {
    state: (requestState ?? (request.forceSwitch ? 'switch' : 'move')) as RequestState,
    own,
    // 本轮不读对手：引擎的请求里没有对手信息，这里留空，防止误用。
    foe: [null, null],
    bench,
    downed: ordered.filter(({entry}) => String(entry.condition).endsWith(' fnt')).map(({index}) => index)
  };
}
