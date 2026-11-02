# Borrowed ideas and independent implementation: See Now

**Primary inspiration:** SAOS-3624 / dsh-see-now
https://github.com/SAOS-3624/dsh-see-now

**Original author:** SAOS-3624
**Original copyright:** Copyright © 2026 SAOS-3624
**Upstream license (current, verified 2026-11-02):** Apache License 2.0 ([license change a0e3c5c](https://github.com/SAOS-3624/dsh-see-now/commit/a0e3c5c725c91133cdbc4c4d7d90d50e31e01cc1)).
**Historical upstream license (earlier commits):** PolyForm Noncommercial License 1.0.0.
Current LICENSE: https://github.com/SAOS-3624/dsh-see-now/blob/main/LICENSE
**Original required notices:** https://github.com/SAOS-3624/dsh-see-now/blob/main/NOTICE

## Precisely what was borrowed conceptually

1. **Only look at meaningfully different visual frames.** Compare successive
   on-screen images and avoid repeatedly feeding near-identical screenshots
   to an AI vision model.
2. **Rate / cost containment.** A high-frequency stream of screenshots is
   inefficient, so choose fewer frames with explicit minimum gaps and budgets.
3. **A separate acquisition boundary.** Frame capture is not the same as
   frame selection: let a platform-specific trusted source provide images
   before any analysis.
4. **Explicit stop and lifecycle.** A visual monitoring task should have an
   unambiguous start/stop and not continue waking AI after user cancellation.

These are general software design concepts, not a copy of the original code.

## What was NOT reused

- Original source code (no copy/paste or vendor import).
- Original HSV three-channel weighted change score, 64x36 grid scoring,
  hard-cut spike detection, threshold values or motion accumulation algorithm.
- Original variable-tile collage / DP packing / PNG composition.
- FFmpeg Windows desktop ddagrab / gdigrab / DirectShow capture backend.
- Python Tkinter overlay, speech/voice/Window PID features.
- Periodic DSH session auto-wakeup and session event hooks.
- Original package name, DSH tool names, API signatures or plugin metadata.

## Our original replacement

| Capability | Clean-room gs implementation |
|---|---|
| Frame representation | supplied RGB888/RGBA8888 raw pixels only |
| Score | fixed 32x18 integer RGB luminance grid; mean absolute delta 0..100 |
| Candidate selection | last proposed frame baseline, minimum gap, minute quota |
| Model interaction | none; returns metadata proposal, never image bytes |
| Screen access | none; native adapter throws NOT_CONNECTED by default |
| Privacy | keep only one 576-byte luma fingerprint, zeroized on stop |
| Authorization | MUST be provided/enforced independently by Android host |
| Platform | Node-compatible pure JS tests; source-only, not mobile release |

## License and attribution rules for future maintainers

- The current upstream repository identifies its code as **Apache-2.0** in
  LICENSE, NOTICE and package.json. This is **not** a claim that every historical
  revision has the same terms or that third-party media/dependencies are covered.
- Do **not** move SAOS-3624 files into this repository, translate source, or
  relicense upstream works without checking the precise reused revision and
  applicable LICENSE/NOTICE, including older PolyForm Noncommercial restrictions.
  For Apache-2.0-covered copies or adaptations, preserve required license,
  copyright, modification and NOTICE information.
- Keep these attribution notes in README/docs/code headers when evolving the
  independent feature; credit the conceptual inspiration accurately.
- If a future contributor chooses to actually incorporate upstream code, stop
  and audit the exact applicable license and required notices *before* any
  distribution; mark the upstream files and their copyright explicitly.
- The current clean-room implementation is not the upstream See Now plugin
  and must not imply compatibility with its Windows capture/speech features.
