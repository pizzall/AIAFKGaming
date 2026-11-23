// 把拆解出的战术意图接入真实引擎。决策只读取本方请求（request.side，引擎只发本方信息）
// 与自己记下的动作记录；对手的队伍、招式池和选择从不进入这里。

import type {Engine} from './engine.ts';
import {parseIntent, resolveMove, type Intent} from './tactics.ts';

export interface DecisionTrace {
  sequence: number;
  side: 'p1';
  choice: string;
  /** 本轮直接决策时没有接进决策的意图信息（条件/例外/否定），留给后续轮次。 */
  ignored: string[];
  reason: string;
}

export interface TacticsAgent {
  readonly kind: 'tactics';
  readonly intent: Intent;
  readonly decisions: DecisionTrace[];
  decide(request: any): string;
}

/**
 * 常用且没有歧义的中文招式名 → 引擎英文名，只在引擎原名查不到时使用。
 * 例如「保护」同时是道具与 Exchange 招式，所以故意不在这里出现。
 */
export const MOVE_ALIASES: Record<string, string> = {
  十万伏特: 'Thunderbolt', 打雷: 'Thunder', 冰冻光束: 'Ice Beam', 冰冻之风: 'Icy Wind', 急冻光线: 'Ice Beam',
  喷射火焰: 'Flamethrower', 大字爆炎: 'Fire Blast', 热风: 'Heat Wave', 鬼火: 'Will-O-Wisp', 闪焰冲锋: 'Flare Blitz',
  日光束: 'Solar Beam', 疯狂植物: 'Frenzy Plant', 种子炸弹: 'Seed Bomb', 飞叶风暴: 'Leaf Storm', 叶刃: 'Leaf Blade',
  能量球: 'Energy Ball', 亿吸: 'Giga Drain', 寄生种子: 'Leech Seed', 蘑菇孢子: 'Spore', 愤怒之粉: 'Rage Powder',
  强力鞭打: 'Power Whip', 冲浪: 'Surf', 热水: 'Scald', 水炮: 'Hydro Pump', 加农水炮: 'Hydro Cannon', 水流喷射: 'Aqua Jet',
  嬉闹: 'Play Rough', 液态强击: 'Liquidation', 近身战: 'Close Combat',
  地震: 'Earthquake', 大地之力: 'Earth Power', 岩崩: 'Rock Slide', 尖石攻击: 'Stone Edge', 岩石封锁: 'Rock Tomb',
  龙爪: 'Dragon Claw', 逆鳞: 'Outrage', 龙之波: 'Dragon Pulse', 龙星群: 'Draco Meteor', 龙尾: 'Dragon Tail',
  空气斩: 'Air Slash', 暴风: 'Hurricane', 勇鸟猛攻: 'Brave Bird', 羽栖: 'Roost',
  子弹拳: 'Bullet Punch', 急速折返: 'U-turn', 十字剪: 'X-Scissor', 拍落: 'Knock Off', 铁头: 'Iron Head', 铁壁: 'Iron Defense',
  意念头槌: 'Zen Headbutt', 影子球: 'Shadow Ball', 恶之波动: 'Dark Pulse',
  浊流: 'Muddy Water', 自我再生: 'Recover', 偷懒: 'Slack Off',
  魔法闪耀: 'Dazzling Gleam', 月亮之力: 'Moonblast', 看我嘛: 'Follow Me'
};

function speciesOf(dex: typeof Engine.Dex.prototype, value: any): string {
  return dex.species.get(String(value?.species ?? value?.set?.species ?? '')).id;
}

function slotOf(active: any, wanted: string): number {
  return active.moves.findIndex((move: any) => move.id === wanted && !move.disabled && move.pp !== 0);
}

export function createTacticsAgent(dex: typeof Engine.Dex.prototype, tactic: string): TacticsAgent {
  const intent = parseIntent(tactic);
  const decisions: DecisionTrace[] = [];
  let sequence = 0;
  const ignored = () => [
    ...intent.negations.map((value) => `否定：${value}`),
    ...intent.exceptions.map((value) => `例外：${value}`),
    ...intent.conditions.map((value) => `条件：${value}`)
  ];
  void dex;
  void resolveMove;
  void speciesOf;
  void slotOf;
  return {
    kind: 'tactics',
    intent,
    decisions,
    decide(request: any): string {
      sequence++;
      if (request.wait) return '';
      const condition = (slot: number) => request.side?.pokemon?.[slot]?.condition ?? '0 fnt';
      const alive = (slot: number) => !condition(slot).endsWith(' fnt');
      if (request.forceSwitch) {
        // 第一轮：换人只看队伍顺序，不读「换上」写法，也不看对位与条件。
        const used = new Set<number>();
        const choice = request.forceSwitch
          .map((forced: boolean) => {
            if (!forced) return 'pass';
            // 轮换请求里 active 仍标记着刚倒下的位置，不能用来排除；同一位置也只能被一个替换占用。
            // 本轮已知不足：这只宝可梦下一次上场才是替换目标，引擎接受这条命令前会先回填，
            // 所以这条“按队伍顺序、不看对位”的规则经常被引擎拒绝。
            const slot = request.side.pokemon.findIndex((_: any, index: number) => alive(index) && !used.has(index));
            if (slot < 0) return 'pass';
            used.add(slot);
            return `switch ${slot + 1}`;
          })
          .join(', ');
        decisions.push({sequence, side: 'p1', choice, ignored: ignored(), reason: '按队伍顺序换入第一只可用宝可梦' });
        return choice;
      }
      const choice = request.active
        .map((active: any, index: number) => {
          if (!active || !alive(index)) return 'pass';
          const slot = active.moves.findIndex((move: any) => !move.disabled && move.pp !== 0);
          if (slot < 0) return 'move 1';
          const move = active.moves[slot];
          const target = ['normal', 'any', 'adjacentFoe'].includes(move.target) ? ' 1' : '';
          return `move ${slot + 1}${target}`;
        })
        .join(', ');
      decisions.push({sequence, side: 'p1', choice, ignored: ignored(), reason: '使用第一个可用招式' });
      return choice;
    }
  };
}
