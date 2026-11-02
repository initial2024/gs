# Native Browser Visual Sampling — P0 source-only module

## Status: CORE_READY / ANDROID_BRIDGE_NOT_CONNECTED

This folder implements ONLY the safe-to-build-now pieces for a future DSH
Android native AI Browser image-sampling feature. It does **not** capture the
Android screen, acquire MediaProjection, create a floating window, read files,
send images to the model, register a DSH tool, or auto-wake any AI session.

### Conceptual attribution (read before changing code)

This work was inspired by **SAOS-3624/dsh-see-now**:
https://github.com/SAOS-3624/dsh-see-now

We borrowed two *ideas*: (1) skip near-identical pictures by measuring
frame-to-frame visual change; (2) cap image submission frequency to reduce
unnecessary visual-model input cost.

We DID NOT copy its source, its HSV weighted scoring, cut-point thresholds,
motion integrator, DP grid packer, ffmpeg capture, Tkinter overlay, conversational
session wakeup or timer implementations. This project uses an independently
written fixed-grid RGB luminance difference scorer and a manual proposal
planner. Upstream retains its original **PolyForm Noncommercial 1.0.0**
license and Copyright © 2026 SAOS-3624. Attribution is NOT a license grant for
commercial reuse of upstream source. See docs/SEE_NOW_ATTRIBUTION.md.

### Files

- src/frame-diff.mjs: accepts a supplied tightly packed RGB888/RGBA8888
  frame, downsamples to a 32x18 luminance fingerprint, returns 0–100 change.
- src/sampler.mjs: local OFF-by-default frame proposal planner (up to 120
  analyses and 6 proposals per minute, min 4s gap, ~1536 estimated tokens/min).
- src/native-adapter.mjs: deliberately throws NATIVE_VISION_BRIDGE_NOT_CONNECTED.
  Defines the future trusted native interface for screenshot and submission.
- test/: pure Node tests; no Android SDK, screen/window, network or APK needed.

### Run

    node --test vision/test/*.test.mjs

### Never infer native permissions from this module

Calling arm(scope) is **NOT consent**. It only begins local image-difference
analysis of already-provided pixel buffers. The **native Android host** must
verify its real, current session/tab/origin + per-operation user approval before
every capture or model submission. No JavaScript field, agent/tool instruction,
or local enabled flag may mint a Binder grant.

Pixels are not retained by the sampler; the last accepted keyframe's *32x18
luminance fingerprint* is held in memory and cleared on stop/scope change.
Even this tiny fingerprint is potentially privacy-sensitive: never persist
it, export it as logs or send it to model context.

The token number is a rough budgeting hint, NOT a model-provider token
quotation. The true attachment admission and provider budget must be separately
enforced at the trusted host.

### Handoff and release conditions

See docs/NATIVE_VISION_HANDOFF.md. Do not ship an installable .tgz or APK until
the real Android native capture broker, consent UI, revocation, sensitive-data
rules and image-to-model lifecycle have been implemented and tested.
