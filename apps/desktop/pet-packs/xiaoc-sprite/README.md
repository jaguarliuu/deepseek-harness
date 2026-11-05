---
kind: reference
---

# Small C sprite trial

English | [中文](README.zh.md)

This pack plays transparent PNG atlases for idle, movement, interactions and six work states inside the desktop helper of [dsh-pet](https://github.com/PC2005-cloud/dsh-pet), pinned to `0e6465f29bb89b386390ba0f14fb86fa1bc656d0` under its MIT license. It preserves the upstream A/B playback, click response, dragging and menus. The desktop installer includes this integration; `prepare.mjs` also creates an isolated preview.

`pack.json` owns frame timing, per-action atlas selection and placement. Right-click → Actions → Interaction → 伸懒腰 plays the stretch once, then restores standing. The same menu offers 挠头思考, a curious head tilt and helmet scratch. `sprite-media.js` supplies canvas media slots for the Small C instance; other pets retain video slots. Idle cycles through breathing, blinking and subtle swaying; a turn plays occasionally and is also available under Actions → Turn. Each turn includes side and back views, then returns to front. The sprite slots opt out of horizontal mirroring to preserve chest lettering. Clicking plays the wave once. Actions → Move provides 向左散步 and 向右散步. Their separate stride cells retain readable lettering; the upstream movement driver synchronizes window travel with playback time, retains screen checks and stops on dragging. Occasional autonomous walks use the weights in `pack.json`. An open context menu holds the pet in idle until the menu closes. Voice, balance queries and model-generated chatter are disabled in this trial. No video generation or model request is needed for playback.

The six work states follow the existing session-event listener: turn start → thinking, tool call → working, tool result → result, approval/question → waiting, completed turn → success, failed turn → error. Active states loop, terminal states play once. Work interrupts roaming, text-only updates preserve playback, and helper restart restores active states without replaying old completion. A keyless recorded event fixture and the prepared desktop consumer cover cancellation, concurrent sessions, parallel tools and goal continuation. Live visual checks may use the upstream `/work-status` API; these checks do not invoke a model. The preview profile observes its own sessions, independently of other running profiles.

Right-click → Sleep plays a yawn and seated entry, a breathing loop, then a seated stretch and rise when clicked awake. Hovering and pressing Z toggles sleep; S retains the upstream screenshot action. Active tasks refuse new sleep requests with a visible message. While asleep, automatic roaming stops; waking resumes the current work state. Sleep is process-local and helper restart wakes the pet. The three clips share a seated transition frame.

Build the repository artifacts, then prepare the pinned checkout and overlay:

```sh
pnpm run build:artifacts
node apps/desktop/pet-packs/xiaoc-sprite/prepare.mjs
node --test apps/desktop/pet-packs/xiaoc-sprite/sprite-media.test.mjs apps/desktop/pet-packs/xiaoc-sprite/movement.integration.test.mjs apps/desktop/pet-packs/xiaoc-sprite/work-status.integration.test.mjs
```

Launch through a dsh profile with an isolated `DSH_HOME` and an existing Electron executable in `DSH_PET_ELECTRON_PATH`:

```sh
pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch output/dsh-pet-sprite-lab/pet.overlay.yml --port 3090 --no-open
```

Preparation clones upstream into `output/dsh-pet-sprite-lab/upstream`, preserves its license, patches only the desktop renderer and trial configuration, and builds against this checkout's host packages. It does not install or publish a plugin into an employee profile. Browser overlay sprite playback is outside this integration. The desktop build stages the same patched plugin through `build.mjs`, without cloning or downloading at install time.

The PNG was created with the built-in imagegen tool from `assets/brand/zhiwei-xiaoc/character-v1/reference.png`: a transparent 4×4 atlas, sixteen aligned full-body poses, fixed feet and camera, right-arm raise, two waves, then return to standing, preserving the helmet globe emblem and chest C. Frame zero is reused at the end to avoid a generated first/last-pose mismatch.

Speech bubbles use three randomly selected gestures: open-palm explanation, smiling nod, and idea sharing. The upstream whisper and chat reply channel selects one gesture per message and avoids the currently playing clip. A notice with `anim: false` preserves playback, and speech never interrupts sleep. Gestures finish once and resume idle or active work. Automatic chatter, voice and generated images remain disabled in this preview; dialogue uses the existing host model and Small C persona.
