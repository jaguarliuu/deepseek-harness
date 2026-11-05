/** Canvas sprite playback for the dsh-pet desktop helper's existing A/B media slots. */
(() => {
  'use strict';
  /** Creates one independently disposable media slot; the pack owns all frame timings and placement. */
  function create(pack, imageUrl) {
    const el = document.createElement('canvas');
    el.width = pack.canvas.width;
    el.height = pack.canvas.height;
    el.dataset.noMirror = String(pack.mirror === false);
    const context = el.getContext('2d');
    if (!context) throw new Error('小 C 精灵图播放器无法创建画布');
    const images = new Map();
    let image = null;
    let placement = pack.placement;
    let grid = pack;
    let decoded = Promise.resolve();
    const loadImage = (url) => {
      if (images.has(url)) return images.get(url);
      const bitmap = new Image();
      const ready = new Promise((resolve, reject) => {
        bitmap.onload = () => resolve(bitmap);
        bitmap.onerror = () => {
          images.delete(url);
          reject(new Error('小 C 精灵图加载失败'));
        };
      });
      images.set(url, { bitmap, ready });
      bitmap.src = url;
      return images.get(url);
    };
    let clip = [];
    let elapsed = 0;
    let started = 0;
    let raf = null;
    let disposed = false;
    let generation = 0;
    el.src = '';
    el.loop = false;
    el.readyState = 0;
    el.duration = 0;
    el.paused = true;
    const draw = () => {
      let remaining = Math.min(el.duration * 1000 - 0.001, elapsed);
      let frame = clip.at(-1)?.frame ?? 0;
      for (const item of clip) {
        if (remaining < item.ms) { frame = item.frame; break; }
        remaining -= item.ms;
      }
      const w = image.naturalWidth / grid.columns;
      const h = image.naturalHeight / grid.rows;
      const p = placement;
      context.clearRect(0, 0, el.width, el.height);
      context.drawImage(image, (frame % grid.columns) * w, Math.floor(frame / grid.columns) * h,
        w, h, p.x, p.y, p.width, p.height);
      el.dataset.frame = String(frame);
    };
    Object.defineProperty(el, 'currentTime', {
      get: () => elapsed / 1000,
      set: (seconds) => {
        elapsed = Math.max(0, Math.min(seconds * 1000, el.duration * 1000));
        started = performance.now() - elapsed;
        if (el.readyState >= 2) draw();
      },
    });
    el.pause = () => {
      if (!el.paused) elapsed = Math.min(el.duration * 1000, performance.now() - started);
      el.paused = true;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    };
    const tick = (now) => {
      raf = null;
      if (disposed || el.paused) return;
      elapsed = now - started;
      const total = el.duration * 1000;
      if (elapsed >= total) {
        if (el.loop) { elapsed %= total; started = now - elapsed; }
        else {
          elapsed = total;
          draw();
          el.paused = true;
          el.dispatchEvent(new Event('ended'));
          return;
        }
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    el.load = () => {
      el.pause();
      elapsed = 0;
      el.readyState = 0;
      const token = ++generation;
      const name = decodeURIComponent(new URL(el.src, location.href).pathname.split('/').at(-1))
        .replace(/\.(webm|mov)$/, '');
      clip = pack.clips[name];
      if (!clip) {
        queueMicrotask(() => {
          if (!disposed && generation === token) el.dispatchEvent(new Event('error'));
        });
        return;
      }
      el.duration = clip.reduce((sum, item) => sum + item.ms, 0) / 1000;
      const url = pack.clipImages?.[name] ? new URL(pack.clipImages[name], imageUrl).href : imageUrl;
      decoded = loadImage(url).ready;
      decoded.then((bitmap) => {
        if (disposed || generation !== token) return;
        image = bitmap;
        grid = pack.sheets?.[pack.clipImages?.[name] ?? pack.image] ?? pack;
        placement = pack.clipPlacements?.[name] ?? pack.placement;
        el.dataset.clip = name;
        el.readyState = 2;
        draw();
        el.dispatchEvent(new Event('loadeddata'));
      }, () => {
        if (!disposed && generation === token) el.dispatchEvent(new Event('error'));
      });
    };
    el.play = async () => {
      const token = generation;
      await decoded;
      if (disposed || generation !== token || el.readyState < 2) throw new Error('小 C 动作尚未加载');
      if (!el.paused) return;
      el.paused = false;
      started = performance.now() - elapsed;
      raf = requestAnimationFrame(tick);
    };
    el.dispose = () => {
      el.pause();
      disposed = true;
      generation += 1;
      el.onended = null;
      el.onerror = null;
      for (const { bitmap } of images.values()) {
        bitmap.onload = null;
        bitmap.onerror = null;
        bitmap.src = '';
      }
      images.clear();
    };
    return el;
  }
  globalThis.XiaocSpriteMedia = { create };
})();
