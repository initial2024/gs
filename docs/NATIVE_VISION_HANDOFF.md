# Native Browser Visual Sampling — Technical Handoff

Status (2026-11-02): **source-only core; no DSH Android integration**.
Target repository: initial2024/gs, standalone legacy v70 browser-enhancement
research. The active v139 DSH app lives in a **different** source repository
(u2584604327-a11y/dshe) and has its own release gates. Do not patch/replace
that app or fixed signer from here.

Related tracking: https://github.com/initial2024/gs/issues/1

## 1. Existing working pieces (source + tests)

| File | Responsibility | Real Android screenshot? |
|---|---|---|
| vision/src/frame-diff.mjs | bounded RGB frame validation and original luma-based difference score | NO |
| vision/src/sampler.mjs | OFF-by-default local candidate selection, gap and quotas | NO |
| vision/src/native-adapter.mjs | explicit fail-closed native capture / submit stub | NO |
| vision/test/*.test.mjs | pure JS unit tests for no-capture state and edge cases | NO |
| docs/SEE_NOW_ATTRIBUTION.md | precise upstream attribution and licensing boundary | n/a |

No DSH plugin registration, no timers, no FFmpeg, no MediaProjection,
no root/Shizuku/ADB, no network, no filesystem writes and no model uploads.

## 2. Trusted Android integration contract (NOT implemented)

Native Android host must expose a tightly scoped Broker API. Example **shape**
below is documentation, not an available interface:

    captureApprovedBrowserFrame({sessionId, tabId, origin, requestId})
      => {width, height, format:"RGBA8888", pixels:Uint8Array}

    submitApprovedImage({sessionId, tabId, origin, requestId, image})
      => native-approved attachment reference

Contract:
1. Verify **actual** Android Binder caller UID and active worker generation;
   refuse JSON self-attested UID, model credentials and stale process leases.
2. Verify session/tab/origin against the **live native WebView** immediately
   before capture. Block off-tab, history navigation race, cross-origin
   redirect, destroyed tab and mismatched main/overlay owner.
3. Provide a visible **native user consent control** with default OFF,
   immediate Stop and unambiguous capture indicator. A UI checkbox or JS
   arm() is NOT consent; process death, disconnect and stop revoke everything.
4. Prefer the existing DSH Native AI Browser **tab screenshot** primitive
   for explicit tab-scoped reads. This source module deliberately does not
   request Android full-screen MediaProjection. If full-screen capture is
   later explicitly required, design a separate native MediaProjection
   consent/foreground-service lifecycle and Android-version verification.
5. Define privacy policy for password/OTP/payment/secure-window fields. If
   the host cannot establish a safe capture boundary, deny the request:
   NEVER send a screenshot in hope that JS can reliably redact it.
6. Clamp frame shape and budget *at the trusted native boundary* too:
   max input 16 MiB, dimensions 1..4096, nominal max 120 analyses and
   6 proposals/minute, minimum 4s between proposals. The JS planner is
   defense-in-depth only; these counts are NOT native enforcement.
7. Submit image **only after separate native approval** tied to original
   request ID/attachment destination; never infer consent from a returned
   local proposal or model tool call.
8. Allow no remote endpoints, raw file paths, shell, diagnostic upload,
   persistent storage, automatic model wakeup or background screen capture
   through this library.
9. Clear luma fingerprints on Stop, owner change, tab switch, consent
   revocation and app restart. Never persist frames or fingerprints to
   logs, screenshots, crash reports or GitHub artifacts.
10. Preserve original DSH browser open/read/click/type/screenshot behavior,
    chat streaming, session owner, OmniGate and installed data unchanged.

## 3. JS-side sequence after native Broker exists

1. Native UI obtains specific user approval for tab-scoped visual analysis.
2. Host validates real session/tab/origin and starts its own screenshot
   monitoring state (NOT a plugin).
3. Trusted host creates a sampler with createFrameSampler(options).
4. Host calls sampler.arm(scope) **for local analysis only**.
5. Every new host-provided RGBA image is passed to
   sampler.ingest({scope,frame}). The sampler returns a *proposal* with
   changeScore and estimatedTokens; no screenshot or text leaks into it.
6. If propose === true, trusted host re-checks approved user operation,
   sensitivity / redaction and image quota. Only then use its native
   attachment tool to send the approved frame to the target model turn.
7. If capture stops, grants expire, browser tab changes, process dies or
   model/provider errors: sampler.stop(), clear temporary frames, revoke
   native grants and do not automatically retry.
8. Do not add a permanent AI wakeup loop until a separate runtime review
   proves that session ownership, token budget and repeat execution remain
   correct. This design intentionally omits that feature.

Example **analysis-only**:

    import { createFrameSampler } from "./vision/src/sampler.mjs";
    const sampler = createFrameSampler();
    // Host MUST already have enforced consent; not implemented here.
    sampler.arm({sessionId:"s1",tabId:"t1",origin:"https://example.com"});
    const decision = sampler.ingest({
      scope:{sessionId:"s1",tabId:"t1",origin:"https://example.com"},
      frame:{width:W,height:H,format:"RGBA8888",pixels:rgbaBytes},
    });
    // decision.propose is NOT authorization to upload or record.

## 4. Independent acceptance and release gates

- CI: Node tests, syntax checks and no prohibited source imports PASS.
- Native: real Android arm64 WebView exact tab screenshot quality and identity
  confirmed with user consent, not simulated RGB fixtures.
- Negative controls: password/OTP/payment/protected page DENIED, tab switch
  invalidates capture, hidden/closed/detached WebView DENIED.
- Stop and restart: zero screenshots / model submissions after Stop, process
  death or detached overlay; no stale cookie/session leaks.
- Budget: measurable bounded proposals and **provider-side** token accounting;
  static page generates no repeated image uploads.
- Regression: original open/read/click/type/screenshot + DSH stream + relay
  still work; no new 409 runtime owner mismatch.
- Licensing: original SAOS-3624 credit retained; no upstream code currently
  copied. Upstream changed historical PolyForm Noncommercial to Apache-2.0 at
  a0e3c5c (2026-11-02); audit the exact revision, LICENSE and NOTICE before
  any future source reuse or distribution.
- Release only when all production native gates PASS. Until then
  NATIVE_VISION_BRIDGE_NOT_CONNECTED and NO installable plugin or APK.

## 5. Stop conditions / fail-closed behavior

Missing native screen permission, unsupported DSH screenshot IPC, foreign tab,
unknown runtime owner, failed sensitive-data policy, stale approval, source
size beyond limits or inability to account real media cost => **STOP**.
Do not fake compatibility, silently fall back to full-device capture,
weaken Android permissions or overwrite the existing APK.

## 6. Reproducible local commands

    node --check vision/src/frame-diff.mjs
    node --check vision/src/sampler.mjs
    node --check vision/src/native-adapter.mjs
    node --test vision/test/*.test.mjs

No Android SDK or user-supplied APK needed for these source-only tests.
