/** Exercises the desktop media slot without video decoders, wall clocks, or network access. */
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const code = await readFile(new URL('./sprite-media.js', import.meta.url), 'utf8');
const pack = JSON.parse(await readFile(new URL('./pack.json', import.meta.url), 'utf8'));

function setup() {
  let now = 0;
  let id = 0;
  const callbacks = new Map();
  const draws = [];
  class Canvas extends EventTarget {
    dataset = {};
    getContext() { return { clearRect() {}, drawImage(...args) { draws.push(args); } }; }
    dispatchEvent(event) { this['on' + event.type]?.(event); return super.dispatchEvent(event); }
  }
  class Image {
    naturalWidth = 1254;
    naturalHeight = 1254;
    get src() { return this.source; }
    set src(value) { this.source = value; if (value) queueMicrotask(() => this.onload?.()); }
  }
  const world = { document: { createElement: () => new Canvas() }, Image, Event, URL,
    location: { href: 'file:///pet/index.html' }, performance: { now: () => now }, queueMicrotask,
    requestAnimationFrame: (fn) => { callbacks.set(++id, fn); return id; },
    cancelAnimationFrame: (key) => callbacks.delete(key) };
  runInNewContext(code, world);
  const el = world.XiaocSpriteMedia.create(pack, 'file:///pet/wave.png');
  const load = async (name) => {
    const ready = new Promise((resolve) => el.addEventListener('loadeddata', resolve, { once: true }));
    el.src = 'http://localhost/thumb/xiaoc/' + encodeURIComponent(name) + '.webm';
    el.load();
    await ready;
  };
  const advance = (ms) => {
    now += ms;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(now);
  };
  return { el, load, advance, callbacks, draws };
}

test('wave progresses from standing to raised hand and ends standing exactly once', async () => {
  const { el, load, advance, callbacks } = setup();
  let ended = 0;
  el.onended = () => ended++;
  await load('招手');
  assert.equal(el.dataset.frame, '0');
  await el.play();
  advance(850);
  assert.ok(Number(el.dataset.frame) >= 4);
  advance(5000);
  assert.equal(el.dataset.frame, '0');
  assert.equal(ended, 1);
  assert.equal(callbacks.size, 0);
  el.dispose();
});

test('freeze stops frames, resume continues, and disposal cancels all frame work', async () => {
  const { el, load, advance, callbacks } = setup();
  await load('招手');
  await el.play();
  advance(600);
  el.pause();
  const frame = el.dataset.frame;
  advance(5000);
  assert.equal(el.dataset.frame, frame);
  await el.play();
  advance(400);
  assert.notEqual(el.dataset.frame, frame);
  el.dispose();
  assert.equal(callbacks.size, 0);
  await assert.rejects(el.play(), /尚未加载/);
});

test('idle loops without ended and unsupported clips visibly fail', async () => {
  const { el, load, advance, callbacks } = setup();
  let ended = 0;
  el.onended = () => ended++;
  await load('待机');
  el.loop = true;
  await el.play();
  assert.equal(el.dataset.noMirror, 'true');
  advance(1900);
  assert.notEqual(el.dataset.frame, '0');
  advance(el.duration * 1000);
  assert.notEqual(el.dataset.frame, '0');
  assert.equal(ended, 0);
  assert.equal(callbacks.size, 1);
  const failed = new Promise((resolve) => el.addEventListener('error', resolve, { once: true }));
  el.src = 'http://localhost/unknown.webm';
  el.load();
  await failed;
  assert.equal(el.readyState, 0);
  assert.equal(callbacks.size, 0);
  el.dispose();
});

test('stretch uses its own atlas and returns to the original idle atlas', async () => {
  const { el, load, advance, draws } = setup();
  await load('伸懒腰');
  assert.equal(el.dataset.clip, '伸懒腰');
  assert.equal(draws.at(-1)[0].src, 'file:///pet/stretch.png');
  await el.play();
  advance(1600);
  assert.ok(Number(el.dataset.frame) >= 7);
  advance(5000);
  assert.equal(el.paused, true);
  assert.equal(el.dataset.frame, '0');
  await load('待机');
  assert.equal(draws.at(-1)[0].src, 'file:///pet/idle.png');
  assert.equal(el.dataset.frame, '0');
  el.dispose();
});

test('thinking can be interrupted by a wave without retaining its atlas or completion callback', async () => {
  const { el, load, advance, draws } = setup();
  let ended = 0;
  el.onended = () => ended++;
  await load('挠头思考');
  await el.play();
  advance(1500);
  assert.equal(el.dataset.clip, '挠头思考');
  assert.equal(draws.at(-1)[0].src, 'file:///pet/think.png');
  assert.ok(Number(el.dataset.frame) >= 5);
  await load('招手');
  await el.play();
  advance(850);
  assert.equal(el.dataset.clip, '招手');
  assert.equal(draws.at(-1)[0].src, 'file:///pet/wave.png');
  assert.equal(ended, 0);
  advance(5000);
  assert.equal(ended, 1);
  el.dispose();
});

test('turn traverses side and back frames once and settles into the animated idle', async () => {
  const { el, load, advance, draws } = setup();
  let ended = 0;
  el.onended = () => ended++;
  await load('转身看看');
  await el.play();
  advance(1000);
  assert.equal(draws.at(-1)[0].src, 'file:///pet/turn.png');
  assert.equal(el.dataset.frame, '7');
  assert.equal(el.dataset.noMirror, 'true');
  advance(5000);
  assert.equal(ended, 1);
  assert.equal(el.dataset.frame, '0');
  await load('待机');
  assert.equal(draws.at(-1)[0].src, 'file:///pet/idle.png');
  el.dispose();
});

test('left and right walking use distinct stride cells and match the movement time window', async () => {
  const { el, load, advance, draws } = setup();
  for (const [name, offset] of [['向左散步', 0], ['向右散步', 8]]) {
    await load(name);
    assert.equal(draws.at(-1)[0].src, 'file:///pet/walk.png');
    await el.play();
    advance(pack.moves.default.leadSec * 1000 + 50);
    assert.equal(el.dataset.frame, String(offset + 2));
    advance(240);
    assert.equal(el.dataset.frame, String(offset + 4));
    advance(el.duration * 1000);
    assert.equal(el.dataset.frame, String(offset));
    assert.equal(el.paused, true);
  }
  el.dispose();
});

test('work clips select their own atlas rows instead of cropping them as a four-row sheet', async () => {
  const { el, load, advance, draws } = setup();
  await load('整理结果');
  await el.play();
  advance(300);
  assert.equal(el.dataset.frame, '5');
  assert.equal(draws.at(-1)[0].src, 'file:///pet/work.png');
  assert.equal(draws.at(-1)[2], 1254 / 3);
  await load('任务出错');
  assert.equal(draws.at(-1)[0].src, 'file:///pet/outcomes.png');
  assert.equal(draws.at(-1)[2], 1254 / 2);
  el.dispose();
});

test('all five click responses play their own atlas row once and settle before idle', async () => {
  const { el, load, advance, draws, callbacks } = setup();
  assert.equal(pack.animationPools.clicks.length, 5);
  let ended = 0;
  el.onended = () => ended++;
  for (const [row, name] of pack.animationPools.clicks.entries()) {
    await load(name);
    assert.equal(draws.at(-1)[0].src, 'file:///pet/click.png');
    assert.equal(el.dataset.frame, String(row * 4));
    assert.ok(Math.abs(draws.at(-1)[2] - row * 1254 / 5) < 0.001);
    await el.play();
    advance(320);
    assert.equal(el.dataset.frame, String(row * 4 + 2));
    advance(2000);
    assert.equal(el.dataset.frame, String(row * 4));
    assert.equal(ended, row + 1);
    assert.equal(callbacks.size, 0);
    await load('待机');
    assert.equal(draws.at(-1)[0].src, 'file:///pet/idle.png');
  }
  el.dispose();
});

test('energy clips show the correct props row and finish standing without leaving frame callbacks', async () => {
  const { el, load, advance, draws, callbacks } = setup();
  assert.equal(pack.energy.length, 4);
  for (const [row, name] of pack.energy.entries()) {
    await load(name);
    assert.equal(draws.at(-1)[0].src, 'file:///pet/energy.png');
    assert.equal(el.dataset.frame, String(row * 4));
    await el.play();
    advance(500);
    assert.equal(el.dataset.frame, String(row * 4 + 2));
    advance(3000);
    assert.equal(el.dataset.frame, String(row * 4));
    assert.equal(callbacks.size, 0);
    await load('待机');
    assert.equal(draws.at(-1)[0].src, 'file:///pet/idle.png');
  }
  el.dispose();
});
