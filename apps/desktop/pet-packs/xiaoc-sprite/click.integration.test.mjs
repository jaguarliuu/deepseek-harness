/** Exercises clicks through the prepared desktop input and playback consumers. */
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const helper = new URL('../../../../output/dsh-pet-sprite-lab/upstream/dsh-pet/runtime/electron-helper/', import.meta.url);
const pack = JSON.parse(await readFile(new URL('./pack.json', import.meta.url), 'utf8'));
const sources = await Promise.all(['shared-core.js', 'sprite/playback.js', 'sprite/input.js'].map(file => readFile(new URL(file, helper), 'utf8')));
function setup() {
  class PetSprite {}
  let roll = 0;
  const world = { Math: Object.assign(Object.create(Math), { random: () => ((roll++ * 7) % 100) / 100 }), PetSprite, isOpenShortcut: () => false, playClickSound() {}, console };
  runInNewContext(sources[0], world);
  world.S = world.PetShared;
  for (const source of sources.slice(1)) runInNewContext(source, world);
  const played = [];
  const pet = new PetSprite();
  Object.assign(pet, { pet: { id: 'xiaoc' }, dragState: {}, animations: { ...pack.animationPools, events: {}, categories: [] },
    stopThrow() {}, stopMove() {}, playOnce(name) { this.anim = name; played.push(name); },
    resumeWorkStatusAnim() { if (!this.working) return false; this.playOnce('执行工作'); return true; } });
  return { pet, played };
}
test('desktop clicks select all five responses and avoid the response already playing', () => {
  const { pet } = setup();
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const previous = pet.anim;
    pet.onClick({});
    assert.notEqual(pet.anim, previous);
    assert.ok(pack.animationPools.clicks.includes(pet.anim));
    seen.add(pet.anim);
  }
  assert.equal(seen.size, 5);
  pet.handleEnded();
  assert.equal(pet.anim, '待机');
  pet.working = true;
  pet.onClick({});
  pet.handleEnded();
  assert.equal(pet.anim, '执行工作');
});
test('drag release never becomes a click response and sleep clicks only wake the pet', () => {
  const { pet, played } = setup();
  pet.justDragged = true;
  pet.onClick({});
  assert.deepEqual(played, []);
  pet.justDragged = false;
  pet.sleeping = true;
  pet.startSquash = () => {};
  let wake;
  pet.postSleepAction = action => { wake = action; };
  pet.onClick({});
  assert.equal(wake, 'wake');
  assert.deepEqual(played, []);
});


test('speech animation previews are distinct from the main whisper action', () => {
  const world = {};
  runInNewContext(sources[0], world);
  const tree = world.PetShared.buildMenuTree({ ...pack.animationPools, moves: pack.moves,
    categories: [], events: { whisper: pack.talk } });
  const speech = tree[0].children.find(node => node.label === '说话动作');
  assert.ok(speech);
  assert.deepEqual(Array.from(speech.children, node => node.anim), pack.talk);
  assert.equal(tree[0].children.some(node => node.label === '碎碎念'), false);
});
