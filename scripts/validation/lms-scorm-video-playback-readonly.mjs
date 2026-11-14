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


/**
 * Count authored video-bearing slides from the actual loaded SCORM edition.
 * This is read-only media inventory, never an assessment answer or a CMI gate.
 * One slide counts once even when the ZIP repeats that media in body/metadata.
 */
export function countAuthoredVideoSlides(slides) {
  if (!Array.isArray(slides)) return 0;
  const videoUrl = /\.(?:mp4|webm|mov)(?:[?#].*)?$/i;
  const isVideo = (entry) => {
    if (typeof entry === 'string') return videoUrl.test(entry);
    if (Array.isArray(entry)) return entry.some(isVideo);
    if (entry && typeof entry === 'object') {
      return [entry.src, entry.url, entry.href].some((value) =>
        typeof value === 'string' && videoUrl.test(value));
    }
    return false;
  };
  return Math.min(500, slides.filter((slide) => (
    isVideo(slide?.media) || isVideo(slide?.primaryMedia) ||
    isVideo(slide?.assets)
  )).length);
}

/**
 * Focused read-only SCORM certification must budget for authored video playback
 * AND the remainder of the course. The first observed video is only a lower
 * bound: later slides can include more real video lessons. Grant extra time,
 * never synthetic completion, seeks, altered playback rates or skipped gates.
 *
 * Applies only when the caller explicitly selected one or more course IDs.
 * The global 80-minute per-browser workflow remains the outer safety limit.
 */
export function computeFocusedCourseBudgetMs({
  slideCount = 0,
  requiredInteractions = 0,
  observedVideoSeconds = 0,
  authoredVideoSlides = 0,
} = {}) {
  const safeCount = (value, maximum) => {
    const count = Number(value);
    return Number.isFinite(count) && count > 0
      ? Math.min(Math.ceil(count), maximum)
      : 0;
  };
  const slides = safeCount(slideCount, 500);
  const interactions = safeCount(requiredInteractions, 20);
  const observedSeconds = safeCount(observedVideoSeconds, 600);
  const videoSlides = safeCount(authoredVideoSlides, 500);

  // Ten seconds of overhead/reading per slide would be too generous for the
  // batch survey, but in focused mode eight seconds plus authored video is
  // appropriate to verify actual navigation without skipping media.
  const readingAndNavigationMs = slides * 8_000;
  const requiredInteractionsMs = interactions * 50_000;
  const knownVideoMs = observedSeconds * 1_000;
  // Budget for ALL authored video-bearing slides. The first video observed
  // during the 7s suspend probe is not the total duration of a 50-slide course.
  // 180s per authored video is an upper-bound allowance, not a playback skip.
  const remainingVideoAllowanceMs = videoSlides * 180_000;
  return Math.min(
    3_600_000,
    Math.max(180_000, 180_000 + readingAndNavigationMs +
      requiredInteractionsMs + knownVideoMs + remainingVideoAllowanceMs),
  );
}
