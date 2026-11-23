import {parentPort, workerData} from 'node:worker_threads';
import {runBattle, ruleFingerprint} from './runner.ts';
import {fixtureFingerprint} from './fixtures.ts';

try {
  if (ruleFingerprint !== workerData.ruleFingerprint || fixtureFingerprint !== workerData.fixtureFingerprint) {
    throw new Error('Configuration changed after server startup; publish a new revision and restart');
  }
  parentPort!.postMessage({result: runBattle(workerData.battleInput)});
} catch (error) {
  parentPort!.postMessage({error: error instanceof Error ? error.message : 'Battle failed'});
}
