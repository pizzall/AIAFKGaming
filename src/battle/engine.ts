import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const metadata = JSON.parse(readFileSync(new URL('../../vendor/engine.json', import.meta.url), 'utf8'));
const directory = fileURLToPath(new URL(`../../vendor/pokemon-showdown-${metadata.commit}/dist/`, import.meta.url));
// Upstream's private, pinned API is confined to the battle adapter boundary.
export const Engine = {
  ...require(`${directory}sim/index.js`),
  ...require(`${directory}sim/dex-formats.js`),
  ...require(`${directory}sim/battle.js`)
};
export const {ModdedDex} = require(`${directory}sim/dex.js`);
export const engineRevision: string = metadata.commit;
