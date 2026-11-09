/** Desktop-specific selection of workspace and runtime-only dependency patches. */

/** A patch shared with the workspace, excluded from runtime installation, or supplied only to Desktop. */
export type DesktopRuntimePatch =
  | { scope: 'shared'; reason: string }
  | { scope: 'workspace-only'; reason: string }
  | { scope: 'runtime-only'; path: string; reason: string }

/** Web-only custom capability packages excluded from the Desktop package closure. */
export const desktopExcludedWorkspacePackages = [
  '@deepseek-ai/dsh-client-ui-remote-ops',
  '@deepseek-ai/dsh-client-ui-intranet-ai',
] as const

/** Every workspace patch requires an explicit Desktop decision; runtime-only entries may add or replace a patch. */
export const DESKTOP_RUNTIME_PATCHES: Readonly<Record<string, DesktopRuntimePatch>> = {
  'dsh-univer-office@0.4.0': { scope: 'workspace-only', reason: 'The Web profile retains this optional plugin.' },
  'dsh-genui@0.3.2': { scope: 'workspace-only', reason: 'The Web profile retains this optional plugin.' },
  'dsh-quick-screenshot@1.0.0': { scope: 'workspace-only', reason: 'The Web profile retains this optional plugin.' },
  '@orderg-x/dsh-pages@0.2.2': { scope: 'workspace-only', reason: 'The Web profile retains this optional plugin.' },
  'dsh-knowledge-base@0.1.5': { scope: 'workspace-only', reason: 'The Web profile retains this optional plugin.' },
  'dsh-plugin-everything@1.1.0': { scope: 'workspace-only', reason: 'The Web profile retains this optional plugin.' },
  '@botiverse/oar@0.67.0': { scope: 'workspace-only', reason: 'Patched OAR adapters are embedded in the provider bundle.' },
  '@earendil-works/pi-ai@1.3.0': { scope: 'shared', reason: 'Runtime providers need the streamed argument parsing fix.' },
  '@electron/osx-sign@1.3.3': { scope: 'workspace-only', reason: 'Signing executes on the build host.' },
  '@fortune-sheet/core@1.0.4': { scope: 'workspace-only', reason: 'Patched spreadsheet code is embedded in the client bundle.' },
  '@fortune-sheet/react@1.0.4': { scope: 'workspace-only', reason: 'Patched spreadsheet code is embedded in the client bundle.' },
  '@yao-pkg/pkg@6.21.0': { scope: 'workspace-only', reason: 'The executable packer executes on the build host.' },
  'app-builder-lib@26.17.0': { scope: 'workspace-only', reason: 'DMG format validation executes on the build host.' },
  'exceljs@4.4.0': { scope: 'workspace-only', reason: 'The patched parser is embedded in the client bundle and worker.' },
  'lexical@0.49.0': { scope: 'workspace-only', reason: 'The patched editor is embedded in the client bundle.' },
  'mdast-util-gfm-autolink-literal@2.0.1': { scope: 'workspace-only', reason: 'The patched Markdown parser is embedded in the client bundle.' },
  'micromark-extension-gfm-autolink-literal@2.1.0': { scope: 'workspace-only', reason: 'The patched Markdown parser is embedded in the client bundle.' },
  'node-pty@1.2.0-beta.15': { scope: 'shared', reason: 'Runtime terminals need helper resolution and Windows worker cleanup.' },
}

/** Reviewed Desktop dependency constraints, independent of patch selection. */
export const DESKTOP_RUNTIME_DEPENDENCY_OVERRIDES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(desktopExcludedWorkspacePackages.map(name => [name, '-'])),
  'dsh-univer-office': '-',
  'dsh-genui': '-',
  'dsh-quick-screenshot': '-',
  '@orderg-x/dsh-pages': '-',
  'dsh-knowledge-base': '-',
  'dsh-plugin-everything': '-',
  // The provider declares ^1.3.0; its patch is qualified against 1.3.0.
  '@earendil-works/pi-ai@^1.3.0': '1.3.0',
}
