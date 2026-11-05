/** Replays session events through the prepared upstream listener and exercises the real desktop state consumer. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkStatusStore, registerSessionWatch, createWorkStatusBridge } from '../../../../output/dsh-pet-sprite-lab/tests/work-status-test.mjs';
const here = fileURLToPath(new URL('.', import.meta.url));
const helper = resolve(here, '../../../../output/dsh-pet-sprite-lab/upstream/dsh-pet/runtime/electron-helper');
const pack = JSON.parse(await readFile(join(here, 'pack.json'), 'utf8'));
const fixture = JSON.parse(await readFile(join(here, 'work-status.expected.json'), 'utf8'));
const [shared, playback, events] = await Promise.all(['shared-core.js', 'sprite/playback.js', 'events.js'].map(file => readFile(join(helper, file), 'utf8')));

function host() {
  const listeners = new Map();
  const disposers = [];
  const workStatus = new WorkStatusStore();
  const notify = () => {};
  registerSessionWatch({
    ctx: {
      effect(fn) { const dispose = fn(); if (dispose) disposers.push(dispose); },
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => listeners.get(name).delete(fn);
      },
    },
    workStatus, cancelTerminalCleanup: notify, publishWorkStatus: notify,
    pushNotifyFrame: notify, scheduleCompletionNotify: notify, scheduleTerminalCleanup: notify,
    lastTodoText: new Map(), lastReplyText: new Map(), notifyActivityTimers: new Map(),
    terminalTimers: new Map(), toolsInFlight: new Map(), turnFlags: new Map(),
  });
  let seq = 0;
  return {
    store: workStatus,
    emit(id, type, data = {}) {
      for (const fn of listeners.get('session/event') ?? []) fn({ header: { id } }, { type, data, seq: ++seq });
    },
    snapshot: () => workStatus.snapshot(),
    dispose() { for (const dispose of disposers.reverse()) dispose(); },
    listenerCount: () => [...listeners.values()].reduce((n, list) => n + list.size, 0),
  };
}

test('recorded keyless event sequence reaches all six states and cancellation returns idle', t => {
  const h = host(); t.after(() => h.dispose());
  const observed = [];
  for (const entry of fixture.events) {
    h.emit('session-a', entry.type, entry.data);
    observed.push(h.snapshot().state);
  }
  assert.deepEqual(observed, fixture.states);
  assert.equal(h.snapshot().sessionId, null);
});

test('parallel tools, goal continuation, and waiting sessions do not celebrate prematurely', t => {
  const h = host(); t.after(() => h.dispose());
  h.emit('a', 'turn/start');
  h.emit('a', 'tool/call', { name: 'read_file', callId: 'one', arguments: '{}' });
  h.emit('a', 'tool/call', { name: 'read_file', callId: 'two', arguments: '{}' });
  h.emit('a', 'tool/result', { message: { source: { callId: 'one' } } });
  assert.equal(h.snapshot().state, 'working');
  h.emit('b', 'turn/start');
  h.emit('b', 'approval/asked');
  h.emit('a', 'turn/end', { reason: { kind: 'completed' } });
  assert.equal(h.snapshot().state, 'waiting');
  assert.equal(h.snapshot().sessionId, 'b');
  h.emit('b', 'turn/end', { reason: { kind: 'aborted' } });
  h.emit('c', 'turn/start');
  h.emit('c', 'user/message', { source: { kind: 'goal' } });
  h.emit('c', 'turn/end', { reason: { kind: 'completed' } });
  assert.equal(h.snapshot().state, 'result');
  h.dispose();
  assert.equal(h.listenerCount(), 0);
});

test('terminal error bypasses the result debounce and disposal cancels its deferred flush', t => {
  // This file owns Node's timer mock; top-level tests are sequential and after() restores it on failure.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  t.after(() => t.mock.timers.reset());
  const store = new WorkStatusStore();
  const written = [];
  const bridge = createWorkStatusBridge({ workStatus: store, EXTERNAL_WORK_SESSION: 'api',
    state: { writeSection: (_name, data) => written.push(data) } });
  t.after(() => bridge.stopWorkStatusFlush());
  store.setState('a', 'working', 1); bridge.publishWorkStatus();
  store.setState('a', 'result', 2); bridge.publishWorkStatus();
  assert.equal(written.at(-1).state, 'working');
  store.setState('a', 'error', 3); bridge.publishWorkStatus();
  assert.equal(written.at(-1).state, 'error');
  t.mock.timers.tick(6000);
  assert.equal(written.at(-1).state, 'error');
  store.setState('a', 'working', 4); bridge.publishWorkStatus();
  store.setState('a', 'result', 5); bridge.publishWorkStatus();
  const count = written.length;
  bridge.stopWorkStatusFlush();
  t.mock.timers.tick(6000);
  assert.equal(written.length, count);
});

function renderer() {
  const timers = new Map(); let timer = 0;
  class PetSprite {
    constructor() {
      this.pet = { id: 'xiaoc', workStatusEnabled: true, workStatusTexts: pack.workStatus.texts };
      this.animations = { ...pack.animationPools, events: { workStatus: pack.workStatus.animations, whisper: pack.talk }, moves: pack.moves };
      this.weights = pack.animationWeights;
      this.prevWorkTick = 0; this.prevWorkState = null; this.workState = null;
      this.workTimer = null; this.anim = '待机'; this.front = 0;
      this.videoA = { loop: false }; this.videoB = { loop: false };
      this.plays = []; this.renderCount = 0;
    }
    stopMove() { this.movesStopped = true; }
    renderBubble() { this.renderCount++; }
  }
  const pet = new PetSprite();
  const world = { PetSprite, console: { log() {}, warn() {}, error() {} }, Date,
    window: { setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id) },
    sprites: [pet], workTick: 0, BUBBLE_DURATION_MS: 10000, STATE_URL: 'http://fixture/state', STATE_WAIT_MS: 30000 };
  runInNewContext(shared, world); world.S = world.PetShared;
  runInNewContext(playback, world);
  PetSprite.prototype.switchTo = function(name, once) { this.anim = name; this.plays.push({ name, once }); };
  runInNewContext(events, world);
  return { pet, world, timers };
}

test('six states select distinct loops or one-shot outcomes and update text without restarting', () => {
  const { pet } = renderer();
  let tick = 0;
  for (const [index, state] of pack.workStatus.states.entries()) {
    pet.onWorkTick({ state, task: null, sessionId: 'a' }, ++tick);
    assert.equal(pet.anim, pack.workStatus.animations[index]);
    assert.equal(pet.plays.at(-1).once, state === 'success' || state === 'error');
    assert.equal(pet.workSessionId, 'a');
    assert.equal(pet.movesStopped, true);
    const count = pet.plays.length;
    pet.onWorkTick({ state, task: '新的任务进度', sessionId: 'a' }, ++tick);
    assert.equal(pet.plays.length, count);
    assert.equal(pet.workText, '新的任务进度');
  }
  pet.onWorkTick({ state: null, task: null }, ++tick);
  assert.equal(pet.workOn, false);
  assert.equal(pet.workSessionId, null);
});

test('interrupted work returns to the live work loop instead of autonomous walking', () => {
  const { pet } = renderer();
  pet.onWorkTick({ state: 'working', task: null, sessionId: 'a' }, 1);
  pet.anim = '向左散步';
  pet.playIdle();
  assert.equal(pet.anim, '执行工作');
  assert.equal(pet.plays.at(-1).once, false);
});

test('helper restart restores an active snapshot while an old completion is not replayed', async () => {
  for (const [state, expected] of [['working', '执行工作'], ['success', '待机']]) {
    const { pet, world } = renderer();
    world.S.fetchState = async () => ({ counter: 1, sections: {
      menu: { counter: 0, data: [] }, workStatus: { counter: 1, data: { state, task: null, sessionId: 'a' } },
    }, pets: {} });
    assert.equal(await world.pollStateOnce(), true);
    assert.equal(pet.anim, expected);
  }
});

test('cancellation clears looping on a loading back slot as well as the visible slot', () => {
  const { pet } = renderer();
  pet.onWorkTick({ state: 'working', task: null, sessionId: 'a' }, 1);
  pet.videoB.loop = true;
  pet.onWorkTick({ state: null, task: null }, 2);
  assert.equal(pet.videoA.loop, false);
  assert.equal(pet.videoB.loop, false);
  assert.equal(typeof pet.videoB.onended, 'function');
  assert.equal(pet.workText, null);
});

test('sleep enters a seated loop, suppresses roaming, and wakes back to idle', () => {
  const { pet } = renderer();
  const names = { sleeping: true, start: '打哈欠入睡', loop: '安静睡觉', end: '伸展醒来' };
  pet.setSleep(names);
  assert.equal(pet.anim, names.start);
  pet.handleEnded();
  assert.equal(pet.sleepPhase, 'loop');
  assert.equal(pet.anim, names.loop);
  assert.equal(pet.plays.at(-1).once, false);
  const count = pet.plays.length;
  pet.playIdle();
  pet.setSleep(names);
  assert.equal(pet.plays.length, count);
  pet.setSleep({ sleeping: false });
  assert.equal(pet.anim, names.end);
  assert.equal(pet.plays.at(-1).once, true);
  pet.handleEnded();
  assert.equal(pet.sleeping, false);
  assert.equal(pet.sleepPhase, null);
  assert.ok(pack.animationPools.idle.includes(pet.anim) || pack.animationPools.turn.includes(pet.anim) || pack.moves.actions.some(a => a.name === pet.anim));
  assert.equal(pack.clips[names.start].at(-1).frame, pack.clips[names.loop][0].frame);
  assert.equal(pack.clips[names.end][0].frame, pack.clips[names.loop][0].frame);
});

test('speech selects one configured gesture, preserves silent notices, and respects sleep', () => {
  const { pet } = renderer();
  pet.showWhisper('你好，我是小 C。', '', '', 3000);
  assert.ok(pack.talk.includes(pet.anim));
  assert.equal(pet.plays.at(-1).once, true);
  const first = pet.anim;
  pet.showWhisper('随时可以把任务交给我。', '', '', 3000);
  assert.notEqual(pet.anim, first);
  assert.equal(pet.whisperText, '随时可以把任务交给我。');
  const count = pet.plays.length;
  pet.showWhisper('仅提示', '', '', 3000, false);
  assert.equal(pet.plays.length, count);
  pet.sleeping = true;
  pet.showWhisper('睡眠提示', '', '', 3000);
  assert.equal(pet.plays.length, count);
});
