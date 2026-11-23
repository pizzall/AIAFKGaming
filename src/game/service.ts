import {randomBytes, randomUUID} from 'node:crypto';
import {GameStore} from './store.ts';
import {GameError, TACTIC_LIMIT, tacticLength, type Gym, type Partner, type PlayerState, type WorldState} from './types.ts';
import {battleMember, dex, experienceAt, gameConfig as cfg, heal, learnedAt, makePartner, speciesCatalog} from './catalog.ts';
import {random, refreshPartner, statKeys} from './catalog.ts';
import {advancePlayer, log, occupation, occupied, recoveryDuration} from './idle.ts';
import {actionNames, chineseName, chineseNames, readableLog} from './localization.ts';
import {contentFingerprint} from '../battle/publication.ts';
import {validateTeam, type BattleResult} from '../battle/runner.ts';
import {npcTemplates} from '../battle/fixtures.ts';
import {runComparison, toRecord} from '../battle/compare.ts';
import {dex as strategyDex} from './catalog.ts';
import {nameIndex as strategyNames} from '../battle/names.ts';
import {createDefenseSnapshot} from '../domain/gym.ts';
import {GameClock} from './clock.ts';
import {itemCatalog, machineCatalog, moveCatalog} from './catalog.ts';
import {machineMoves} from './move-data.ts';
import {healingAmount, packSupplies, returnSupplies, stockTotals} from './supplies.ts';

const gymNames = ['尼比道馆', '华蓝道馆', '枯叶道馆', '玉虹道馆', '浅红道馆', '金黄道馆', '红莲道馆', '常青道馆'];
function newGyms(version = 1): Gym[] {
  return gymNames.map((name, index) => ({
    key: `gym-${index + 1}`,
    name,
    level: cfg.gymLevels[index],
    holderKind: 'npc',
    ownerName: `联盟馆主 ${index + 1}`,
    version,
    activeBattleId: null
  }));
}
function quantity(input: unknown, maximum = 1000000): number {
  if (!Number.isSafeInteger(input) || Number(input) < 1 || Number(input) > maximum) throw new GameError('数量超出范围。');
  return Number(input);
}
function charge(player: PlayerState, resource: string, count: number): void {
  if ((player.inventory[resource] ?? 0) < count)
    throw new GameError(`${cfg.resources[resource]?.name ?? chineseName('items', resource)}不足。`);
  player.inventory[resource] -= count;
}
function member(player: PlayerState, id: unknown): Partner {
  const value = player.pokemon.find((partner) => partner.id === id);
  if (!value) throw new GameError('宝可梦不属于当前账号。');
  return value;
}
function teamIds(player: PlayerState, values: unknown, minimum = 1, maximum = 6): string[] {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum || new Set(values).size !== values.length) {
    throw new GameError('队伍人数或成员重复。');
  }
  return values.map((id) => member(player, id).id);
}

export class GameService {
  readonly store: GameStore;
  readonly testMode: boolean;
  readonly clock: GameClock;

  constructor(path: string, options: {testMode?: boolean; now?: () => number} = {}) {
    this.testMode = options.testMode ?? false;
    this.clock = new GameClock(options.now);
    this.store = new GameStore(path, {season: 1, gyms: newGyms()}, this.clock.realNow);
    // Interrupted technical executions release seats; no loss/reward is invented.
    this.store.transaction(() => {
      const world = this.store.world();
      if (!this.testMode) {
        const bootReal = this.clock.realNow();
        for (const row of this.store.db.prepare('SELECT state FROM players').all() as any[]) {
          const player = JSON.parse(row.state) as PlayerState;
          if (this.clock.read(player, bootReal).rate === 1) continue;
          this.clock.setRate(player, 1, bootReal);
          this.store.savePlayer(player);
        }
      }
      for (const row of this.store.db.prepare('SELECT state FROM gym_battles').all() as any[]) {
        const battle = JSON.parse(row.state);
        if (battle.status !== 'queued' && battle.status !== 'running') continue;
        battle.status = 'error';
        battle.error = '服务已重启，请重新挑战。';
        this.saveBattle(battle);
        for (const gym of world.gyms) if (gym.activeBattleId === battle.id) gym.activeBattleId = null;
      }
      this.store.saveWorld(world);
    });
  }

  register(username: string, password: string) {
    return this.store.register(username, password, (id, name) => {
      const now = this.clock.realNow();
      const player: PlayerState = {
        id,
        username: name,
        clockOffset: 0,
        clockRate: 1,
        clockAnchorRealAt: now,
        rng: randomBytes(4).readUInt32LE() || 1,
        serial: 0,
        inventory: {money: cfg.initialMoney, pokeball: cfg.initialBalls, potion: cfg.initialPotions, oranberry: 2},
        pokemon: [],
        team: [],
        tactic: '',
        wishlist: cfg.regions.flatMap((region: any) => [...region.species, region.nightSpecies]),
        exploration: null,
        facilities: [],
        plots: Array.from({length: 2}, () => ({berry: null, plantedAt: 0, cursor: 0, buffer: 0})),
        nursery: {phase: 'empty', parents: [], manager: null, eggCount: 0, completeAt: 0, offspring: []},
        honors: [],
        logs: [],
        catchingUp: false,
        purchaseCounts: {},
        centerUntil: null,
        centerTeam: []
      };
      for (const [species, gender] of [
        ['bulbasaur', 'M'],
        ['charmander', 'M'],
        ['squirtle', 'M'],
        ['eevee', 'F'],
        ['pikachu', 'M'],
        ['eevee', 'M']
      ])
        player.pokemon.push(makePartner(player, species, cfg.starterLevel, 'test-kit', gender));
      player.team = player.pokemon.map((partner) => partner.id);
      player.presets = [{id: 'default', name: '初始队伍', team: [...player.team], tactic: player.tactic}];
      player.readyPresetId = null;
      log(player, now, 'account', '测试账号已建立：初始伙伴与资金来自联调用测试档，不代表正式初值。');
      this.store.audit(player, {}, now, '测试初始礼包');
      return player;
    });
  }
  login(username: string, password: string) {
    return this.store.login(username, password);
  }
  session(token: string) {
    return this.store.session(token);
  }
  logout(token: string): void {
    this.store.logout(token);
  }
  close(): void {
    this.store.close();
  }
  catalog() {
    return {species: speciesCatalog, names: chineseNames, moves: moveCatalog, machines: machineCatalog, items: itemCatalog};
  }
  private pendingGym(id: string): boolean {
    return !!this.store.db
      .prepare("SELECT 1 FROM gym_battles WHERE owner_id=? AND json_extract(state,'$.status') IN ('queued','running') LIMIT 1")
      .get(id);
  }
  private checkAvailable(player: PlayerState, ids: string[], ignoreReady = false): void {
    const blocked = ids.find((id) => occupied(player, id, ignoreReady));
    if (blocked) throw new GameError(`${member(player, blocked).name}正在${occupation(player, blocked, ignoreReady)}，请先结束对应活动。`);
  }

  state(id: string): any {
    return this.store.transaction(() => {
      const player = this.store.player(id);
      if (!player.presets?.length) player.presets = [{id: 'default', name: '初始队伍', team: [...player.team], tactic: player.tactic}];
      player.readyPresetId ??= null;
      const before = stockTotals(player);
      if (player.exploration && !player.exploration.supplies) player.exploration.supplies = Array(cfg.explorationBagSlots).fill(null);
      const clock = this.clock.read(player);
      const now = clock.gameTime;
      // Legacy saves did not record participants; freeze their current preset on first read, before any edits.
      if (player.centerUntil !== null && !player.centerTeam?.length) player.centerTeam = [...player.team];
      if (player.centerUntil !== null && now >= player.centerUntil) {
        player.pokemon.filter((partner) => player.centerTeam!.includes(partner.id)).forEach(heal);
        player.centerUntil = null;
        player.centerTeam = [];
        log(player, now, 'recovery', '宝可梦中心恢复完成。');
      }
      advancePlayer(player, now);
      this.store.audit(player, before, now, '挂机结算');
      this.store.savePlayer(player);
      const world = this.store.world();
      const gyms = world.gyms.map(({defense, ...gym}) => gym);
      const ledger = this.store.db
        .prepare('SELECT at,reason,deltas FROM ledger WHERE player_id=? ORDER BY id DESC LIMIT 30')
        .all(id)
        .map((row: any) => ({...row, deltas: JSON.parse(row.deltas)}));
      const roster = player.pokemon.map((partner) => ({
        ...partner,
        activity: occupation(player, partner.id),
        machineMoves: machineMoves(dex, partner.species),
        evolutions: dex.species.get(partner.species).evos.map((name: string) => {
          const target = dex.species.get(name);
          return {key: target.id, name: target.name, level: target.evoLevel ?? null, item: target.evoItem ?? null};
        })
      }));
      const nursery = {...player.nursery, offspring: undefined};
      const recoveryIds = player.exploration?.team ?? (player.centerUntil !== null ? player.centerTeam! : player.team);
      const recoveryTeam = player.pokemon.filter((partner) => recoveryIds.includes(partner.id));
      const until = player.exploration?.recoveryUntil ?? player.centerUntil;
      const recoveryPreview = {
        seconds: until !== null ? Math.max(0, Math.ceil((until - now) / 1000)) : recoveryDuration(recoveryTeam),
        realSeconds: this.clock.remainingSeconds(clock, until ?? now + recoveryDuration(recoveryTeam) * 1000),
        until,
        hp: recoveryTeam.reduce((sum, partner) => sum + partner.hp, 0),
        maxHp: recoveryTeam.reduce((sum, partner) => sum + partner.maxHp, 0)
      };
      const {rng, serial, ...visiblePlayer} = player;
      const battles = this.store.db
        .prepare("SELECT state FROM gym_battles WHERE owner_id=? OR json_extract(state,'$.defenderId')=? ORDER BY rowid DESC LIMIT 20")
        .all(id, id)
        .map((row: any) => {
          const value = JSON.parse(row.state);
          return {
            id: value.id,
            status: value.status,
            gymKey: value.gymKey,
            viewerSide: value.ownerId === id ? 'p1' : 'p2',
            winnerSide: value.result?.winnerSide,
            stale: value.stale
          };
        });
      return {
        ...visiblePlayer,
        pokemon: roster,
        logs: player.logs.map((entry) => ({
          ...entry,
          message: ['rename', 'item-use'].includes(entry.kind) ? entry.message : readableLog(entry.message, cfg.resources)
        })),
        nursery,
        recoveryPreview,
        serverTime: now,
        clock,
        clockOffset: now - clock.realTime,
        testMode: this.testMode,
        config: cfg,
        gyms,
        season: world.season,
        ledger: ledger.map((entry: any) => ({...entry, reason: actionNames[entry.reason] ?? readableLog(entry.reason, cfg.resources)})),
        battles
      };
    });
  }

  command(id: string, commandId: string, input: any): any {
    if (typeof commandId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(commandId) || !input || typeof input.kind !== 'string') {
      throw new GameError('命令格式无效。');
    }
    const hash = contentFingerprint(input);
    const old = this.store.db.prepare('SELECT hash,response FROM receipts WHERE player_id=? AND id=?').get(id, commandId) as any;
    if (old) {
      if (old.hash !== hash) throw new GameError('同一命令编号不能复用到其它操作。', 409);
      return JSON.parse(old.response);
    }
    const current = this.state(id);
    const changesRate =
      input.kind === 'test-speed' ||
      (input.kind === 'debug' && typeof input.command === 'string' && /^\/(speed|变速)(?:\s|$)/.test(input.command.trim()));
    if (current.catchingUp && !changesRate) throw new GameError('正在补结算，请刷新完成后重试。', 409);
    return this.store.transaction(() => {
      const player = this.store.player(id);
      const world = this.store.world();
      const before = stockTotals(player);
      const now = this.clock.now(player);
      const result = this.apply(player, world, input, now);
      this.store.audit(player, before, now, input.kind === 'debug' ? input.command : input.kind);
      this.store.savePlayer(player);
      this.store.saveWorld(world);
      this.store.db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(id, commandId, hash, JSON.stringify(result));
      return result;
    });
  }

  private apply(player: PlayerState, world: WorldState, input: any, now: number): any {
    switch (input.kind) {
      case 'test-speed':
        return this.setSpeed(player, input.speed);
      case 'rename': {
        const partner = member(player, input.partner);
        if (typeof input.nickname !== 'string') throw new GameError('昵称需为文字，留空可恢复物种名。');
        const nickname = input.nickname.trim();
        if (Array.from(nickname).length > 12 || /[\u0000-\u001f\u007f-\u009f]/.test(input.nickname))
          throw new GameError('昵称最多12字，不能包含换行或控制字符。');
        const previous = partner.nickname || partner.name;
        if (nickname) partner.nickname = nickname;
        else delete partner.nickname;
        log(player, now, 'rename', `${partner.name}（个体${partner.id.split(':').at(-1)}）：${previous} → ${nickname || partner.name}。`);
        return {message: nickname ? '伙伴昵称已保存。' : '已恢复使用物种名。'};
      }
      case 'team': {
        if (player.readyPresetId) throw new GameError('请先取消备战，再修改当前队伍。');
        player.team = teamIds(player, input.team);
        const tactic = String(input.tactic ?? '').replace(/\r\n?/g, '\n');
        if (tacticLength(tactic) > TACTIC_LIMIT) throw new GameError('战术最多500字。');
        player.tactic = tactic;
        Object.assign(player.presets![0], {team: [...player.team], tactic});
        break;
      }
      case 'preset-save': {
        const preset = input.presetId ? player.presets!.find((value) => value.id === input.presetId) : null;
        if (input.presetId && !preset) throw new GameError('编队预设不存在。');
        if (preset && player.readyPresetId === preset.id) throw new GameError('该预设正在备战，请先取消备战再编辑。');
        if (!preset && player.presets!.length >= (cfg.teamPresetLimit ?? 10)) throw new GameError('编队预设数量已达上限。');
        const name = String(input.name ?? '').trim();
        const tactic = String(input.tactic ?? '').replace(/\r\n?/g, '\n');
        if (!name || Array.from(name).length > 20 || tacticLength(tactic) > TACTIC_LIMIT)
          throw new GameError('预设名称需1–20字，战术最多500字。');
        const value = {id: preset?.id ?? randomUUID(), name, team: teamIds(player, input.team), tactic};
        if (preset) Object.assign(preset, value);
        else player.presets!.push(value);
        log(player, now, 'preset', `已保存编队预设：${name}。`);
        return {message: '编队预设已保存。', presetId: value.id};
      }
      case 'preset-delete': {
        const index = player.presets!.findIndex((value) => value.id === input.presetId);
        if (index < 0 || player.presets!.length === 1) throw new GameError('至少保留一套有效预设。');
        if (player.readyPresetId === input.presetId) throw new GameError('请先取消该预设的备战。');
        player.presets!.splice(index, 1);
        break;
      }
      case 'prepare': {
        if (this.pendingGym(player.id)) throw new GameError('道馆比赛尚未结束，暂不能切换备战队伍。');
        const preset = player.presets!.find((value) => value.id === input.presetId);
        if (!preset) throw new GameError('编队预设不存在。');
        if (player.readyPresetId === preset.id) return {message: '这套队伍已经处于备战状态。'};
        this.checkAvailable(player, teamIds(player, preset.team), true);
        player.team = [...preset.team];
        player.tactic = preset.tactic;
        player.readyPresetId = preset.id;
        break;
      }
      case 'cancel-ready':
        if (this.pendingGym(player.id)) throw new GameError('道馆比赛尚未结束，暂不能取消备战。');
        player.readyPresetId = null;
        break;
      case 'wishlist': {
        if (!Array.isArray(input.species) || input.species.length > 100) throw new GameError('心愿单过长。');
        player.wishlist = [
          ...new Set(
            input.species.map((name: string) => {
              const species = dex.species.get(name);
              if (!species.exists) throw new GameError('物种不存在。');
              return species.id;
            })
          )
        ] as string[];
        break;
      }
      case 'explore-start': {
        if (player.exploration || player.centerUntil) throw new GameError('请先停止探索或等待恢复。');
        const region = cfg.regions.find((value: any) => value.key === input.region);
        if (!region || Math.max(...player.pokemon.map((partner) => partner.level)) < region.unlockLevel)
          throw new GameError('地区未解锁。');
        const preset = input.presetId ? player.presets!.find((value) => value.id === input.presetId) : null;
        if (input.presetId && !preset) throw new GameError('编队预设不存在。');
        const team = teamIds(player, preset?.team ?? input.team);
        if (this.pendingGym(player.id) && team.some((id) => player.team.includes(id)))
          throw new GameError('成员正在参加道馆比赛，暂不能探索。');
        this.checkAvailable(player, team, true);
        const supplies = packSupplies(player, input.supplies ?? []);
        player.exploration = {
          region: region.key,
          team,
          cursor: now,
          recoveryUntil: null,
          startedAt: now,
          supplies,
          summary: {wins: 0, losses: 0, captures: 0, xp: 0, recoverySeconds: 0}
        };
        break;
      }
      case 'explore-stop':
        returnSupplies(player);
        player.exploration = null;
        break;
      case 'rest': {
        const until = player.exploration?.recoveryUntil ?? player.centerUntil;
        if (until !== null) return {message: '队伍正在恢复，保持原定完成时间。'};
        const ids = player.exploration?.team ?? player.team;
        const team = player.pokemon.filter((partner) => ids.includes(partner.id));
        const seconds = recoveryDuration(team);
        if (!seconds) return {message: '探索体力已满，无需前往宝可梦中心。'};
        if (player.exploration) {
          player.exploration.cursor = now;
          player.exploration.recoveryUntil = now + seconds * 1000;
        } else {
          player.centerTeam = [...ids];
          player.centerUntil = now + seconds * 1000;
        }
        log(player, now, 'recovery', `探索队开始恢复${seconds}秒，仅恢复这次选定的伙伴。`);
        return {message: `恢复已开始，预计${seconds}秒；探索路线保持不变。`};
      }
      case 'buy': {
        const resource = cfg.resources[input.resource];
        const count = quantity(input.quantity, 999);
        if (!resource?.price) throw new GameError('商品不存在。');
        const cycle = Math.floor(now / 3600000);
        const key = `${cycle}:${input.resource}`;
        if (resource.shopCategory === 'important' && (player.purchaseCounts[key] ?? 0) + count > 1) {
          throw new GameError('本期重要道具每种限购1份。');
        }
        charge(player, 'money', resource.price * count);
        player.inventory[input.resource] = (player.inventory[input.resource] ?? 0) + count;
        player.purchaseCounts = Object.fromEntries(Object.entries(player.purchaseCounts).filter(([key]) => key.startsWith(`${cycle}:`)));
        player.purchaseCounts[key] = (player.purchaseCounts[key] ?? 0) + count;
        break;
      }
      case 'sell': {
        const resource = cfg.resources[input.resource];
        const count = quantity(input.quantity);
        if (!resource?.sellPrice) throw new GameError('该资源不能出售。');
        charge(player, input.resource, count);
        player.inventory.money += resource.sellPrice * count;
        break;
      }
      case 'build': {
        const facility = cfg.industries.find((value: any) => value.key === input.facility);
        if (!facility || player.facilities.some((value) => value.key === facility.key)) throw new GameError('设施不可建设。');
        const workers = teamIds(player, input.workers, 0, 7);
        if (workers.some((id) => occupied(player, id))) throw new GameError('成员正在其它活动中。');
        charge(player, 'money', facility.buildMoney);
        player.facilities.push({key: facility.key, level: 1, workers, cursor: now, remainder: 0});
        break;
      }
      case 'workers': {
        const facility = player.facilities.find((value) => value.key === input.facility);
        if (!facility) throw new GameError('设施不存在。');
        const workers = teamIds(player, input.workers, 0, facility.level * 2 + 5);
        const previous = facility.workers;
        facility.workers = [];
        if (workers.some((id) => occupied(player, id))) {
          facility.workers = previous;
          throw new GameError('成员正在其它活动中。');
        }
        facility.workers = workers;
        break;
      }
      case 'upgrade': {
        if (input.facility === 'orchard') {
          if (player.plots.length >= cfg.orchardMaxPlots) throw new GameError('果园已达测试上限。');
          charge(player, 'money', cfg.orchardExpandMoney * player.plots.length);
          charge(player, 'wood', cfg.orchardExpandMaterial);
          charge(player, 'ore', cfg.orchardExpandMaterial);
          player.plots.push({berry: null, plantedAt: 0, cursor: 0, buffer: 0});
          break;
        }
        const facility = player.facilities.find((value) => value.key === input.facility);
        if (!facility || facility.level >= cfg.facilityMaxLevel) throw new GameError('设施不可升级。');
        charge(player, 'money', facility.level * cfg.facilityUpgradeMoney);
        charge(player, 'wood', facility.level * cfg.facilityUpgradeMaterial);
        charge(player, 'ore', facility.level * cfg.facilityUpgradeMaterial);
        facility.level++;
        break;
      }
      case 'plant': {
        const plot = player.plots[input.plot];
        if (!plot || !['oranberry', 'sitrusberry'].includes(input.resource)) throw new GameError('地块或树果无效。');
        if (plot.berry || plot.buffer) throw new GameError('请先收获并移除原果树。');
        charge(player, input.resource, 1);
        Object.assign(plot, {berry: input.resource, plantedAt: now, cursor: now, buffer: 0});
        break;
      }
      case 'harvest': {
        const plot = player.plots[input.plot];
        if (!plot?.berry || !plot.buffer) throw new GameError('没有可收获的树果。');
        player.inventory[plot.berry] = (player.inventory[plot.berry] ?? 0) + plot.buffer;
        plot.buffer = 0;
        break;
      }
      case 'remove-tree': {
        const plot = player.plots[input.plot];
        if (!plot || plot.buffer) throw new GameError('请先收获。');
        Object.assign(plot, {berry: null, plantedAt: 0, cursor: 0, buffer: 0});
        break;
      }
      case 'breed-start': {
        if (!['empty', 'complete'].includes(player.nursery.phase)) throw new GameError('育成盒正在使用。');
        const ids = teamIds(player, input.parents, 2, 2);
        if (ids.some((id) => occupied(player, id))) throw new GameError('双亲正在其它活动中。');
        const parents = ids.map((id) => member(player, id));
        const [a, b] = parents.map((value) => dex.species.get(value.species));
        const ditto = a.id === 'ditto' || b.id === 'ditto';
        if (
          a.eggGroups.includes('Undiscovered') ||
          b.eggGroups.includes('Undiscovered') ||
          (a.id === 'ditto' && b.id === 'ditto') ||
          (!ditto &&
            (parents[0].gender === parents[1].gender ||
              parents.some((value) => value.gender === 'N') ||
              !a.eggGroups.some((group: string) => b.eggGroups.includes(group))))
        ) {
          throw new GameError('双亲不符合原作蛋组/性别配对条件。');
        }
        const count = quantity(input.eggCount, 5);
        let base = ditto ? (a.id === 'ditto' ? b : a) : dex.species.get(parents.find((value) => value.gender === 'F')!.species);
        while (base.prevo) base = dex.species.get(base.prevo);
        const offspring = Array.from({length: count}, () => {
          const child = makePartner(player, base.id, 1, 'hatched');
          const available = [...statKeys];
          for (let i = 0; i < 3; i++) {
            const key = available.splice(Math.floor(random(player) * available.length), 1)[0];
            child.ivs[key] = parents[random(player) < 0.5 ? 0 : 1].ivs[key];
          }
          const compatibility = dex.species.getFullLearnset(base.id);
          for (const move of new Set(parents.flatMap((value) => value.learnedMoves))) {
            const id = dex.moves.get(move).id;
            if (compatibility.some((set: any) => set.learnset[id]?.some((source: string) => /^[1-9][ME]/.test(source)))) {
              if (!child.learnedMoves.includes(move)) child.learnedMoves.push(move);
              child.pp[move] = dex.moves.get(move).pp;
            }
          }
          refreshPartner(child);
          heal(child);
          return child;
        });
        player.nursery = {
          phase: 'producing',
          parents: ids,
          manager: null,
          eggCount: count,
          completeAt: now + cfg.eggProductionSeconds * count * 1000,
          offspring
        };
        break;
      }
      case 'hatch-start': {
        const box = player.nursery;
        if (box.phase !== 'ready') throw new GameError('产蛋阶段尚未完成。');
        const manager = input.manager ? member(player, input.manager) : null;
        if (manager && occupied(player, manager.id)) throw new GameError('主理人正在其它活动中。');
        const speed = manager && ['flamebody', 'magmaarmor', 'steamengine'].includes(dex.abilities.get(manager.ability).id) ? 2 : 1;
        box.phase = 'hatching';
        box.manager = manager?.id ?? null;
        box.completeAt = now + Math.ceil(cfg.hatchSeconds / speed) * 1000;
        break;
      }
      case 'equip': {
        const partner = member(player, input.partner);
        if (player.exploration?.team.includes(partner.id)) throw new GameError('探索中不能从仓库更换持物，请先结束探索。');
        const item = input.resource ? dex.items.get(input.resource) : null;
        if (item && (!item.exists || item.isPokeball || item.zMove)) throw new GameError('该道具不能作为此版本的持物。');
        if (item) charge(player, item.id, 1);
        if (partner.heldItem) player.inventory[partner.heldItem] = (player.inventory[partner.heldItem] ?? 0) + 1;
        partner.heldItem = item?.id ?? '';
        break;
      }
      case 'item-use': {
        const partner = member(player, input.partner);
        if (occupied(player, partner.id)) throw new GameError('请先结束该伙伴的活动或取消备战，再使用仓库道具。');
        const resource = cfg.resources[input.resource];
        if (resource?.kind === 'machine') {
          const move = dex.moves.get(resource.move);
          if (!machineMoves(dex, partner.species).includes(move.id)) throw new GameError('该伙伴不符合第九世代技能机学习条件。');
          if (partner.learnedMoves.some((name) => dex.moves.get(name).id === move.id)) throw new GameError('该伙伴已经掌握这个招式。');
          charge(player, input.resource, 1);
          partner.learnedMoves.push(move.name);
          partner.pp[move.name] = move.pp;
          log(player, now, 'item-use', `${partner.nickname || partner.name}使用${resource.name}，学会了${chineseName('moves', move.id)}。`);
          return {message: '招式已学会，可在伙伴档案中配置招式槽。'};
        }
        const healing = healingAmount(input.resource, partner.maxHp);
        if (healing) {
          if (partner.hp <= 0) throw new GameError('回复道具不能让倒下的伙伴恢复行动。');
          if (partner.hp >= partner.maxHp) throw new GameError('伙伴体力已满，不需要消耗道具。');
          charge(player, input.resource, 1);
          const restored = Math.min(healing, partner.maxHp - partner.hp);
          partner.hp += restored;
          log(player, now, 'item-use', `${partner.nickname || partner.name}使用${resource.name}，回复${restored}点探索体力。`);
          return {message: `已回复${restored}点探索体力。`};
        }
        const target = dex.species
          .get(partner.species)
          .evos.map((name: string) => dex.species.get(name))
          .find((species: any) => species.evoType === 'useItem' && dex.items.get(species.evoItem).id === input.resource);
        if (target) return this.apply(player, world, {kind: 'evolve', partner: partner.id, target: target.id}, now);
        throw new GameError('该道具不能直接对伙伴使用。');
      }
      case 'train': {
        const partner = member(player, input.partner);
        const amount = quantity(input.amount, 252);
        if (
          !statKeys.includes(input.stat) ||
          partner.evs[input.stat as keyof typeof partner.evs] + amount > 252 ||
          Object.values(partner.evs).reduce((a, b) => a + b, 0) + amount > 510
        )
          throw new GameError('努力值超过原作上限。');
        charge(player, 'training', amount);
        partner.evs[input.stat as keyof typeof partner.evs] += amount;
        refreshPartner(partner);
        break;
      }
      case 'moves': {
        const partner = member(player, input.partner);
        if (
          !Array.isArray(input.moves) ||
          input.moves.length < 1 ||
          input.moves.length > 4 ||
          new Set(input.moves).size !== input.moves.length ||
          input.moves.some((move: string) => !partner.learnedMoves.includes(move))
        ) {
          throw new GameError('只能装备已掌握的1–4个不同招式。');
        }
        partner.moves = [...input.moves];
        break;
      }
      case 'evolve': {
        const partner = member(player, input.partner);
        if (occupied(player, partner.id)) throw new GameError('请先结束该成员的活动。');
        const current = dex.species.get(partner.species);
        const target = dex.species.get(input.target);
        if (!current.evos.includes(target.name)) throw new GameError('不是合法进化分支。');
        if (target.evoLevel && partner.level < target.evoLevel) throw new GameError('等级尚未达到。');
        if (target.evoType === 'useItem') charge(player, dex.items.get(target.evoItem).id, 1);
        else if (target.evoType || !target.evoLevel) throw new GameError('此分支需要额外条件，当前测试入口只处理等级和进化石。');
        const converted = makePartner(player, target.id, partner.level, partner.origin, partner.gender);
        Object.assign(partner, {species: converted.species, name: converted.name, image: converted.image, ability: converted.ability});
        refreshPartner(partner);
        break;
      }
      case 'gym-challenge':
        return this.reserveGym(player, world, input.gym, now);
      case 'debug':
        return this.debug(player, world, input.command, now);
      default:
        throw new GameError('未知游戏命令。');
    }
    log(player, now, input.kind, `已完成：${actionNames[input.kind] ?? '冒险操作'}`);
    return {message: '操作成功。'};
  }

  private debug(player: PlayerState, world: WorldState, command: unknown, now: number): any {
    if (!this.testMode) throw new GameError('测试指令未开启。', 403);
    if (typeof command !== 'string' || command.length > 160) throw new GameError('测试指令无效。');
    let [verb, a, b, ...extra] = command.trim().split(/\s+/);
    verb =
      (
        {
          '/资源': '/grant',
          '/加速': '/time',
          '/变速': '/speed',
          '/伙伴': '/pokemon',
          '/等级': '/level',
          '/恢复': '/heal',
          '/赛季': '/season',
          '/帮助': '/help'
        } as any
      )[verb] ?? verb;
    if (verb === '/grant') {
      const machine = /^技能机0*(\d+)$/.exec(a ?? '');
      if (machine) a = machineCatalog.find((entry) => entry.number === Number(machine[1]))?.resource ?? a;
      a =
        Object.keys(cfg.resources).find((key) => cfg.resources[key].name === a) ??
        Object.keys(chineseNames.items).find((key) => chineseNames.items[key] === a) ??
        a;
    } else if (verb === '/pokemon') a = speciesCatalog.find((entry) => entry.name === a)?.key ?? a;
    else if (verb === '/level' && a === '全体') a = 'all';
    else if (verb === '/season' && a === '下一季') a = 'next';
    else if (verb === '/time') a = (a ?? '').replace('小时', 'h').replace('分钟', 'm').replace('天', 'd').replace('秒', 's');
    if (extra.length) throw new GameError('测试指令参数过多。');
    if (verb === '/speed') {
      if (b) throw new GameError('格式：/变速 2');
      return this.setSpeed(player, Number(a));
    }
    if (verb === '/grant') {
      const amount = quantity(Number(b), 10000000);
      if (!cfg.resources[a] && !dex.items.get(a).exists) throw new GameError('资源不存在。');
      const key = cfg.resources[a] ? a : dex.items.get(a).id;
      player.inventory[key] = (player.inventory[key] ?? 0) + amount;
    } else if (verb === '/time') {
      if (b) throw new GameError('格式：/加速 8小时');
      const match = /^(\d+)(s|m|h|d)$/.exec(a ?? '');
      if (!match) throw new GameError('格式：/加速 30分钟、/加速 8小时、/加速 7天');
      const seconds = Number(match[1]) * {s: 1, m: 60, h: 3600, d: 86400}[match[2]]!;
      quantity(seconds, 30 * 86400);
      this.clock.advance(player, seconds * 1000);
    } else if (verb === '/pokemon') {
      const level = quantity(Number(b), 100);
      player.pokemon.push(makePartner(player, a, level, 'test-command'));
    } else if (verb === '/level' && a === 'all') {
      const level = quantity(Number(b), 100);
      for (const partner of player.pokemon) {
        partner.exp = experienceAt(partner.species, level);
        refreshPartner(partner);
      }
    } else if (verb === '/heal' && !a && !b) player.pokemon.forEach(heal);
    else if (verb === '/season' && a === 'next' && !b) {
      if (world.gyms.some((gym) => gym.activeBattleId)) throw new GameError('仍有道馆比赛进行中，请稍后切季。', 409);
      world.season++;
      world.gyms = newGyms(world.season);
    } else if (verb === '/help' && !a && !b) {
      return {message: '/资源 金钱 数量；/加速 8小时；/变速 2；/伙伴 物种 等级；/等级 全体 100；/恢复；/赛季 下一季（全服）'};
    } else throw new GameError('指令：/资源 金钱 数量；/加速 8小时；/伙伴 物种 等级；/等级 全体 100；/恢复；/赛季 下一季');
    const description = readableLog(`${verb} ${a ?? ''} ${b ?? ''}`.trim(), cfg.resources);
    log(player, now, 'test', `测试指令：${description}`);
    return {message: `已执行：${description}`};
  }

  private setSpeed(player: PlayerState, speed: number): any {
    if (!this.testMode) throw new GameError('测试倍率未开启。', 403);
    this.clock.setRate(player, speed);
    log(player, this.clock.now(player), 'test-speed', `挂机流速已设为${speed}倍，已累计进度保留。`);
    return {message: `挂机流速已设为${speed}倍。`};
  }

  private reserveGym(player: PlayerState, world: WorldState, key: unknown, now: number): any {
    if (!player.readyPresetId) throw new GameError('请先在伙伴与编队页面选择预设并进入备战。');
    if (this.pendingGym(player.id)) throw new GameError('已有道馆比赛进行中，请等待结束。');
    const gym = world.gyms.find((value) => value.key === key);
    if (!gym || gym.activeBattleId || gym.ownerId === player.id) throw new GameError('该道馆当前不可挑战。', 409);
    const ids = teamIds(player, player.team, 6, 6);
    this.checkAvailable(player, ids, true);
    const left = createDefenseSnapshot(
      `player:${player.id}`,
      ids.map((id) => battleMember(member(player, id))),
      player.tactic
    );
    let right = gym.defense;
    if (!right) {
      const template = npcTemplates[Math.floor(random(player) * npcTemplates.length)];
      right = {
        team: template.team.map((value) => {
          let species = dex.species.get(value.species);
          function minimumLevel(data: any): number {
            return Math.max(data.evoLevel ?? 1, data.prevo ? minimumLevel(dex.species.get(data.prevo)) : 1);
          }
          while (species.prevo && minimumLevel(species) > gym.level) species = dex.species.get(species.prevo);
          if (species.name === value.species) return {...structuredClone(value), level: gym.level};
          return {
            ...structuredClone(value),
            species: species.name,
            level: gym.level,
            ability: species.abilities['0'],
            moves: learnedAt(species.id, gym.level).slice(0, 4)
          };
        }),
        tactic: template.tactic
      };
    }
    try {
      validateTeam(left.team);
      validateTeam(right.team);
    } catch {
      throw new GameError('队伍不符合当前赛制，请检查成员、招式、等级或培养数值。');
    }
    const id = randomUUID();
    charge(player, 'money', cfg.gymChallengeMoney);
    gym.activeBattleId = id;
    const battle = {
      id,
      ownerId: player.id,
      defenderId: gym.ownerId ?? null,
      status: 'queued',
      createdAt: new Date().toISOString(),
      kind: 'gym',
      gymKey: gym.key,
      season: world.season,
      seatVersion: gym.version,
      snapshot: left,
      input: {left: left.team, right: right.team, npcTactic: right.tactic, playerTactic: left.tactic, agent: 'tactics'},
      result: null
    };
    this.saveBattle(battle);
    log(player, now, 'gym', `已向${gym.name}发起挑战，双方队伍已固定。`);
    return {message: '挑战已受理。', battleId: id};
  }

  /** 同条件对照：用当前备战的队伍与战术，对同一对手、同一份种子跑 direct 与 refined 两种模式。 */
  compare(request: {id: string; tactic?: string; seed?: number[]}): any {
    if (typeof request?.id !== 'string' || !request.id) throw new GameError('对照实验需要账号。');
    const player = this.store.player(request.id);
    const tactic = String(request.tactic ?? player.tactic ?? '').replace(/\r\n?/g, '\n');
    if (tacticLength(tactic) > TACTIC_LIMIT) throw new GameError('战术最多500字。');
    const ids = teamIds(player, player.team, 6, 6);
    const left = ids.map((id) => battleMember(member(player, id)));
    const template = npcTemplates[0];
    const seed = request.seed ?? [3, 5, 7, 11];
    const report = runComparison(tactic, strategyDex, {seed, left, right: template.team, index: strategyNames(strategyDex)});
    const record = toRecord(report);
    const id = randomUUID();
    this.store.saveComparison(id, player.id, new Date(this.clock.realNow()).toISOString(), tactic, record);
    return {id, record};
  }
  /** 本人最近的对照结果；别的账号查不到。 */
  comparisons(id: string): any[] {
    if (typeof id !== 'string' || !id) throw new GameError('对照实验需要账号。');
    return this.store.comparisons(id, 10);
  }
  private saveBattle(battle: any): void {
    this.store.db.prepare('INSERT OR REPLACE INTO gym_battles VALUES(?,?,?)').run(battle.id, battle.ownerId, JSON.stringify(battle));
  }
  battle(id: string, ownerId?: string): any {
    const row = this.store.db.prepare('SELECT state FROM gym_battles WHERE id=?').get(id) as any;
    if (!row) return null;
    const battle = JSON.parse(row.state);
    if (ownerId !== undefined && battle.ownerId !== ownerId && battle.defenderId !== ownerId) {
      throw new GameError('没有该战报的访问权限。', 403);
    }
    return battle;
  }
  finishGym(id: string, result?: BattleResult, error?: string): void {
    this.store.transaction(() => {
      const battle = this.battle(id);
      if (!battle || ['completed', 'error'].includes(battle.status)) return;
      const player = this.store.player(battle.ownerId);
      const world = this.store.world();
      const gym = world.gyms.find((value) => value.key === battle.gymKey)!;
      const before = stockTotals(player);
      const valid = gym.activeBattleId === id && world.season === battle.season && gym.version === battle.seatVersion;
      battle.status = result ? 'completed' : 'error';
      battle.result = result;
      battle.error = error;
      if (valid) {
        gym.activeBattleId = null;
        if (result?.winnerSide === 'p1') {
          gym.holderKind = 'player';
          gym.ownerId = player.id;
          gym.ownerName = player.username;
          gym.defense = battle.snapshot;
          gym.version++;
          const honor = `${world.season}:${gym.key}`;
          if (!player.honors.includes(honor)) {
            player.honors.push(honor);
            player.inventory.money += cfg.gymFirstWinMoney;
          }
          log(player, this.clock.now(player), 'gym', `挑战获胜！你已接任${gym.name}馆主，防守队伍固定。`);
        } else log(player, this.clock.now(player), 'gym', result ? `${gym.name}挑战结束，未取得席位。` : '道馆执行异常，未判负。');
      } else {
        battle.stale = true;
        log(player, this.clock.now(player), 'gym', `${gym.name}本场席位结算已失效，未用于变更席位。`);
      }
      if (battle.defenderId) {
        const defender = this.store.player(battle.defenderId);
        const message = !valid
          ? '本场席位结算已失效，未用于变更席位。'
          : !result
            ? '技术异常，席位不受影响。'
            : result.winnerSide === 'p1'
              ? '席位已被挑战者接替。'
              : '防守完成，继续担任馆主。';
        log(defender, this.clock.now(defender), 'gym-defense', `${gym.name}受到挑战：${message}`);
        this.store.savePlayer(defender);
      }
      this.saveBattle(battle);
      this.store.audit(player, before, this.clock.now(player), '道馆结果');
      this.store.savePlayer(player);
      this.store.saveWorld(world);
    });
  }
}
