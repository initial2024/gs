import test from 'node:test';
import assert from 'node:assert/strict';
import {FRAME_BOUNDS,validateFrame,fingerprintFrame,scoreFingerprints} from '../src/frame-diff.mjs';

function frame(value=0, width=8, height=8, format='RGBA8888'){
  const channels=format==='RGBA8888'?4:3;
  const pixels=new Uint8Array(width*height*channels);
  for(let i=0;i<pixels.length;i+=channels){
    pixels[i]=value;pixels[i+1]=value;pixels[i+2]=value;
    if(channels===4)pixels[i+3]=255;
  }
  return {width,height,format,pixels};
}
test('independent RGB fingerprint is fixed small resolution, never full image',()=>{
  const f=fingerprintFrame(frame(0));
  assert.ok(f instanceof Uint8Array);
  assert.equal(f.length,FRAME_BOUNDS.gridWidth*FRAME_BOUNDS.gridHeight);
  assert.ok(f.every(x=>x===0));
  assert.equal(scoreFingerprints(f,f),0);
});
test('0 to white gives full 100 change, both RGB and RGBA supported',()=>{
  const black=fingerprintFrame(frame(0));
  const white=fingerprintFrame(frame(255,8,8,'RGB888'));
  assert.equal(scoreFingerprints(black,white),100);
  assert.equal(scoreFingerprints(white,white),0);
});
test('invalid frame dimensions, unknown format and oversized raw pixels fail',()=>{
  for(const f of [
    {...frame(),width:0},{...frame(),width:5000},
    {...frame(),height:-1},{...frame(),width:3000,height:3000},
    {...frame(),format:'BGRA8888'},{...frame(),pixels:'not bytes'},
    {...frame(),pixels:new Uint8Array(4)},
  ])assert.throws(()=>fingerprintFrame(f),/INVALID_FRAME|FRAME_TOO_LARGE/);
});
test('metadata is never interpolated or read from frame content',()=>{
  const a=frame(0);
  a.password='CANARY_SECRET';
  const f=fingerprintFrame(a);
  assert.equal(f.length,576);
  assert.equal(JSON.stringify([...f]).includes('CANARY_SECRET'),false);
});
test('invalid fingerprint lengths fail closed',()=>{
  assert.throws(()=>scoreFingerprints(new Uint8Array(2),new Uint8Array(2)),/INVALID_FINGERPRINT/);
  assert.equal(validateFrame(frame()).channels,4);
});
