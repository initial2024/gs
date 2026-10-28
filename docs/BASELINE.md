# Baseline audit

Target APK:

- Name: `DSH0.4.1-v70(1).apk`
- Size: `147052182` bytes
- SHA-256: `d12735f679bdac29bd4f3c17425c738e0340aeae376f71eb675ad28cb878a430`

Critical content hashes:

- `classes.dex`: `066a45f2a5daca27128f979674e40df087d14c979ae9dd0d4ebce98dbfc2faf2`
- `classes2.dex`: `90f2107afa7eee522c45310fc4e8ae5ec24079ecfce0c5145838c69b78b35e51`
- `assets/browser-tool.zip`: `acd548201365fdd8088511f4a547fc5be07d63c6a26a859d7b7536835e48cb0f`
- `assets/browser-pane.zip`: `87066b836f6c0d9396520b011eacd918e11ecf6323a9a17709e58287a175e377`

Observed native browser implementation already present in `classes.dex`:

- `com/dsh/android/browser/AiBrowserView`
- `com/dsh/android/browser/BrowserBridge`
- `openAiBrowser`
- `closeAiBrowser`
- `aiBrowserLayout`
- `aiBrowserDetach`
- `aiBrowserState`
- `browser-cmd.json`
- `browser-result.json`
- `setUseWideViewPort`
- `setLoadWithOverviewMode`
- `getUserAgentString`
- `setUserAgentString`
- viewport-related native strings.

The embedded `dsh-android-browser` tool already supports:

```text
open
read
click
type
press
scroll
screenshot
back
forward
reload
tabs
wait
eval
```

The v1.1 asset patch must not replace or emulate these actions. It extends the existing tool.

## Frozen invariant for asset-only v1.1

The uncompressed contents of every APK ZIP entry must remain identical except:

```text
assets/browser-tool.zip
```

In particular:

```text
classes.dex         UNCHANGED
classes2.dex        UNCHANGED
assets/browser-pane.zip UNCHANGED
engine.bin          UNCHANGED
node-runtime.bin    UNCHANGED
mobile-ui.zip       UNCHANGED
```

ZIP offsets and signing blocks necessarily change during repack/zipalign/signing and are not treated as app-content changes.
