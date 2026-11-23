import {GameError, type PlayerClockState} from './types.ts';

export const systemRealNow = (): number => Date.now();
export interface GameClockSnapshot {
  realTime: number;
  gameTime: number;
  rate: number;
}

export class GameClock {
  readonly realNow: () => number;
  constructor(realNow: () => number = systemRealNow) {
    this.realNow = realNow;
  }

  read(player: PlayerClockState, realTime = this.realNow()): GameClockSnapshot {
    const rate = player.clockRate ?? 1;
    const anchor = player.clockAnchorRealAt ?? realTime;
    return {realTime, gameTime: anchor + player.clockOffset + Math.max(0, realTime - anchor) * rate, rate};
  }
  now(player: PlayerClockState): number {
    return this.read(player).gameTime;
  }

  setRate(player: PlayerClockState, rate: number, realTime = this.realNow()): void {
    if (!Number.isSafeInteger(rate) || rate < 1 || rate > 1000) throw new GameError('挂机倍率需为1–1000之间的整数。');
    const snapshot = this.read(player, realTime);
    player.clockOffset = snapshot.gameTime - realTime;
    player.clockAnchorRealAt = realTime;
    player.clockRate = rate;
  }
  advance(player: PlayerClockState, milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new GameError('推进时长无效。');
    player.clockOffset += milliseconds;
  }
  remainingSeconds(snapshot: GameClockSnapshot, deadline: number): number {
    return Math.ceil(Math.max(0, deadline - snapshot.gameTime) / snapshot.rate / 1000);
  }
}
