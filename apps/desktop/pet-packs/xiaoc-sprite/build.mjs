/** Prepares a pinned upstream dsh-pet checkout and a source-profile overlay for the sprite trial. */
import { writePetArtifact, verifyPetArtifact } from './artifact.mjs';
import { cp, mkdir, readFile, writeFile, symlink, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../../..');
const snapshot = join(root, 'vendor/dsh-pet');
/** @param {{ destination: string, testOutput?: string }} options Build locations. @returns {Promise<void>} Resolves after the offline plugin and overlay are ready. */
export async function prepareXiaocPet({ destination: plugin, testOutput }) {
await mkdir(plugin, { recursive: true });
await cp(join(snapshot, 'src'), join(plugin, 'src'), { recursive: true });
await cp(join(snapshot, 'runtime'), join(plugin, 'runtime'), { recursive: true });
await mkdir(join(plugin, 'assets'), { recursive: true });
await cp(join(root, 'apps/desktop/resources/icon-windows.png'), join(plugin, 'assets/logo.png'));
await cp(join(snapshot, 'LICENSE'), join(plugin, 'LICENSE'));
await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: '@zhiwei/xiaoc-pet', version: '0.4.1', private: true, type: 'module', main: 'lib/index.js', license: 'MIT' }) + '\n');
const helper = join(plugin, 'runtime/electron-helper');
await cp(join(here, 'sprite-media.js'), join(helper, 'sprite-media.js'));
await mkdir(join(helper, 'xiaoc'), { recursive: true });
const pack = JSON.parse(await readFile(join(here, 'pack.json'), 'utf8'));
for (const image of new Set([pack.image, ...Object.values(pack.clipImages)])) {
  await cp(join(here, image), join(helper, 'xiaoc', image));
}
await writeFile(join(helper, 'xiaoc-pack.js'), 'globalThis.XiaocSpritePack = ' + JSON.stringify(pack) + ';\n');
// Reapply edits from the pinned source, so preparation never compounds local patches.
const source = (name) => readFileSync(join(snapshot, name), 'utf8');
await writeFile(join(helper, 'index.html'), source('runtime/electron-helper/index.html')
  .replaceAll('video.pet-video', '.pet-video').replaceAll('dsh-pet 桌宠', '智维小 C 桌宠')
  .replace('<script src="./sprite.js">', '<script src="./xiaoc-pack.js"></script>\n    <script src="./sprite-media.js"></script>\n    <script src="./sprite.js">'));
await writeFile(join(helper, 'sprite/init.js'), source('runtime/electron-helper/sprite/init.js')
  .replaceAll("document.createElement('video')", "this.pet.id === 'xiaoc' ? XiaocSpriteMedia.create(XiaocSpritePack, new URL('./xiaoc/wave.png', location.href).href) : document.createElement('video')"));
await writeFile(join(helper, 'sprite.js'), source('runtime/electron-helper/sprite.js')
  .replace('this.el.remove();', 'for (const media of [this.videoA, this.videoB]) { if (media.dispose) media.dispose(); else media.pause(); }\n    this.el.remove();'));
// Branded sprite sheets contain their turn poses; mirroring would reverse the chest lettering.
for (const file of ['sprite/playback.js', 'sprite/motion.js']) {
  let content = source('runtime/electron-helper/' + file)
    .replaceAll("this.facing === 'right' ? 'scaleX", "this.facing === 'right' && el.dataset.noMirror !== 'true' ? 'scaleX");
  if (file === 'sprite/playback.js') {
    content = content.replace('const mp = Object.assign',
      "if (this.pet.id === 'xiaoc') { this.facing = XiaocSpritePack.moveDirections[chosen.name]; }\n    const mp = Object.assign");
    content = content.replace('const k = S.rollKind(roll, animationWeights, { fixed: this.pet.fixedEnabled });',
      "const k = this.pet.id === 'xiaoc' && this.menuOpen ? 'idle' : S.rollKind(roll, animationWeights, { fixed: this.pet.fixedEnabled });");
    content = content.replace('this.stopMove();\n    const { animations, animationWeights }',
      "if (this.pet.id === 'xiaoc' && this.resumeWorkStatusAnim()) return;\n    this.stopMove();\n    const { animations, animationWeights }");
  }
  await writeFile(join(helper, file), content);
}
await writeFile(join(helper, 'events.js'), source('runtime/electron-helper/events.js')
  .replace("if (frontEl) {\n        frontEl.loop = false;\n        frontEl.onended = () => this.handleEnded();\n      }",
    "for (const media of (this.pet.id === 'xiaoc' ? [this.videoA, this.videoB] : [frontEl])) {\n        if (media) { media.loop = false; media.onended = () => this.handleEnded(); }\n      }")
  .replace('const rotating = !terminal', "if (this.pet.id === 'xiaoc' && !stateChanged && (terminal || S.poolIncludes([slot], this.anim))) return;\n  const rotating = !terminal")
  .replace('applyMenuLeaf(s.sections ? s.sections.menu : null);',
    "applyMenuLeaf(s.sections ? s.sections.menu : null);\n      const workLeaf = s.sections?.workStatus;\n      if (workLeaf?.data?.state && !['success', 'error'].includes(workLeaf.data.state)) applyWorkStatusLeaf(workLeaf);"));
await writeFile(join(plugin, 'src/host/plugin/session-watch.ts'), source('src/host/plugin/session-watch.ts')
  .replace("if (outcome?.keepWorking) next = 'working';", "if (outcome?.keepWorking && next !== 'waiting') next = 'working';"));
await writeFile(join(plugin, 'src/host/routes/sleep.ts'), source('src/host/routes/sleep.ts')
  .replace('// 入睡：整套', "if (who.petId === 'xiaoc' && ['thinking', 'working', 'result', 'waiting'].includes(deps.workStatus.snapshot().state ?? '')) {\n      state.writePet(who.petId, 'say', { text: '任务正在进行，完成后再休息。', anim: false });\n      return failResult('busy', '任务正在进行，完成后再休息');\n    }\n    // 入睡：整套"));
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\\:])\/\/.*$/gm, '$1');
const config = JSON.parse(strip(source('assets/config.jsonc')));
config.pets = [{ ...config.pets[0], name: pack.name, id: 'xiaoc', size: 340,
  balanceEnabled: false, whisperEnabled: false, workStatusEnabled: true, fixedEnabled: false,
  display: 'desktop', position: { corner: 'bottom-right', marginX: 64, marginY: 48 } }];
config.voiceEnabled = false;
config.memes = {};
config.whisperPrompt = '你是智维小 C，国家电网员工的桌面小助手。说话自然、简短、友好，适度俏皮；每次一句，不超过30字，不编造任务结果。';
config.chatAnimationEnabled = false;
config.chatImageEnabled = false;
config.whisperImageEnabled = false;
config.trayEnabled = false;
config.animations = { ...pack.animationPools,
  moves: pack.moves,
  categories: [{ id: '互动', weight: 0, actions: pack.interactions }],
  events: { workStatus: pack.workStatus.animations, whisper: pack.talk }, sleep: pack.sleep };
config.sleepStartTexts = ['休息一下，点击我就能叫醒。'];
config.sleepEndTexts = ['我醒啦，继续工作。'];
config.sleepRefuseTexts = ['小 C 正在休息，点击机器人叫醒。'];
config.workStatusTexts = pack.workStatus.texts;
config.font = pack.font;
config.animationWeights = pack.animationWeights;
await writeFile(join(plugin, 'assets/config.jsonc'), JSON.stringify(config, null, 2) + '\n');
// The installer variant must never download a second Electron runtime.
await writeFile(join(plugin, 'src/host/helper/electron.ts'), source('src/host/helper/electron.ts')
  .replace("['--remote-debugging-port=' + debugPort, helperPath] : [helperPath]", "['--remote-debugging-port=' + debugPort, helperPath, '--zhiwei-pet-helper'] : [helperPath, '--zhiwei-pet-helper']")
  .replace("const version = options.version ||", "throw new Error('小 C 桌宠使用随应用提供的 Electron；运行时缺失，请修复安装。');\n  const version = options.version ||"));
await writeFile(join(plugin, 'src/host/plugin/desktop-helper.ts'), source('src/host/plugin/desktop-helper.ts')
  .replace('stopHelper: spawn.stopHelper,', 'stopHelper: spawn.stopHelperAndWait,'));
await writeFile(join(plugin, 'src/host/plugin/lifecycle.ts'), source('src/host/plugin/lifecycle.ts')
  .replace('ctx.effect(() => () => {', 'ctx.effect(() => async () => {')
  .replace("stopHelper('dsh-host-stop');", "await stopHelper('dsh-host-stop');"));
await writeFile(join(plugin, 'runtime/electron-helper/main.js'), source('runtime/electron-helper/main.js')
  .replace("app.setName('dsh-pet-electron-helper')", "app.setName('智维小 C 桌宠')"));
await writeFile(join(plugin, 'src/host/plugin/setup.ts'), source('src/host/plugin/setup.ts')
  .replace("join(dshHome, 'dsh-pet')", "join(dshHome, 'zhiwei-xiaoc-pet')"));
await writeFile(join(plugin, 'src/host/plugin/loops.ts'), source('src/host/plugin/loops.ts')
  .replace('if (!found) continue;', 'if (!found || found.pet.whisperEnabled !== true) continue;'));
const modules = join(plugin, 'node_modules');
await mkdir(join(modules, '@deepseek-ai'), { recursive: true });
// The trial uses the repository's built packages and carries no separate model/runtime installation.
for (const group of await readdir(join(root, 'packages'), { withFileTypes: true })) {
  if (!group.isDirectory()) continue;
  const groupDir = join(root, 'packages', group.name);
  for (const name of await readdir(groupDir)) {
    const folder = join(groupDir, name);
    if (!existsSync(join(folder, 'package.json'))) continue;
    const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
    if (['@deepseek-ai/dsh-home-paths', '@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-llm'].includes(pkg.name)) {
      const target = join(modules, pkg.name);
      if (!existsSync(target)) await symlink(folder, target, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
}
if (!existsSync(join(modules, 'zod'))) await symlink(join(root, 'node_modules/zod'), join(modules, 'zod'), process.platform === 'win32' ? 'junction' : 'dir');
const require = createRequire(join(root, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('tsdown')).href);
await build({ config: false, entry: { index: join(plugin, 'src/host/index.ts') },
  outDir: join(plugin, 'lib'), platform: 'node', format: 'esm', target: 'es2022',
  external: [/^@electron\//, /^@electron-internal\//, /^@andresaya\//, /^node:/], deps: { alwaysBundle: [/^@deepseek-ai\//, 'zod'] }, dts: false });
await build({ config: false, entry: { 'shared-core': join(plugin, 'src/shared/index.ts') },
  outDir: helper, platform: 'browser', format: 'iife', globalName: 'PetShared', target: 'es2022',
  clean: false, dts: false, noExternal: [/.*/] });
await cp(join(plugin, 'lib/index.mjs'), join(plugin, 'lib/index.js'));
await cp(join(helper, 'shared-core.iife.js'), join(helper, 'shared-core.js'));
if (testOutput) {
const workTestEntry = join(testOutput, 'work-status-test-entry.ts');
await writeFile(workTestEntry,
  'export { registerSessionWatch } from ' + JSON.stringify(join(plugin, 'src/host/plugin/session-watch.ts')) + ';\n' +
  'export { WorkStatusStore } from ' + JSON.stringify(join(plugin, 'src/host/work-status.ts')) + ';\n' +
  'export { createWorkStatusBridge } from ' + JSON.stringify(join(plugin, 'src/host/plugin/work-status-bridge.ts')) + ';\n');
await build({ config: false, entry: { 'work-status-test': workTestEntry }, outDir: join(testOutput, 'tests'),
  platform: 'node', format: 'esm', target: 'es2022', dts: false });
}
if (!testOutput) {
  await rm(join(plugin, 'src'), { recursive: true, force: true });
  await rm(join(plugin, 'node_modules'), { recursive: true, force: true });
  await rm(join(helper, 'shared-core.iife.js'), { force: true });
  await rm(join(plugin, 'lib/index.mjs'), { force: true });
}
await cp(join(root, 'apps/desktop/pet-plugin/upstream.json'), join(plugin, 'upstream.json'));
await cp(join(here, 'pack.json'), join(plugin, 'pack.json'));
await writeFile(join(plugin, 'overlay.yml'), '- insert:\n    - id: zhiwei-xiaoc-pet\n      name: ./lib/index.js\n');
await writePetArtifact(plugin);
await verifyPetArtifact(plugin);
}
