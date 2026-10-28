# GitHub Windows office test package

English | [中文](github-windows.zh.md)

The `zhiwei-windows-office.yml` workflow uses a GitHub-hosted `windows-2022` runner to build the unsigned Windows x64 office installer. No self-hosted runner or signing certificate is required. The workflow configuration is checked locally; successful packaging and installation still require a Windows run and target-machine testing.

## Build and download

1. Open the repository's Actions tab and select `智维小 C · Windows 办公离线测试包`.
2. Click Run workflow, select `master`, and start the run. The workflow has only a manual trigger.
3. After success, download `zhiwei-xiao-c-windows-x64-<run number>` from the run's Artifacts section. Extract the archive to obtain the EXE, SHA-256 file, and `office-runtime.json`. Artifacts are retained for 14 days.

The workflow installs Node.js 24, repository-pinned pnpm, and Python 3.12. It reuses the Build mode of `cnb-windows-package.ps1`, which installs locked dependencies and runs `package:win:x64:unsigned` with packaged-runtime checks. This mode does not use CNB credentials or upload to CNB. GitHub-hosted Windows supplies the native build tools; no additional repository secrets are needed for this unsigned workflow.

If packaging fails, expand Show packaging failure details for the last 120 lines of each journal file, or download `zhiwei-windows-diagnostics-<run number>-<attempt>` from Artifacts. It contains the packaging stdout, stderr, and event records, and is retained for 14 days. If setup fails before packaging starts, no journal exists; inspect the failed setup step instead.

## Offline contents and verification

The installer includes Word, Excel, PPT, and PDF Skills, the packaged Python interpreter and locked libraries, and the Windows office engine. Local ASR models are excluded. The employee computer still needs access to its configured internal model endpoint. The build runner needs internet access to download dependencies.

On the target Windows machine, verify the checksum, install the EXE, configure the internal model, and test creating and reading office files and exporting PDF. A successful upload does not establish installation or internal-network acceptance. The workflow does not publish a Release or an automatic update.

See [GitHub's Windows runner inventory](https://github.com/actions/runner-images/blob/main/images/windows/Windows2022-Readme.md) for the hosted toolchain and [the CNB guide](cnb-windows.md) for the separate self-hosted workflow.
