import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function contentFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function publishRuleVersion(directory: string, revision: string, snapshot: unknown): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(revision)) throw new Error('Invalid rule revision');
  mkdirSync(directory, {recursive: true});
  const fingerprint = contentFingerprint(snapshot);
  const path = join(directory, `${revision}.json`);
  try {
    writeFileSync(path, JSON.stringify({fingerprint, snapshot}), {flag: 'wx'});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const published = JSON.parse(readFileSync(path, 'utf8'));
    if (published.fingerprint !== fingerprint) throw new Error('Published rule revision is immutable; increment revision');
  }
  return fingerprint;
}
