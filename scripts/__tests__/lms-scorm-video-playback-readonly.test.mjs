import assert from 'node:assert/strict';
import test from 'node:test';
import {readVisibleVideo,startRealVisibleVideo,computeFocusedCourseBudgetMs,countAuthoredVideoSlides}
  from '../validation/lms-scorm-video-playback-readonly.mjs';

function fixture({clickStarts=true,playStarts=true,visible=true,paused=true,ended=false,readyState=4}={}){
  let clicks=0,playCalls=0;
  const video={paused,ended,readyState,duration:118,currentTime:0,error:null,
    play(){
      playCalls++;
      if(playStarts)this.paused=false;
      return Promise.resolve();
    },
  };
  const locator={
    first(){return this;},
    async count(){return visible?1:0;},
    async evaluate(fn){return fn(video);},
    async boundingBox(){return {x:0,y:0,width:720,height:400};},
    async click(){
      clicks++;
      if(clickStarts)video.paused=false;
    },
  };
  return {frame:{locator:()=>locator},video,metrics:()=>({clicks,playCalls})};
}
test('required video begins by real click; no time seeking or fake end',async()=>{
  const f=fixture();
  assert.equal((await readVisibleVideo(f.frame)).kind,'paused');
  const started=await startRealVisibleVideo(f.frame);
  assert.equal(started.kind,'started');
  assert.equal(started.duration,118);
  assert.deepEqual(f.metrics(),{clicks:1,playCalls:0});
  assert.equal(f.video.currentTime,0);
  assert.equal(f.video.ended,false);
});
test('native control unavailable still attempts true play; never fabricates finish',async()=>{
  const f=fixture({clickStarts:false,playStarts:true});
  assert.equal((await startRealVisibleVideo(f.frame)).kind,'started');
  assert.deepEqual(f.metrics(),{clicks:1,playCalls:1});
  assert.equal(f.video.ended,false);
  assert.equal(f.video.currentTime,0);
});
test('already playing/ended media is not restarted',async()=>{
  const playing=fixture({paused:false});
  assert.equal((await startRealVisibleVideo(playing.frame)).kind,'playing');
  assert.equal(playing.metrics().clicks,0);
  const ended=fixture({ended:true,paused:true});
  assert.equal((await startRealVisibleVideo(ended.frame)).kind,'ended');
  assert.equal(ended.metrics().clicks,0);
});
test('not-ready or absent media does not start or skip a required lesson',async()=>{
  const loading=fixture({readyState:0});
  assert.equal((await startRealVisibleVideo(loading.frame)).kind,'loading');
  assert.equal(loading.metrics().clicks,0);
  const missing=fixture({visible:false});
  assert.equal((await startRealVisibleVideo(missing.frame)).kind,'absent');
});

test('focused certification allocates actual media time plus 50-slide coverage',()=>{
  const budget=computeFocusedCourseBudgetMs({
    slideCount:50, requiredInteractions:0, observedVideoSeconds:109.088,
  });
  // Previous 420s cap could expire at slide 11 while real video was still
  // playing. This bounds a genuine extra ~11 minutes for focused diagnostics.
  assert.equal(budget,690_000);
  assert.ok(budget>420_000);
});

test('focused budget is finite and bounded for malformed or huge manifests',()=>{
  assert.equal(computeFocusedCourseBudgetMs({}),180_000);
  assert.equal(computeFocusedCourseBudgetMs({
    slideCount:Infinity, requiredInteractions:NaN, observedVideoSeconds:-20,
  }),180_000);
  assert.equal(computeFocusedCourseBudgetMs({
    slideCount:5000, requiredInteractions:999, observedVideoSeconds:99999,
  }),3_600_000);
});

test('authored media inventory counts unique video-bearing slides, never answers',()=>{
  assert.equal(countAuthoredVideoSlides(null),0);
  assert.equal(countAuthoredVideoSlides([
    {media:'media/a.mp4',originalContent:{media:[{src:'media/a.mp4'}]}},
    {media:'media/b.webm?source=course'},
    {media:{src:'media/c.mov'}},
    {media:'media/c.png'},
    {media:null},
    {media:['media/d.jpg','media/d.mp4']},
  ]),4);
});

test('50-slide course with 12 actual video lessons gets enough wall-clock budget',()=>{
  // Active Offshore #7 SHA 2ffde6c8... has 12 distinct video-bearing
  // lessons; their video durations alone total 1074.4s. The earlier 20min
  // cap cannot validate real-time playback plus navigation. No skipping.
  assert.equal(computeFocusedCourseBudgetMs({
    slideCount:50,requiredInteractions:0,
    observedVideoSeconds:109.088,authoredVideoSlides:12,
  }),2_850_000);
  assert.equal(computeFocusedCourseBudgetMs({
    slideCount:50,authoredVideoSlides:999999,
  }),3_600_000);
});
