# Qin Xiaozhi skin

English | [中文](README.zh.md)

A self-contained skin and control console for DSH 0.2.2-rc.1. It uses existing theme, sidebar, welcome-mark, and settings interfaces. No DSH source changes or rebuild are required to install it.

## Install or upgrade

In DSH plugin management, remove the previous Qin Xiaozhi package, then add the absolute path to `intranet-dsh-skin-qinxiaozhi-0.2.0.tgz` and enable it. Reload the page once if it still displays the previous plugin assets. This does not delete conversations. From this repository, the equivalent local installation is:

```sh
pnpm dsh plugin --profile web add "$PWD/local-plugins/qinxiaozhi-skin"
```

Select the installed bundle in plugin management after a CLI installation. On desktop, use the application's own plugin management so the plugin belongs to the desktop profile.

## Skin console

The sidebar footer contains **Skin console**. Settings → General also contains **Open skin console**. Both remain available when the skin's own switch is off; disabling the entire plugin in plugin management removes them.

- **Enable Qin Xiaozhi skin** changes the palette, sidebar logo, and selected layout features. Turning it off restores the original theme and branding.
- **Skin appearance** selects dark or light. The default is dark, independently of DSH's original appearance preference.
- **Conversations above navigation actions** moves the workspace/conversation area above the action list. The collapsed rail retains its original layout.
- **Show Qin Xiaozhi welcome** replaces the existing welcome content through the shipped brand-mark slot. The composer and workflow actions retain their behavior.
- **Restore skin defaults** enables the skin, dark appearance, conversation-first ordering, and the welcome content.

Changes are validated and saved by the Host in the `qinxiaozhi-skin` configuration namespace and apply to this profile's browsers. Controls show accepted settings, disable during saving, and report rejected or failed saves. A deployment that locks configuration through a home patch or command-line overlay must remove that override before the console can save. Reloading preserves saved choices.

## Compatibility and assets

The skin no longer uses the development-only `conversation.hero.content` slot or `data-sidebar-section` attributes. Its layout styles target the existing sidebar and brand-mark slot structure. A future DSH layout change may require updating those selectors. It does not recreate the reference screenshot's skill marketplace or native window title.

The robot badge is a transparent extraction and enlargement from the supplied screenshot; fine details are reconstructed from its small source image. The package includes its artwork and bundled Host schema library, so no runtime font, image, or script download is needed. `host-source.js` owns the Host entry; rebuild `index.js` from the repository using `pnpm exec esbuild local-plugins/qinxiaozhi-skin/host-source.js --bundle --platform=node --format=esm --outfile=local-plugins/qinxiaozhi-skin/index.js` before packing.

## Model Experience

No model inputs, tools, or session events are added.

### KV Cache effect

None; only browser presentation and user settings change.
