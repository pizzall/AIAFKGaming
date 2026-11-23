import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {readFileSync, writeFileSync, renameSync, existsSync, mkdirSync} from 'node:fs';
import {resolve, join, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {playerTeam, fixtureFingerprint} from './battle/fixtures.ts';
import {publishRuleVersion} from './battle/publication.ts';
import {publicDecisions, type BattleResult} from './battle/runner.ts';
import {GameService} from './game/service.ts';
import {gameRoutes} from './game/routes.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
interface BattleJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'error';
  createdAt: string;
  result?: BattleResult;
  error?: string;
  ownerId?: string;
  input?: any;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage): Promise<unknown> {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text) > 8192) throw new Error('Request too large');
  }
  return JSON.parse(text || '{}');
}

export function createAppServer(options: {dataDirectory?: string; testMode?: boolean} = {}) {
  const directory = options.dataDirectory ?? join(root, '.runtime/battles');
  mkdirSync(directory, {recursive: true});
  const game = new GameService(join(directory, 'game.sqlite'), {testMode: options.testMode});
  let stopping = false;
  const jobs = new Map<string, BattleJob>();
  const active = new Map<string, Worker>();
  const queue: BattleJob[] = [];
  const effects = JSON.parse(readFileSync(join(root, 'config/battle-effects.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(root, 'config/effect-catalog.json'), 'utf8'));
  const ruleFingerprint = publishRuleVersion(join(directory, 'rules'), effects.revision, {config: effects, catalog});
  const pokemon = JSON.parse(readFileSync(join(root, 'data/pokemon.json'), 'utf8'));
  const party = playerTeam.map(member => {
    const entry = pokemon.find((value: any) => value.identifier === member.species.toLowerCase());
    return {...member, name: entry?.name_zh_hans ?? member.species, image: entry?.images?.front ?? null};
  });

  function save(job: BattleJob): void {
    if (job.ownerId) return;
    const path = join(directory, `${job.id}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(job));
    renameSync(`${path}.tmp`, path);
  }

  function launch(): void {
    while (active.size < 2 && queue.length) {
      const job = queue.shift()!;
      job.status = 'running';
      save(job);
      const worker = new Worker(new URL('./battle/worker.ts', import.meta.url), {
        execArgv: [], workerData: {ruleFingerprint, fixtureFingerprint, battleInput: job.input}
      });
      active.set(job.id, worker);
      let received = false;
      worker.on('message', (message: {result?: BattleResult; error?: string}) => {
        if (stopping) return;
        received = true;
        job.status = message.result ? 'completed' : 'error';
        job.result = message.result;
        job.error = message.error;
        if (job.ownerId) game.finishGym(job.id, message.result, message.error);
        save(job);
      });
      worker.on('error', error => {
        if (stopping) return;
        received = true;
        job.status = 'error';
        job.error = error.message;
        if (job.ownerId) game.finishGym(job.id, undefined, error.message);
        save(job);
      });
      worker.on('exit', () => {
        if (stopping) return;
        if (!received) {
          job.status = 'error';
          job.error = 'Battle worker stopped without a result';
          if (job.ownerId) game.finishGym(job.id, undefined, job.error);
          save(job);
        }
        active.delete(job.id);
        launch();
      });
    }
  }

  const handleGame = gameRoutes({game, readBody: body, json, enqueue(battle) {
    if (jobs.has(battle.id) || battle.status !== 'queued') return;
    const job: BattleJob = {...battle, ownerId: battle.ownerId, input: battle.input};
    jobs.set(job.id, job); queue.push(job); launch();
  }});

  function publicJob(job: BattleJob) {
    const result = job.result;
    return {
      id: job.id, status: job.status, createdAt: job.createdAt, agentKind: result?.agentKind ?? 'scripted',
      ...(result ? {
        turns: result.turns, winner: result.winner, events: result.events,
        configRevision: result.configRevision, decisionCount: result.decisions.length,
        decisions: publicDecisions(result)
      } : {}),
      ...(job.error ? {error: '战斗执行异常，请查看本地执行记录。'} : {})
    };
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (await handleGame(request, response, path)) return;
      if (request.method === 'GET' && path === '/api/health') {
        json(response, 200, {ok: true, mechanics: 'gen9 + Mega', levelPolicy: 'actual', aiEnabled: true, agentKind: 'tactics'});
      } else if (request.method === 'GET' && path === '/api/lab') {
        json(response, 200, {party, effects, npcName: '研究员青叶', agentKind: 'scripted'});
      } else if (request.method === 'POST' && path === '/api/battles') {
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) { json(response, 403, {error: 'Origin rejected'}); return; }
        const input = await body(request);
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
          json(response, 400, {error: '本阶段只接受固定测试队伍，比赛结果由服务器生成。'});
          return;
        }
        if (queue.length + active.size >= 8) { json(response, 429, {error: '执行队列已满，请稍后重试。'}); return; }
        const job: BattleJob = {id: randomUUID(), status: 'queued', createdAt: new Date().toISOString()};
        jobs.set(job.id, job);
        queue.push(job);
        save(job);
        json(response, 202, {id: job.id, status: job.status});
        launch();
      } else if (request.method === 'GET' && /^\/api\/battles\/[a-f0-9-]{36}$/.test(path)) {
        const id = path.split('/').at(-1)!;
        let job = jobs.get(id);
        if (job?.ownerId || game.battle(id)) { json(response, 404, {error: 'Not found'}); return; }
        if (!job && existsSync(join(directory, `${id}.json`))) {
          job = JSON.parse(readFileSync(join(directory, `${id}.json`), 'utf8')) as BattleJob;
          if (job.status === 'running' || job.status === 'queued') job = {...job, status: 'error', error: 'Interrupted'};
        }
        if (!job) json(response, 404, {error: '没有找到这场战斗。'});
        else json(response, 200, publicJob(job));
      } else if (request.method === 'GET' && !path.startsWith('/api/')) {
        const isPokemon = path.startsWith('/assets/pokemon/');
        const isLab = path.startsWith('/battle-lab/');
        const base = isPokemon ? join(root, 'assets/pokemon') : join(root, isLab ? 'web/battle-lab' : 'web/game');
        const relative = isPokemon ? path.slice('/assets/pokemon/'.length)
          : isLab ? path.slice('/battle-lab/'.length) || 'index.html' : path === '/' ? 'index.html' : path.replace(/^\//, '');
        const file = resolve(base, relative);
        if (!file.startsWith(resolve(base) + sep) || !existsSync(file)) { json(response, 404, {error: 'Not found'}); return; }
        const types: Record<string, string> = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png'};
        response.writeHead(200, {'Content-Type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8`});
        response.end(readFileSync(file));
      } else json(response, 404, {error: 'Not found'});
    } catch {
      if (!response.headersSent) json(response, 400, {error: '请求无效。'});
      else response.end();
    }
  });
  server.on('close', () => {
    stopping = true;
    queue.splice(0);
    for (const worker of active.values()) void worker.terminate();
    game.close();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 8787);
  createAppServer({testMode: process.argv.includes('--test-mode')}).listen(port, '127.0.0.1', () => {
    console.log(`AFK Pokemon: http://127.0.0.1:${port} (${process.argv.includes('--test-mode') ? 'test commands enabled' : 'normal'})`);
  });
}
