/**
 * Original bounded keyframe PROPOSAL planner. No screen capture / upload.
 *
 * Conceptual inspiration: SAOS-3624/dsh-see-now
 * https://github.com/SAOS-3624/dsh-see-now
 * Borrowed idea: suppress redundant visual frames. This is a clean-room
 * luminance-grid implementation; no upstream noncommercial code copied.
 *
 * SECURITY: arm() only enables LOCAL analysis. It is NOT Android consent.
 * Native host must validate real session, tab, origin and per-operation
 * permission before capture AND again before any model image submission.
 */
import {fingerprintFrame,scoreFingerprints} from './frame-diff.mjs';

export const DEFAULT_POLICY=Object.freeze({
  threshold:14,
  minGapMs:4000,
  maxFramesPerMinute:120,
  maxProposalsPerMinute:6,
  estimatedTokensPerImage:256,
  estimatedTokenBudgetPerMinute:1536,
});
const fail=code=>{throw new TypeError(code);};
const policyKeys=Object.keys(DEFAULT_POLICY);
function validatePolicy(policy){
  if(!policy||typeof policy!=='object'||Array.isArray(policy)||
     Object.keys(policy).some(k=>!policyKeys.includes(k)))fail('INVALID_POLICY');
  const p={...DEFAULT_POLICY,...policy};
  if(!Number.isFinite(p.threshold)||p.threshold<0||p.threshold>100)fail('INVALID_THRESHOLD');
  for(const key of policyKeys.filter(k=>k!=='threshold')){
    if(!Number.isSafeInteger(p[key])||p[key]<=0)fail('INVALID_POLICY_LIMIT');
  }
  if(p.minGapMs<1000||p.minGapMs>60000||
     p.maxFramesPerMinute>600||p.maxProposalsPerMinute>30||
     p.estimatedTokensPerImage>10000||
     p.estimatedTokenBudgetPerMinute>100000)fail('INVALID_POLICY_LIMIT');
  return Object.freeze(p);
}
export function validateScope(s){
  if(!s||typeof s!=='object'||Array.isArray(s)||
     Object.keys(s).some(k=>!['sessionId','tabId','origin'].includes(k)))fail('INVALID_SCOPE');
  const id=v=>typeof v==='string'&&v.length>0&&v.length<=128&&/^[a-zA-Z0-9_:-]+$/.test(v);
  if(!id(s.sessionId)||!id(s.tabId))fail('INVALID_SCOPE_ID');
  if(typeof s.origin!=='string'||s.origin.length>512)fail('INVALID_ORIGIN');
  let url;
  try{url=new URL(s.origin);}catch{fail('INVALID_ORIGIN');}
  if(!['http:','https:'].includes(url.protocol)||
     url.username||url.password||url.pathname!=='/'||url.search||url.hash||
     url.origin!==s.origin)fail('INVALID_ORIGIN');
  // This verifies string shape, NOT actual URL access, IP/DNS or authorization.
  return Object.freeze({sessionId:s.sessionId,tabId:s.tabId,origin:s.origin});
}
const matches=(a,b)=>a?.sessionId===b.sessionId&&a?.tabId===b.tabId&&a?.origin===b.origin;
function zeroize(bytes){try{bytes?.fill(0);}catch{/* already detached */}}
/**
 * Ingest ONLY frames supplied from a future trusted Native Browser broker.
 * Monotonic clock MUST be injected by host (default performance.now()).
 *
 * Public API: arm(scope), ingest({scope,frame}), stop(), status().
 * The returned proposal is metadata only; it never contains image bytes.
 * No timer, network, filesystem, FFmpeg, model wakeup, or screen permission.
 */
export function createFrameSampler(options={}, {now=()=>performance.now()}={}){
  const p=validatePolicy(options);
  if(typeof now!=='function')fail('INVALID_CLOCK');
  let armed=false,scope=null,keyframe=null,lastProposal=null,lastNow=null,
      minuteStart=null,frames=0,proposals=0,tokenEstimate=0;
  const reset=()=>{
    zeroize(keyframe);keyframe=null;lastProposal=null;
    minuteStart=null;frames=0;proposals=0;tokenEstimate=0;
  };
  function stop(){
    reset();armed=false;scope=null;lastNow=null;
    return {ok:true,status:'OFF'};
  }
  function arm(requestedScope){
    const verifiedShape=validateScope(requestedScope);
    stop();scope=verifiedShape;armed=true;
    return {ok:true,status:'LOCAL_PROPOSALS_ONLY',nativeConsent:'NOT_VERIFIED'};
  }
  function status(){
    return Object.freeze({
      mode:armed?'LOCAL_PROPOSALS_ONLY':'OFF',
      nativeCapture:'NOT_CONNECTED',canGrantAccess:false,
      framesThisMinute:frames,proposalsThisMinute:proposals,
      estimatedTokensThisMinute:tokenEstimate,
    });
  }
  function ingest({scope:requestedScope,frame}={}){
    if(!armed)return {propose:false,reason:'OFF'};
    let incoming;
    try{incoming=validateScope(requestedScope);}
    catch{stop();return {propose:false,reason:'INVALID_SCOPE_STOPPED'};}
    if(!matches(scope,incoming)){
      stop();return {propose:false,reason:'SCOPE_CHANGED_STOPPED'};
    }
    const t=now();
    if(!Number.isFinite(t)||t<0||(lastNow!==null&&t<lastNow)){
      stop();return {propose:false,reason:'MONOTONIC_CLOCK_FAILURE_STOPPED'};
    }
    lastNow=t;
    if(minuteStart===null||t-minuteStart>=60000){
      minuteStart=t;frames=0;proposals=0;tokenEstimate=0;
    }
    if(frames>=p.maxFramesPerMinute)return {propose:false,reason:'FRAME_RATE_QUOTA'};
    const next=fingerprintFrame(frame);
    frames++;
    const initial=keyframe===null;
    const score=initial?100:scoreFingerprints(keyframe,next);
    const gap=lastProposal!==null&&t-lastProposal<p.minGapMs;
    const exhausted=proposals>=p.maxProposalsPerMinute||
      tokenEstimate+p.estimatedTokensPerImage>p.estimatedTokenBudgetPerMinute;
    const propose=(initial||score>=p.threshold)&&!gap&&!exhausted;
    if(propose){
      zeroize(keyframe);keyframe=next;lastProposal=t;
      proposals++;tokenEstimate+=p.estimatedTokensPerImage;
    }else{zeroize(next);}
    return Object.freeze({
      propose,
      reason:propose?(initial?'INITIAL_FRAME':'VISUAL_CHANGE')
        :exhausted?'PROPOSAL_BUDGET':gap?'MIN_GAP':'NO_SIGNIFICANT_CHANGE',
      changeScore:score,estimatedTokens:propose?p.estimatedTokensPerImage:0,
      nativeConsent:'NOT_VERIFIED',
    });
  }
  return Object.freeze({arm,ingest,stop,status});
}
