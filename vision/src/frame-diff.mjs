/**
 * Original, dependency-free RGB frame-difference algorithm.
 *
 * Conceptual inspiration: SAOS-3624/dsh-see-now
 * https://github.com/SAOS-3624/dsh-see-now
 * Borrowed idea: select visually changed frames rather than sending duplicates.
 * NOT borrowed: source code, HSV scoring, accumulation, FFmpeg, Tkinter,
 * collage packing, or session auto-wakeup. The upstream implementation is
 * licensed PolyForm Noncommercial 1.0.0; none of it is copied here.
 *
 * This analysis module DOES NOT capture screens or grant Android permissions.
 */
export const FRAME_BOUNDS=Object.freeze({
  maxDimension:4096,maxBytes:16*1024*1024,gridWidth:32,gridHeight:18,
});
const invalid=code=>{throw new TypeError(code);};
export function validateFrame(frame){
  if(!frame||typeof frame!=='object')invalid('INVALID_FRAME');
  const {width,height,format,pixels}=frame;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||
     width>FRAME_BOUNDS.maxDimension||height>FRAME_BOUNDS.maxDimension)
    invalid('INVALID_FRAME_DIMENSIONS');
  if(!['RGB888','RGBA8888'].includes(format))invalid('INVALID_FRAME_FORMAT');
  if(!(pixels instanceof Uint8Array))invalid('INVALID_FRAME_BUFFER');
  const channels=format==='RGB888'?3:4;
  const size=width*height*channels;
  if(size>FRAME_BOUNDS.maxBytes)invalid('FRAME_TOO_LARGE');
  if(pixels.byteLength!==size)invalid('INVALID_FRAME_LENGTH');
  return {width,height,pixels,channels};
}
/**
 * Returns 32x18 luminance fingerprint, never raw pixels. Fingerprints can
 * reveal coarse screen information; treat as private, zeroize on stop/change.
 * Uses standard RGB integer luminance; not the upstream HSV algorithm.
 */
export function fingerprintFrame(frame){
  const {width,height,pixels,channels}=validateFrame(frame);
  const {gridWidth:w,gridHeight:h}=FRAME_BOUNDS;
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++){
    const srcY=Math.min(height-1,Math.floor((y+.5)*height/h));
    for(let x=0;x<w;x++){
      const srcX=Math.min(width-1,Math.floor((x+.5)*width/w));
      const i=(srcY*width+srcX)*channels;
      out[y*w+x]=(77*pixels[i]+150*pixels[i+1]+29*pixels[i+2]+128)>>8;
    }
  }
  return out;
}
/** 0..100 average absolute luminance delta; no semantics or OCR. */
export function scoreFingerprints(a,b){
  const size=FRAME_BOUNDS.gridWidth*FRAME_BOUNDS.gridHeight;
  if(!(a instanceof Uint8Array)||!(b instanceof Uint8Array)||
     a.length!==size||b.length!==size)invalid('INVALID_FINGERPRINT');
  let sum=0;
  for(let i=0;i<size;i++)sum+=Math.abs(a[i]-b[i]);
  return Number((100*sum/(size*255)).toFixed(2));
}
