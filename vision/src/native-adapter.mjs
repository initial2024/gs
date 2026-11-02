/**
 * Fail-closed native Browser screenshot adapter placeholder.
 *
 * CONCEPT CREDIT: SAOS-3624/dsh-see-now (select only changed frames).
 * https://github.com/SAOS-3624/dsh-see-now
 * NO code copied. Their Windows ffmpeg/Tkinter stack is NOT Android.
 *
 * The interface below is intentionally NOT an implementation of Android
 * screenshot capture. A future trusted Native Browser Broker must enforce
 * Android consent, actual runtime identity, session/tab/origin ownership,
 * sensitive-field exclusion and per-submission permissions in native code.
 * The UI/model may never mint grants by passing JavaScript flags here.
 */
export class NativeVisionNotConnectedError extends Error {
  constructor(){
    super('NATIVE_VISION_BRIDGE_NOT_CONNECTED');
    this.name='NativeVisionNotConnectedError';
  }
}
export function createUnconnectedNativeVisionAdapter(){
  return Object.freeze({
    nativeBridge:'NOT_CONNECTED',
    async captureApprovedBrowserFrame(){
      throw new NativeVisionNotConnectedError();
    },
    async submitApprovedImage(){
      throw new NativeVisionNotConnectedError();
    },
  });
}
/**
 * Future host-only contract (DO NOT expose as model-callable directly):
 *
 * captureApprovedBrowserFrame({sessionId, tabId, origin, requestId}):
 * - Native, not JS, authenticates live session/tab/current WebView URL and
 *   UID; checks a native user-approved operation.
 * - Re-check authorization on every call, not just once at start.
 * - Reject protected/password/OTP/payment views and ambiguous page states.
 * - Return bounded {width,height,format:'RGBA8888',pixels:Uint8Array}.
 * - No arbitrary file path, process spawn or MediaProjection in plugin code.
 *
 * submitApprovedImage({sessionId,tabId,origin,requestId,image}):
 * - Native re-checks consent and attachment destination, applies redaction,
 *   bounded size/rate and cancellation; never inferred from sampler.propose.
 * - This module never calls the API by itself.
 */
