---
kind: upgrade-guide
description: "Desktop installer filenames use the zhiwei-xiaoc prefix instead of deepseek-harness."
---

# Desktop installer filenames

English | [中文](guide.zh.md)

## Change

Desktop installers and their blockmaps use `zhiwei-xiaoc-<version>-<os>-<arch>` instead of `deepseek-harness-<version>-<os>-<arch>`. This affects scripts that locate or distribute installers by filename. Version segments, extensions and unsigned-build suffixes retain their existing format.

## Migration

1. Replace `deepseek-harness-` with `zhiwei-xiaoc-` in installer filename filters and download links maintained outside this repository.
2. Build from the updated checkout and confirm the resulting installer, checksum and update-feed paths use the new prefix. Repository packaging and publication scripts already use it.
