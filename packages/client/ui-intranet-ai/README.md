---
description: "Internal AI platform authorization, image generation, speech synthesis and OCR for Zhiwei desktop users."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-intranet-ai

English | [中文](README.zh.md)

## Summary

Connect an internal information-operations AI platform from Settings. Authorize a platform account, generate images, synthesize speech, and recognize image/PDF documents. Model tools submit the same tasks through the background-job registry. The Host owns tokens, polling and downloaded artifacts; the browser receives safe account status and bounded result previews. No local inference model or Python runtime is required.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The Web application bundle mounts this plugin, including the Desktop profile, with the internal platform fixed at `https://25.75.3.1`. Open Settings → Internal AI capabilities and authorize your platform account directly. No address entry or network-test step is required. The password is not saved. Optional capability settings edit image model and voice ids without changing the platform address. The administrator must allow the employee device’s exit IP/network and configure a trusted HTTPS certificate; certificate failures, timeouts and refused connections have separate notices. TLS verification remains enabled.

Create a task from the capability page or ask Little C in a conversation. Images and speech are generated remotely; OCR accepts PNG/JPEG/WebP/BMP/TIFF/PDF files up to 20 MiB by default. Speech uses WAV at 24 kHz. Text/prompt input is limited to 2,000 characters. The platform owns supported image dimensions, model ids and voice ids; configure them to match the installation.

Tasks show the platform state, confirmed cancellation, partial-image failures and OCR page truncation. Closing the page does not cancel work. Restarted applications retain remote task ids; use Resume query / download to continue without submitting again. Unknown submission outcomes require checking platform history before creating another task. A local monitoring timeout does not imply remote cancellation.

Results are stored in the profile’s configured `dataPath` and can be previewed or saved from Settings. OCR previews are shortened; the saved Markdown contains the complete response. Local retention defaults to 500 records and refuses additional submissions at the limit. The list shows at most 30 records with 2,000-character OCR previews. Administrative retention management is deferred.

Authorization uses rotating platform grants in the existing credential store, separated by platform origin. Access refresh is serialized through credential-record modification. A platform/account change prevents a task from using another account’s grant. Reauthorize after refresh expiry. Disconnect clears the local grant before requesting server revocation; a network error means remote revocation was not confirmed.

### Internal-environment acceptance

The user owns real-platform verification; the local fixture cannot establish production compatibility. Validate the following on an internal Windows installation:

1. Confirm the platform address is built in and authorize directly. If needed, edit model and voice ids and verify they survive restart.
2. Authorize an allowed account; verify rejected credentials and an IP not on the whitelist produce actionable messages.
3. Generate one image and then three images; preview/save the results and verify partial failures remain visible.
4. Synthesize Chinese speech; play and save the WAV, and verify the configured voice and speed.
5. Recognize an image and PDF; save Markdown and verify the page-count/truncation warning against the source document.
6. Let access expire, then query a task to exercise token refresh; reconnect after refresh expiry and test account switching.
7. Cancel a queued/running task, interrupt the network and restart the app; resume existing ids without creating duplicate tasks.

<a id="understand-the-implementation"></a>
## Understand the implementation

The service `intranetAi` owns account-safe Remote operations and the effect-scoped model tools. `platform.ts` validates origins, bounds HTTP bodies, rejects redirects, serializes token rotation and redacts upstream failures. `tasks.ts` persists version-1 task records and downloaded outputs with owner-only file permissions where supported. Damaged task storage rejects initialization instead of silently replacing history.

Submissions normalize the image API’s bare response and the TTS/OCR success envelope. Polling uses bare records and stops at platform terminal states. Downloads must remain on the captured platform origin under `/static/`; HTML responses cannot become WAV results. Partial failures and failed downloads remain visible. Request, polling, monitoring, upload, download, response and retention limits are deployment Config fields.

`tools.ts` registers `intranet_image_generate`, `intranet_tts` and `intranet_ocr`. OCR paths are resolved/read through the active filesystem service. Jobs return local file paths and a bounded OCR preview. Cancellation and completion use the standard jobs registry; shutdown interrupts local monitoring and drains pending writes. It cannot guarantee that an unreachable remote worker stopped.

<a id="dev-note"></a>
## Dev Note

None.

<a id="model-experience"></a>
## Model Experience

### Internal AI tools

#### What the model sees

The model sees three capability tools with no credential arguments. Creation returns a background job id; the model must collect its result through `job_output` before claiming completion. Tool-call presentation uses the existing generic card. Completed results contain saved paths, task status and OCR truncation metadata; platform tokens and raw upstream error bodies are excluded. Existing Skills may compose these tools.

#### Token effect

Three tool schemas are included while this plugin is mounted. OCR text enters model context only through collected job results or explicit file reads.

#### KV Cache effect

The tool inventory remains stable across account refresh. Each task result changes conversation history; account tokens do not enter the prompt.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Real internal-platform connectivity and output quality have not been verified here. Local tests use only a loopback HTTP fixture. Verify the platform origin, IP whitelist, certificate trust, account refresh, supported model/voice ids and downloaded media in the internal environment. TLS verification remains enabled.

- Image editing, masks, voice cloning, ASR, live streaming, remote-history import, task deletion and a dedicated conversation media card are deferred. Local cached outputs are separate from server history. Server cancellation is best effort. OCR layout overlays and extracted figure galleries are not displayed; Markdown is the first-version result.
