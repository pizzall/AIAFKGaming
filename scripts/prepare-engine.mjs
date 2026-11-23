import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync} from 'node:fs';
import {resolve, relative, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const revision = JSON.parse(readFileSync(join(root, 'data/sources/showdown-revision.json'), 'utf8'));
const archive = join(root, revision.archive_path);
const hash = createHash('sha256').update(readFileSync(archive)).digest('hex');
if (hash !== revision.archive_sha256) throw new Error('Showdown archive checksum mismatch');
const vendor = join(root, 'vendor');
const source = join(vendor, `pokemon-showdown-${revision.commit}`);
mkdirSync(vendor, {recursive: true});
if (!existsSync(join(source, 'sim/index.ts'))) {
  const extract = 'import tarfile,sys; tarfile.open(sys.argv[1]).extractall(sys.argv[2], filter="data")';
  execFileSync('python', ['-c', extract, archive, vendor], {stdio: 'inherit'});
}
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) files.push(path);
    else if (entry.name.endsWith('.json')) {
      const target = join(source, 'dist', relative(source, path));
      mkdirSync(resolve(target, '..'), {recursive: true});
      copyFileSync(path, target);
    }
  }
}
for (const directory of ['sim', 'lib', 'data']) collect(join(source, directory));
files.push(join(source, 'config/formats.ts'));
await build({entryPoints: files, outdir: join(source, 'dist'), outbase: source, format: 'cjs', platform: 'node'});
writeFileSync(join(vendor, 'engine.json'), JSON.stringify({commit: revision.commit, archiveSha256: hash}, null, 2));
console.log(`Prepared pinned Showdown ${revision.commit}: ${files.length} modules`);
