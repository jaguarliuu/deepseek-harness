---
kind: reference
---

# Small C pet integration

English | [中文](README.zh.md)

[`vendor/dsh-pet/`](../../../vendor/dsh-pet/) is a source snapshot of [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet), pinned by `upstream.json` to `0e6465f29bb89b386390ba0f14fb86fa1bc656d0`. Its MIT license is preserved. The snapshot contains Host/shared source, the Electron helper and default configuration; upstream videos, standalone launchers, downloaded runtimes and npm dependencies are excluded. It is not a workspace package. Final newlines are normalized; the pinned third-party snapshot is excluded from first-party lint, while its build adaptations and installer consumers retain their normal checks.

[build.mjs](../pet-packs/xiaoc-sprite/build.mjs) applies the local adaptations from this pristine snapshot: Small C sprite slots and unmirrored directional movement, menu positioning stability, live work-state restoration and cancellation, approval waiting, a sleep guard for active work, localized persona and speech gestures. Desktop defaults disable voice, model-driven automatic chatter (including sleep chatter), balance queries and generated images. Settings use `$DSH_HOME/zhiwei-xiaoc-pet`. The runtime downloader fails explicitly; the helper uses the application's Electron and its fixed packaged dispatch flag. Cordis disposal waits for helper exit. The prepared Host bundles its model helpers and Zod; optional voice backends remain disabled.

Desktop's build stages the plugin under `apps/desktop/.desktop-build/pet`. `artifact.json` records every shipped file's SHA256; the build checks required scripts and every atlas, and the packaging hook verifies the copied `resources/pet` payload. The relative overlay remains valid after relocation. The plugin mounts through the Desktop profile and its helper exits with that Host. The installed executable dispatches `--zhiwei-pet-helper` only to the fixed installed helper, never to a caller-supplied script. Quick tasks and selected-text handoff remain shell-owned.

To update the snapshot, copy the same paths from a reviewed upstream commit, preserve LICENSE, update `upstream.json`, review every replacement in `build.mjs`, rebuild Desktop, and run the sprite, movement, work-state, artifact, packaged-dispatch and packaging-hook tests. No generated output or runtime dependency download belongs in the snapshot.
