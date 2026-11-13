# Operations suite

English | [中文](README.zh.md)

Reference for the combined offline bundle targeting the compatible 0.2.2 release-candidate Web Host. One bundle enables Remote operations and Operations dashboard, with their runtime dependencies included. Cordis and the application's existing credentials, approval, tools, storage and Web services remain supplied by the Host. No credentials or collected data are included.

Import the ZIP as one bundle. Open Operations dashboard → Manage SSH servers to configure an address, port, username and authentication, verify the host fingerprint, and save. Return to Monitor settings → Enable monitoring to select the saved server and scripts. Collection starts only after enrollment. The package uses the standard `dsh.bundle.patch` mechanism; an importer that only loads browser assets cannot activate its Host services. The intranet-specific ZIP importer is not present in this repository.

The patch disables the standalone `ui-remote-ops` and `ui-ops-monitor` rows and inserts one bundled instance of each. Missing standalone rows may produce harmless patch-target notices. Custom row IDs require administrator reconciliation. Existing credential and monitoring storage names are retained; the bundle does not erase data. Disabling this suite does not automatically re-enable separately disabled bundles.

Build after `pnpm run build:artifacts` with `python3 local-plugins/ops-suite/package.py`. The script resolves the two packages' runtime dependency closure, packs workspace artifacts, includes third-party JavaScript dependencies and licenses, and writes a ZIP plus npm tarball to `output/ops-suite`. It excludes optional platform-native SSH acceleration; SSH uses its portable implementation. Peer dependencies belong to the compatible Host. Archives contain regular files, with no symlinks or workspace-version references.
