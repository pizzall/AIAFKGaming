import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {createAppServer} from '../src/server.ts';

test('the H5 API runs a real background match and returns a filtered, persisted report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'afk-battle-'));
  const server = createAppServer({dataDirectory: directory});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as {port: number};
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const escape = await fetch(`${base}/assets/pokemon/..%2F..%2Fconfig/battle-teams.json`);
    assert.equal(escape.status, 404);
    const lab = await (await fetch(`${base}/api/lab`)).json() as {party: Array<{image: string}>};
    assert.ok(lab.party.every(member => member.image?.startsWith('assets/pokemon/front/')));
    assert.equal((await fetch(`${base}/api/battles/not-an-id`)).status, 404);
    const invalid = await fetch(`${base}/api/battles`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({winner: 'me', npcIndex: 0})
    });
    assert.equal(invalid.status, 400);
    const response = await fetch(`${base}/api/battles`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
    });
    assert.equal(response.status, 202);
    const job = await response.json() as {id: string};
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    let report: any;
    for (let attempt = 0; attempt < 150; attempt++) {
      report = await (await fetch(`${base}/api/battles/${job.id}`)).json();
      if (report.status === 'completed' || report.status === 'error') break;
      await pause(100);
    }
    assert.equal(report.status, 'completed', report.error);
    assert.equal(report.agentKind, 'scripted');
    const stored = JSON.parse(await readFile(join(directory, `${job.id}.json`), 'utf8'));
    assert.equal(stored.result.privateSnapshot.npcTeam.length, 6);
    const published = JSON.parse(await readFile(join(directory, 'rules', `${stored.result.configRevision}.json`), 'utf8'));
    assert.equal(published.fingerprint, stored.result.ruleFingerprint);
    assert.ok(report.events.length > 20);
    assert.ok(report.events.some((line: string) => line.includes('|-mega|')));
    assert.ok(!JSON.stringify(report).includes('privateSnapshot'));
    assert.ok(!JSON.stringify(report).includes('npcTemplateKey'));
    assert.ok(!JSON.stringify(report).includes('npcTactic'));
    assert.ok(!report.events.some((line: string) => line.startsWith('|split|') || line.startsWith('|request|')));
    assert.equal((await fetch(`${base}/`)).status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, {recursive: true, force: true});
  }
});
