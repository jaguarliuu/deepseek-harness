/** Runs the prepared upstream move planner and desktop driver; prepare.mjs supplies the pinned runtime. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const here = fileURLToPath(new URL('.', import.meta.url));
const helper = resolve(here, '../../../../output/dsh-pet-sprite-lab/upstream/dsh-pet/runtime/electron-helper');
const pack = JSON.parse(await readFile(join(here, 'pack.json'), 'utf8'));
const [shared, playback, motion] = await Promise.all([
  readFile(join(helper, 'shared-core.js'), 'utf8'),
  readFile(join(helper, 'sprite/playback.js'), 'utf8'),
  readFile(join(helper, 'sprite/motion.js'), 'utf8'),
]);

function setup(cx = 600) {
  const positions = [];
  const queued = new Map();
  let id = 0;
  class PetSprite {
    constructor() {
      this.pet = { id: 'xiaoc' };
      this.animations = { ...pack.animationPools, moves: pack.moves, categories: [] };
      this.weights = pack.animationWeights;
      this.moveRef = null;
      this.throwRef = null;
      this.pendingMove = null;
      this.moveToken = 0;
      this.size = 462;
      this.halfW = 231;
      this.halfH = 129.9375;
      this.sideAllow = 144.375;
      this.confineToScreen = true;
      this.facing = 'left';
    }
    currentCenterX() { return cx; }
    currentCenterY() { return 400; }
    switchTo(name) { this.playing = name; }
    sendBounds(x, y) { positions.push({ x, y }); }
    stopPosFollow() {}
  }
  const world = { PetSprite, XiaocSpritePack: pack, console,
    VIEW: { w: 1512, h: 910 }, AREAS: [{ x: 0, y: 0, width: 1512, height: 910 }],
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    requestAnimationFrame: (fn) => { queued.set(++id, fn); return id; },
    cancelAnimationFrame: (key) => queued.delete(key) };
  runInNewContext(shared, world);
  world.S = world.PetShared;
  runInNewContext(playback, world);
  runInNewContext(motion, world);
  const pet = new PetSprite();
  const step = () => {
    const pending = [...queued.values()];
    queued.clear();
    for (const fn of pending) fn();
  };
  return { pet, positions, queued, step, world };
}

test('named walks plan their displayed direction and finish at their actual desktop destination', () => {
  for (const [name, direction] of Object.entries(pack.moveDirections)) {
    const { pet, positions, step, queued } = setup();
    pet.facing = direction === 'left' ? 'right' : 'left';
    assert.equal(pet.tryMove(name), name);
    assert.equal(pet.facing, direction);
    const plan = pet.pendingMove;
    assert.equal(plan.targetRatio < plan.startRatio, direction === 'left');
    const media = { duration: pack.clips[name].reduce((sum, frame) => sum + frame.ms, 0) / 1000, currentTime: 0 };
    pet.startMoveDrive(media);
    step();
    const startX = positions.at(-1).x;
    media.currentTime = media.duration - pack.moves.default.tailSec;
    step();
    assert.equal(positions.at(-1).x < startX, direction === 'left');
    assert.equal(pet.moveRef, null);
    assert.equal(queued.size, 0);
    assert.equal(pet.customPos.rx, plan.targetRatio);
  }
});

test('walking cannot leave the display and dragging can cancel its pending frame', () => {
  const edge = setup(120);
  assert.equal(edge.pet.tryMove('向左散步'), false);
  assert.equal(edge.pet.pendingMove, null);
  const { pet, queued } = setup();
  pet.tryMove('向左散步');
  pet.startMoveDrive({ duration: 2.19, currentTime: 0 });
  assert.equal(queued.size, 1);
  pet.stopMove();
  assert.equal(queued.size, 0);
  assert.equal(pet.pendingMove, null);
});

test('an open menu holds position even when the autonomous selection would choose walking', () => {
  const { pet, world } = setup();
  world.Math.random = () => 0.98;
  pet.menuOpen = true;
  pet.playIdle();
  assert.equal(pet.anim, '待机');
  assert.equal(pet.pendingMove, null);
  pet.menuOpen = false;
  pet.playIdle();
  assert.ok(pet.pendingMove !== null);
});
