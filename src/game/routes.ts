import type {IncomingMessage, ServerResponse} from 'node:http';
import type {GameService} from './service.ts';
import {GameError} from './types.ts';

interface RouteContext {
  game: GameService;
  readBody(request: IncomingMessage): Promise<unknown>;
  json(response: ServerResponse, status: number, value: unknown): void;
  enqueue(battle: any): void;
}

export function gameRoutes(context: RouteContext) {
  const {game, readBody, json, enqueue} = context;
  return async (request: IncomingMessage, response: ServerResponse, path: string): Promise<boolean> => {
    if (!path.startsWith('/api/auth/') && !path.startsWith('/api/game/')) return false;
    try {
      if (request.method !== 'GET') {
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) throw new GameError('跨站操作已拒绝。', 403);
      }
      const token =
        (request.headers.cookie ?? '')
          .split(';')
          .map((value) => value.trim())
          .find((value) => value.startsWith('afk_session='))
          ?.slice('afk_session='.length) ?? '';
      if (request.method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(path)) {
        const input = (await readBody(request)) as any;
        if (typeof input?.username !== 'string' || typeof input?.password !== 'string') throw new GameError('请输入用户名和密码。');
        const result = path.endsWith('/register')
          ? game.register(input.username, input.password)
          : game.login(input.username, input.password);
        response.setHeader('Set-Cookie', `afk_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
        json(response, path.endsWith('/register') ? 201 : 200, {playerId: result.playerId});
        return true;
      }
      const owner = game.session(token);
      if (request.method === 'GET' && path === '/api/auth/session') {
        json(response, 200, {authenticated: !!owner});
        return true;
      }
      if (!owner) throw new GameError('请先登录。', 401);
      if (request.method === 'POST' && path === '/api/auth/logout') {
        game.logout(token);
        response.setHeader('Set-Cookie', 'afk_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        json(response, 200, {ok: true});
      } else if (request.method === 'GET' && path === '/api/game/catalog') json(response, 200, game.catalog());
      else if (request.method === 'GET' && path === '/api/game/state') json(response, 200, game.state(owner));
      else if (request.method === 'POST' && path === '/api/game/command') {
        const input = (await readBody(request)) as any;
        const {commandId, ...command} = input ?? {};
        const result = game.command(owner, commandId, command);
        if (result.battleId) enqueue(game.battle(result.battleId, owner));
        json(response, 200, result);
      } else if (request.method === 'GET' && /^\/api\/game\/battles\/[a-f0-9-]{36}$/.test(path)) {
        const battle = game.battle(path.split('/').at(-1)!, owner);
        if (!battle) throw new GameError('战斗不存在。', 404);
        json(response, 200, {
          id: battle.id,
          status: battle.status,
          gymKey: battle.gymKey,
          stale: battle.stale,
          agentKind: battle.result?.agentKind ?? 'scripted',
          winnerSide: battle.result?.winnerSide,
          viewerSide: battle.ownerId === owner ? 'p1' : 'p2',
          turns: battle.result?.turns,
          events: (battle.ownerId === owner ? battle.result?.events : battle.result?.opponentEvents) ?? [],
          decisions: battle.ownerId === owner ? (battle.result?.playerDecisions ?? []) : [],
          error: battle.status === 'error' ? '执行异常，未判为玩家失败。' : undefined
        });
      } else if (request.method === 'POST' && path === '/api/game/compare') {
        // 同条件对照：tactic 可覆盖当前战术；seed 可复现。只跑玩家自己的队伍与固定 NPC 模板。
        const input = (await readBody(request)) as any;
        json(response, 200, game.compare({id: owner, tactic: input?.tactic, seed: input?.seed}));
      } else if (request.method === 'GET' && path === '/api/game/compare') {
        json(response, 200, {comparisons: game.comparisons(owner)});
      } else throw new GameError('接口不存在。', 404);
    } catch (error) {
      json(response, error instanceof GameError ? error.status : 400, {error: error instanceof Error ? error.message : '操作失败。'});
    }
    return true;
  };
}
