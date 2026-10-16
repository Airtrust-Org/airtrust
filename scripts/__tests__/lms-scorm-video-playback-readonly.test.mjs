import assert from 'node:assert/strict';
import test from 'node:test';
import {readVisibleVideo,startRealVisibleVideo}
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
