/**
 * Read-only evidence driver for REQUIRED authored HTML5 video lessons.
 * A trusted browser click starts the actual media and playback must run in
 * real time. Never seek, change currentTime, fire an "ended" event, or unlock
 * an authored Next button. The course itself remains the authority to advance.
 */
export async function readVisibleVideo(frame){
  try{
    const locator=frame.locator('video:visible').first();
    if(await locator.count()===0)return {kind:'absent',duration:null};
    const state=await locator.evaluate(video=>({
      paused:video.paused===true,
      ended:video.ended===true,
      readyState:Number(video.readyState)||0,
      errorCode:video.error?.code??null,
      duration:Number.isFinite(video.duration)&&video.duration>0?video.duration:null,
    }));
    if(state.ended)return {kind:'ended',duration:state.duration};
    if(state.errorCode)return {kind:'error',duration:state.duration};
    if(!state.paused)return {kind:'playing',duration:state.duration};
    if(state.readyState===0)return {kind:'loading',duration:state.duration};
    return {kind:'paused',duration:state.duration};
  }catch{
    return {kind:'unavailable',duration:null};
  }
}

export async function startRealVisibleVideo(frame){
  const before=await readVisibleVideo(frame);
  if(before.kind!=='paused')return before;
  const locator=frame.locator('video:visible').first();
  try{
    const box=await locator.boundingBox();
    if(!box||box.width<48||box.height<48)return {kind:'unavailable',duration:before.duration};
    // Native HTMLMediaElement controls have the play button near bottom-left.
    // The click uses real Playwright input, never dispatchEvent().
    await locator.click({position:{
      x:Math.min(24,Math.floor(box.width/4)),
      y:Math.max(6,Math.floor(box.height-20)),
    },timeout:2_500});
    // In engines where the native controls don't expose the play button,
    // a real click provides user activation. play() starts ordinary playback;
    // it cannot satisfy the lesson until the actual media emits its own end.
    await locator.evaluate(video=>{
      if(video.paused&&!video.ended)void video.play().catch(()=>undefined);
    });
    const after=await readVisibleVideo(frame);
    if(after.kind==='playing')return {kind:'started',duration:after.duration};
    if(after.kind==='error')return after;
    return {kind:'starting',duration:after.duration??before.duration};
  }catch{
    return {kind:'unavailable',duration:before.duration};
  }
}
