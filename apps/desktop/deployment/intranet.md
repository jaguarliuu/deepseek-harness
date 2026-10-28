---
description: "Intranet distribution inventory, existing source configuration, and remaining deployment work for Zhiwei Little C."
kind: "reference"
---

# Intranet deployment inventory

English | [中文](intranet.zh.md)

## Summary

Employees should not download dependencies on first use; business requests should reach company-provided models and services. This inventory reviews current source and the development catalog; templates have not been applied locally and do not establish that an offline installer has been produced or accepted. Settings → Intranet sources now edits npm and Python defaults; model and detail sources remain outside that page.

## Table of Contents

- [Distribution inventory](#distribution-inventory)
- [Existing configuration locations](#existing-configuration-locations)
- [Remaining external requests](#remaining-external-requests)
- [Delivery and acceptance](#delivery-and-acceptance)

## Distribution inventory

| Capability | Current dependencies and behavior | Intranet distribution choice |
| --- | --- | --- |
| Desktop core, model configuration, capability center, Skills display | Electron, Node execution environment, pnpm, and application code | Bundle with the installer; inference still needs an intranet service |
| Office and five additional office Skills | Bundled Python, 14 pinned Python distributions, Skills files; LibreOffice Kit and platform engine | Bundled by Desktop packaging; validate each target engine and Chinese fonts on real machines |
| Voice input | Native sherpa-onnx-node npm dependencies and separate model files | Defer voice in the first release; do not enable it by default or bundle local models (INT8 set about 241 MB); integrate company ASR later as needed |
| Agent teams, automatic authorization review, conversation title updates | Application plugin code plus model calls | Bundle code; route inference internally; bundled code does not remove service requirements |
| DSH badge skill, developer tools | Local plugin code and assets | Can be bundled; employee availability is a separate product choice |
| Git worktrees | Plugin code and an available Git executable | Bundle the plugin and provision target-machine Git; use intranet remote repositories |
| Reasoning translation, personalized recommendations | Plugin code plus selected service or model requests | Code can be bundled; verify actual service endpoints before enabling |
| Custom plugin index | Index service and its referenced packages, images, and details | Host the complete index and assets internally; the capability center does not yet connect to a remote company catalog |
| Computer Use | Native components, operating-system permissions, model inference | Bundle matching platform components; the current catalog marks macOS-only support, not Windows readiness |
| Claude Code and Codex subagents | Currently offered packages, their CLI/SDK/platform payloads, and authentication settings | Complete preinstallation can be investigated, but exclude from the first default office package; validate authentication and service compatibility separately |
| Browser and external MCP extensions | Provider-dependent; existing browser paths or remote endpoints can be configured | Do not assume Electron supplies every browser extension; pin each MCP server and browser payload |

Pinned Python distributions are numpy, pandas, python-dateutil, six, tzdata, python-docx, python-pptx, openpyxl, Pillow, lxml, XlsxWriter, typing_extensions, and et_xmlfile. Versions and platform wheels are defined in the [runtime lock](../../../scripts/primary-runtime/lock.json); they are downloaded and assembled at build time, so employees do not need pip downloads for these base libraries. Check additional script dependencies against the final allowed Skills list; the 44 Skills on this personal development machine are not a fixed employee installation inventory.

## Existing configuration locations

| Setting | Existing location | Template in this directory |
| --- | --- | --- |
| Per-install plugin registry | Capability center → Plugin management → Add plugin → Registry → Custom address | [npmrc.example](npmrc.example) for administrator-provisioned defaults |
| Default npm registry and fallbacks | plugin-manager configuration in the profile user cordis.patch.yml | [plugin-sources.patch.example.yml](plugin-sources.patch.example.yml) |
| Public npm registry latency probes | ui-plugin-manager registryProbeEnabled | Same template, set to false |
| Intranet speech model mirror | speech-to-text-sensevoice modelOrigin and modelOrigins | [voice-mirror.patch.example.yml](voice-mirror.patch.example.yml) |
| Offline speech files | speech-to-text-sensevoice modelDirectory and vadModelPath | [voice-local.patch.example.yml](voice-local.patch.example.yml) |
| Additional Python libraries | pip configuration / PIP_CONFIG_FILE read by the installing process | [pip.conf.example](pip.conf.example) |

The company.invalid addresses are nonfunctional placeholders and cannot be shipped unchanged. Administrators replace them and merge into the target profile without overwriting existing user configuration. Cordis patches replace the entire target row config, so preserve existing custom fields. The speech templates are local-recognition references only, excluded from the first deployment; they do not configure an intranet ASR API. The pip template does not automatically modify the application environment; bundled base Python payloads follow the build lockfile and do not read this template.

The speech mirror must retain URL paths, lengths, and SHA-256 values in the [model manifest](../../../packages/experimental/speech-to-text-sensevoice/runtime/assets.json); modelOrigin accepts an origin, not an arbitrary path prefix. An explicit modelOrigin prevents automatic public fallback. Explicit local paths do not download files; deployment verifies their hashes. Clear fallbackRegistries when configuring the intranet registry to avoid public fallback; also inspect scoped registries in .npmrc and absolute tarball URLs in lockfiles.

## Remaining external requests

Details of uninstalled plugins currently use fixed public CDNs (jsDelivr, unpkg, npmmirror), independently of the npm registry; existing configuration cannot name an arbitrary internal detail source. Installed plugin documents are read from local packages; remote images in those documents still need inspection and preinstallation. The installation dialog also offers public registries; disabling automatic probes does not prohibit explicit public selection.

Settings → Intranet sources saves the npm registry and clears fallbacks atomically within that card. The Python card writes PIP_INDEX_URL into defaults for new local processes and terminals; explicit process environment and pip options take precedence. Both values persist in the profile patch, with independent saves and visible failures. This does not replace remote SSH configuration, system-wide settings, additional pip indexes, or public detail CDN policy. Model sources and connection checks are not part of this first page.

Application updates, Web search, remote MCP, model services, third-party Skill scripts, and npm installation scripts can issue independent requests; preinstallation and registry configuration do not cover them. Build machines can fetch dependencies in advance while endpoints use distributed artifacts. Intranet mirrors must retain file bytes rather than redirect requests to the public Internet.

## Delivery and acceptance

Prefer an initial package with the core application, office Skills, all base Python libraries, matching LibreOffice engine, and no local speech models. Voice is deferred pending a later intranet ASR integration. Serve optional capabilities and subsequent updates through company npm and model-resource services; keep a Python index for later additional dependencies. Provision the company inference endpoint in model configuration and distribute credentials separately.

Before release, use target machines without development caches or system Node/Python, disconnect the public Internet, and verify first launch, Word/Excel/PPT generation, PDF conversion, Chinese fonts; inspect attempted external requests. Then connect a test intranet source and verify installation, updates, unreachable sources, missing files, and hash mismatches. The macOS arm64 bundled Python has passed document round trips and PDF extraction, merging and page selection with network access denied and PATH empty. The assembled application also passed first launch, offline plugin installation, Office Skill loading and DOCX/XLSX/PPTX to PDF conversion with external networking denied and loopback allowed. The current artifact is an unnotarized local test DMG; Windows, Chinese font fidelity and real company endpoints still require target-machine acceptance.

## Dev Note

See [plugin-manager](../../../packages/boot/plugin-manager/README.md) for registry behavior, [Desktop](../README.md) for runtime distribution, and [runtime.ts](../../../packages/experimental/speech-to-text-sensevoice/src/runtime.ts) for speech resources. The settings page uses persistent Host configuration; local process environment defaults are owned by subprocess-local.
