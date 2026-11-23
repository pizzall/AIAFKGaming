import {DatabaseSync} from 'node:sqlite';
import {randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
import type {PlayerState, WorldState} from './types.ts';
import {GameError} from './types.ts';
import {systemRealNow} from './clock.ts';
import {stockTotals} from './supplies.ts';

export class GameStore {
  readonly db: DatabaseSync;
  readonly realNow: () => number;
  constructor(path: string, initialWorld: WorldState, realNow: () => number = systemRealNow) {
    this.realNow = realNow;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, player_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS world(id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(player_id TEXT, id TEXT, hash TEXT, response TEXT, PRIMARY KEY(player_id,id));
      CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY, player_id TEXT, at INTEGER, reason TEXT, deltas TEXT);
      CREATE TABLE IF NOT EXISTS gym_battles(id TEXT PRIMARY KEY, owner_id TEXT, state TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO world VALUES(1,?)').run(JSON.stringify(initialWorld));
  }

  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  register(username: string, password: string, factory: (id: string, username: string) => PlayerState) {
    username = username.trim().toLowerCase();
    if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username) || password.length < 6 || password.length > 128) {
      throw new GameError('用户名需2–24字，密码需6–128字。');
    }
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM accounts WHERE username=?').get(username)) throw new GameError('用户名已存在。', 409);
      const id = randomUUID();
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(password, salt, 64).toString('hex');
      this.db.prepare('INSERT INTO accounts VALUES(?,?,?)').run(id, username, `${salt}:${hash}`);
      this.savePlayer(factory(id, username));
      return {playerId: id, token: this.createSession(id)};
    });
  }

  login(username: string, password: string) {
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) throw new GameError('登录失败。');
    const account = this.db.prepare('SELECT * FROM accounts WHERE username=?').get(username.trim().toLowerCase()) as any;
    const [salt, hash] = (account?.password ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const candidate = scryptSync(password, salt, 64);
    if (!account || !timingSafeEqual(candidate, Buffer.from(hash, 'hex'))) throw new GameError('用户名或密码错误。', 401);
    return {playerId: account.id as string, token: this.createSession(account.id)};
  }

  private createSession(id: string): string {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(this.tokenHash(token), id, this.realNow() + 30 * 86400000);
    return token;
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  session(token: string): string | null {
    const row = this.db
      .prepare('SELECT player_id FROM sessions WHERE token=? AND expires>?')
      .get(this.tokenHash(token), this.realNow()) as any;
    return row?.player_id ?? null;
  }
  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token=?').run(this.tokenHash(token));
  }
  player(id: string): PlayerState {
    const row = this.db.prepare('SELECT state FROM players WHERE id=?').get(id) as any;
    if (!row) throw new GameError('账号不存在。', 401);
    return JSON.parse(row.state);
  }
  savePlayer(player: PlayerState): void {
    this.db.prepare('INSERT OR REPLACE INTO players VALUES(?,?)').run(player.id, JSON.stringify(player));
  }
  world(): WorldState {
    return JSON.parse((this.db.prepare('SELECT state FROM world WHERE id=1').get() as any).state);
  }
  saveWorld(world: WorldState): void {
    this.db.prepare('UPDATE world SET state=? WHERE id=1').run(JSON.stringify(world));
  }
  audit(player: PlayerState, before: Record<string, number>, at: number, reason: string): void {
    const after = stockTotals(player);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changes = Object.fromEntries([...keys].map((key) => [key, (after[key] ?? 0) - (before[key] ?? 0)]));
    const deltas = Object.fromEntries(Object.entries(changes).filter(([, amount]) => amount));
    if (Object.keys(deltas).length) {
      this.db.prepare('INSERT INTO ledger(player_id,at,reason,deltas) VALUES(?,?,?,?)').run(player.id, at, reason, JSON.stringify(deltas));
    }
  }
  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}
