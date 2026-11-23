import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishRuleVersion} from '../src/battle/publication.ts';

test('a published revision rejects changed JSON even across separate publication calls', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-rules-'));
  try {
    const first = publishRuleVersion(directory, 'v1', {healing: [1, 16]});
    assert.equal(publishRuleVersion(directory, 'v1', {healing: [1, 16]}), first);
    assert.throws(() => publishRuleVersion(directory, 'v1', {healing: [1, 8]}), /immutable/);
    assert.notEqual(publishRuleVersion(directory, 'v2', {healing: [1, 8]}), first);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
