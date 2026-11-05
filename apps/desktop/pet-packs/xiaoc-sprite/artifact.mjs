/** Offline pet payload inventory shared by preparation and installer checks. */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';

async function entries(root, relative = '') {
  const files = [];
  for (const item of await readdir(join(root, relative), { withFileTypes: true })) {
    const name = relative ? relative + '/' + item.name : item.name;
    if (['src', 'node_modules', 'artifact.json'].includes(name)) continue;
    if (item.isDirectory()) files.push(...await entries(root, name));
    else if (item.isFile()) files.push(name);
    else throw new Error('Pet payload contains a non-file entry: ' + name);
  }
  return files.sort();
}
/** @param {string} root Prepared plugin directory. @returns {Promise<void>} Resolves after writing its content inventory. */
export async function writePetArtifact(root) {
  const files = {};
  for (const file of await entries(root)) files[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
  await writeFile(join(root, 'artifact.json'), JSON.stringify({ schemaVersion: 1, files }, null, 2) + '\n');
}
/** @param {string} root Relocatable, prepared plugin directory. @returns {Promise<void>} Resolves when all inventoried files and Small C atlases are present. */
export async function verifyPetArtifact(root) {
  const manifest = JSON.parse(await readFile(join(root, 'artifact.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('Invalid pet inventory');
  for (const file of ['LICENSE', 'assets/logo.png', 'lib/index.js', 'overlay.yml', 'package.json', 'pack.json', 'runtime/electron-helper/main.js', 'runtime/electron-helper/shared-core.js', 'runtime/electron-helper/sprite-media.js']) {
    if (!Object.hasOwn(manifest.files, file)) throw new Error('Pet inventory missing required file: ' + file);
  }
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (!file || file.startsWith('/') || file.includes('\\') || file.split('/').some(part => part === '..' || part === '.' || part === '') || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid pet inventory entry');
    if (!(await lstat(join(root, file))).isFile()) throw new Error('Pet payload is not a regular file: ' + file);
    const actual = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
    if (actual !== hash) throw new Error('Pet payload checksum mismatch: ' + file);
  }
  const pack = JSON.parse(await readFile(join(root, 'pack.json'), 'utf8'));
  for (const image of new Set([pack.image, ...Object.values(pack.clipImages)])) {
    const file = 'runtime/electron-helper/xiaoc/' + image;
    if (!Object.hasOwn(manifest.files, file)) throw new Error('Pet inventory missing atlas: ' + image);
  }
}
