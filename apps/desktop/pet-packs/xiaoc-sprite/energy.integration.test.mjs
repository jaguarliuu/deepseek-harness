/** Runs energy actions through the prepared desktop menu and playback consumers. */
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const pack = JSON.parse(await readFile(new URL('./pack.json', import.meta.url), 'utf8'));
const helper = new URL('../../../../output/dsh-pet-sprite-lab/upstream/dsh-pet/runtime/electron-helper/', import.meta.url);
const sources = await Promise.all(['shared-core.js', 'sprite/playback.js', 'sprite/menu.js'].map(file => readFile(new URL(file, helper), 'utf8')));
function setup() {
  class PetSprite {}
  let roll = 0;
  const world = { PetSprite, XiaocSpritePack: pack, Math: Object.assign(Object.create(Math), { random: () => ((roll++ * 7) % 100) / 100 }), console };
  runInNewContext(sources[0], world);
  world.S = world.PetShared;
  for (const source of sources.slice(1)) runInNewContext(source, world);
  const pet = new PetSprite();
  Object.assign(pet, { pet: { id: 'xiaoc' }, dragState: {},
    animations: { ...pack.animationPools, moves: pack.moves, events: {}, categories: [{ id: '补充能量', weight: 0, actions: pack.energy }] },
    switchTo(name) { this.anim = name; }, closeMenu() {}, stopMove() {},
    resumeWorkStatusAnim() { if (!this.working) return false; this.playOnce('执行工作'); return true; },
  });
  return { pet, world };
}
test('the energy menu contains four named clips and a random action that never resolves to a media URL', () => {
  const { pet, world } = setup();
  const menu = world.S.buildMenuTree(pet.animations)[0].children.find(node => node.label === '补充能量');
  assert.deepEqual(Array.from(menu.children, node => node.anim), ['随机补能', ...pack.energy]);
  for (const leaf of menu.children.slice(1)) {
    pet.onMenuAction(leaf);
    assert.equal(pet.anim, leaf.anim);
    pet.handleEnded();
    assert.equal(pet.anim, '待机');
  }
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const previous = pet.anim;
    pet.onMenuAction(menu.children[0]);
    assert.notEqual(pet.anim, previous);
    assert.ok(pack.energy.includes(pet.anim));
    seen.add(pet.anim);
  }
  assert.equal(seen.size, 4);
  pet.working = true;
  pet.handleEnded();
  assert.equal(pet.anim, '执行工作');
});
test('sleep blocks energy previews without replacing the sleeping animation', () => {
  const { pet } = setup();
  pet.anim = '安静睡觉';
  pet.sleeping = true;
  for (const name of [...pack.energy, '随机补能']) {
    pet.onMenuAction({ anim: name });
    assert.equal(pet.anim, '安静睡觉');
  }
});
