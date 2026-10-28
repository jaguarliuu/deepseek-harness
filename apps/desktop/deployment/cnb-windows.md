# CNB Windows office test package

English | [中文](cnb-windows.zh.md)

CNB supports organization-owned Windows runners. This pipeline requires an online Windows x64 build machine; CNB's default Linux Docker nodes cannot replace it. The configuration has only been statically checked locally and has not run on a Windows runner. A committed configuration does not mean an installer has been produced.

## Build node

A root organization administrator creates a runner under organization settings, assigns both `windows` and `zhiwei-x64` tags, and runs CNB's connection script on Windows. If the build-node settings are unavailable, contact CNB to enable them. See [CNB build nodes](https://docs.cnb.cool/zh/build/build-node.html).

The build machine needs Git, PowerShell 7, Windows x64 Node.js 24.9 or newer, Python 3, tar, and the pnpm version pinned in the repository's `package.json`. Install Visual Studio 2022 Build Tools with the Desktop development with C++ workload (including MSVC x64/x86 tools and Windows SDK), and allow the build account to create symbolic links. The build machine needs network access for npm, Python, Electron, office-runtime dependencies, and attachment uploads; employee test machines do not need these build tools.

## Manual build

After committing the configuration to CNB's `master`, click the Windows office test package button on the branch page. The `web_trigger_windows_office` event selects the runner above and installs dependencies, invokes the existing unsigned Windows packaging command, checks the runtime, and uploads attachments. Without an online node, no installer can be produced; there is no Linux fallback. See [manual pipeline triggers](https://docs.cnb.cool/zh/build/web-trigger.html).

The pipeline retains the checks in `package:win:x64:unsigned`, including packaged-runtime and office-conversion checks; a failure stops subsequent upload. Word, Excel, PPT, and PDF Skills, Python, the 14 locked Python libraries, and the Windows office engine are assembled into the package; the generated `office-runtime.json` lists the versions. Speech recognition stays disabled and local ASR models are not downloaded. Employees still configure the company model endpoint in settings.

## Download and internal testing

After success, download the `.exe`, `.exe.sha256`, and `office-runtime.json` attachments from the build's commit. Upload runs a pinned version of CNB's official attachment plugin using native Node.js, without requiring Docker on Windows. It uses the temporary pipeline `CNB_TOKEN`, never a token embedded in source. Upload targets the current commit; it neither creates a formal Release nor publishes to the automatic-update service.

This unsigned Windows package is intended for internal testing. If endpoint policy requires signed installers, use the company's signing process. On the internal machine, verify installation, startup, and private-model connectivity, then create and read Word, Excel, PPT, and PDF files and test PDF export. Scanned-PDF OCR is outside these base dependencies.

Local artifacts remain in `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/` on the runner. If upload fails after packaging succeeds, retrieve files there; logs include the installer name and SHA-256. Actual Windows installation and internal-network acceptance must run on the target machine.
