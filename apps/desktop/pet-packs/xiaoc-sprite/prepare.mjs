/** Prepare the offline Small C plugin for an isolated source-profile preview. */
import { prepareXiaocPet } from './build.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const out = join(root, 'output/dsh-pet-sprite-lab');
await mkdir(out, { recursive: true });
const plugin = join(out, 'upstream/dsh-pet');
await prepareXiaocPet({ destination: plugin, testOutput: out });
await writeFile(join(out, 'pet.overlay.yml'), '- insert:\n    - id: zhiwei-xiaoc-pet\n      name: ' + JSON.stringify(join(plugin, 'lib/index.js')) + '\n');
console.log('Prepared ' + resolve(out, 'pet.overlay.yml'));
