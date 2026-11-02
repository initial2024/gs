import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameSampler,validateScope} from '../src/sampler.mjs';
import {createUnconnectedNativeVisionAdapter} from '../src/native-adapter.mjs';
const scope=Object.freeze({sessionId:'session_1',tabId:'tab_3',origin:'https://example.com'});
const image=(v)=>({width:4,height:4,format:'RGB888',pixels:new Uint8Array(4*4*3).fill(v)});
function rig(opts={}){
  let clock=0;
  const sampler=createFrameSampler(opts,{now:()=>clock});
  return {sampler,at:t=>{clock=t;},add:(v)=>sampler.ingest({scope,frame:image(v)})};
}
test('default OFF: no capture or image proposals',()=>{
  const r=rig();
  assert.deepEqual(r.add(0),{propose:false,reason:'OFF'});
  assert.equal(r.sampler.status().nativeCapture,'NOT_CONNECTED');
  assert.equal(r.sampler.status().canGrantAccess,false);
});
test('explicit local arm does not grant native permission',()=>{
  const r=rig();
  assert.equal(r.sampler.arm(scope).nativeConsent,'NOT_VERIFIED');
  assert.equal(r.add(0).reason,'INITIAL_FRAME');
  const second=r.add(0);
  assert.equal(second.propose,false);
  assert.ok(!JSON.stringify(second).includes('pixels'));
  assert.ok(!JSON.stringify(second).includes('session_1'));
});
test('baseline uses only selected keyframes; unchanged frames stay silent',()=>{
  const r=rig();r.sampler.arm(scope);
  assert.equal(r.add(0).propose,true);
  r.at(5000);assert.equal(r.add(0).reason,'NO_SIGNIFICANT_CHANGE');
  r.at(10000);assert.equal(r.add(255).reason,'VISUAL_CHANGE');
  r.at(15000);assert.equal(r.add(255).reason,'NO_SIGNIFICANT_CHANGE');
  assert.equal(r.sampler.status().proposalsThisMinute,2);
});
test('minimum gap throttles changes',()=>{
  const r=rig();r.sampler.arm(scope);
  assert.equal(r.add(0).propose,true);
  r.at(1000);assert.equal(r.add(255).reason,'MIN_GAP');
  r.at(4000);assert.equal(r.add(255).propose,true);
});
test('per-minute proposal budget and rollover',()=>{
  const r=rig({maxProposalsPerMinute:1});r.sampler.arm(scope);
  r.add(0);r.at(5000);
  assert.equal(r.add(255).reason,'PROPOSAL_BUDGET');
  r.at(60000);
  assert.equal(r.add(255).propose,true);
});
test('per-minute analysis limit stops excessive input',()=>{
  const r=rig({maxFramesPerMinute:1});r.sampler.arm(scope);
  r.add(0);
  r.at(5000);assert.equal(r.add(255).reason,'FRAME_RATE_QUOTA');
  assert.equal(r.sampler.status().framesThisMinute,1);
});
test('estimated token cap is only an advisory proposal cap',()=>{
  const r=rig({estimatedTokensPerImage:400,estimatedTokenBudgetPerMinute:400});
  r.sampler.arm(scope);r.add(0);r.at(5000);
  assert.equal(r.add(255).reason,'PROPOSAL_BUDGET');
  assert.equal(r.sampler.status().estimatedTokensThisMinute,400);
});
test('switching tab/session/origin immediately stops and clears memory',()=>{
  for(const change of [{tabId:'tab_4'},{sessionId:'session_2'},{origin:'https://other.example'}]){
    const r=rig();r.sampler.arm(scope);r.add(0);
    const out=r.sampler.ingest({scope:{...scope,...change},frame:image(255)});
    assert.equal(out.reason,'SCOPE_CHANGED_STOPPED');
    assert.equal(r.sampler.status().mode,'OFF');
    assert.equal(r.add(0).reason,'OFF');
  }
});
test('time regression stops instead of bypassing throttles',()=>{
  const r=rig();r.sampler.arm(scope);r.at(4000);r.add(0);r.at(3000);
  assert.equal(r.add(255).reason,'MONOTONIC_CLOCK_FAILURE_STOPPED');
  assert.equal(r.sampler.status().mode,'OFF');
});
test('invalid / unsafe origin or extra scope fields are rejected',()=>{
  for(const input of [
    {...scope,origin:'file:///tmp/picture.png'},
    {...scope,origin:'https://user:pass@example.com'},
    {...scope,origin:'https://example.com/path'},
    {...scope,origin:'https://example.com?x=1'},
    {...scope,origin:'http://example.com/'},
    {...scope,origin:'https://example.com',credentials:'PASSWORD'},
    {...scope,tabId:''}
  ])assert.throws(()=>validateScope(input),/INVALID_SCOPE|INVALID_ORIGIN/);
  assert.equal(validateScope(scope).origin,'https://example.com');
});
test('invalid scope while armed forces local OFF',()=>{
  const r=rig();r.sampler.arm(scope);
  assert.equal(r.sampler.ingest({scope:null,frame:image(0)}).reason,'INVALID_SCOPE_STOPPED');
  assert.equal(r.sampler.status().mode,'OFF');
});
test('unconnected native adapter cannot capture or submit a picture',async()=>{
  const bridge=createUnconnectedNativeVisionAdapter();
  assert.equal(bridge.nativeBridge,'NOT_CONNECTED');
  await assert.rejects(bridge.captureApprovedBrowserFrame({scope}),/NATIVE_VISION_BRIDGE_NOT_CONNECTED/);
  await assert.rejects(bridge.submitApprovedImage({scope}),/NATIVE_VISION_BRIDGE_NOT_CONNECTED/);
});
test('no model wakeup, network or writable artifact exists in source-only API',()=>{
  const r=rig();const keys=Object.keys(r.sampler).sort();
  assert.deepEqual(keys,['arm','ingest','status','stop']);
  assert.deepEqual(r.sampler.stop(),{ok:true,status:'OFF'});
});
