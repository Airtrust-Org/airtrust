import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireFactoryV3VisualState, requireFactoryV3ResumeMatch,
  chooseFactoryV3Navigation,
} from '../staging/f5-factory-v3-visual-witness.mjs';

const visual = Object.freeze({
  contract:'F5_FACTORY_V3_RENDERED_DOM_V1',index:1,total:101,navIndex:1,
  modelLength:101,packageVersion:'MGM_RC4_EDITION_1',
  unitId:'mgm_02',stageVisible:true,unitMatchesModel:true,
  titleMatchesModel:true,interactionRequired:true,
});
const state = (override = {}) => JSON.stringify({
  v:4,p:'MGM_RC4_EDITION_1',a:1,d:[0],s:{},g:[],h:{},
  vs:{},q:{answers:[],passed:false},c:false,...override,
});
test('real Factory V3 screen, counter, navigation and v4 CMI must all agree',()=>{
  assert.deepEqual(requireFactoryV3VisualState(visual,'2/101',state(),{
    expectedPackageVersion:'MGM_RC4_EDITION_1',
  }),{index:1,total:101,unitId:'mgm_02',packageVersion:'MGM_RC4_EDITION_1'});
});
test('rejects stale CMI, changed edition, preview navigation and altered DOM',()=>{
  const bad=[
    [visual,'1/101',state()], [visual,'2/101',state({a:2})],
    [visual,'2/101',state({p:'OTHER_EDITION'})],
    [visual,'2/101',state({v:3})],
    [{...visual,index:2},'2/101',state()],
    [{...visual,navIndex:0},'2/101',state()],
    [{...visual,unitMatchesModel:false},'2/101',state()],
    [{...visual,titleMatchesModel:false},'2/101',state()],
    [{...visual,stageVisible:false},'2/101',state()],
    [{...visual,total:99},'2/101',state()],
    [{...visual,packageVersion:'FOREIGN'},'2/101',state()],
    [visual,'2/101',state({d:[0,101]})],
    [visual,'2/101',state({g:{}})],
    [visual,'2/101',state({s:[]})],
    [visual,'2/101',state({h:[]})],
    [visual,'2/101',state({c:'false'})],
  ];
  for(const [screen,loc,cmi] of bad)assert.throws(
    ()=>requireFactoryV3VisualState(screen,loc,cmi),
    /F5_FACTORY_V3_VISUAL_CMI_INVALID/,
  );
  assert.throws(()=>requireFactoryV3VisualState(visual,'2/101','not-json'),
    /F5_FACTORY_V3_VISUAL_CMI_INVALID/);
  assert.throws(()=>requireFactoryV3VisualState(visual,'2/101',state(),{
    expectedPackageVersion:'WRONG',
  }),/F5_FACTORY_V3_VISUAL_CMI_INVALID/);
});
test('newly advanced slide must differ from previous location and CMI',()=>{
  const before=state({a:0,d:[]});
  assert.deepEqual(requireFactoryV3VisualState(visual,'2/101',state(),{
    previousIndex:0,previousLocation:'1/101',previousSuspend:before,
  }).index,1);
  for(const options of [
    {previousIndex:1,previousLocation:'1/101',previousSuspend:before},
    {previousIndex:0,previousLocation:'2/101',previousSuspend:before},
    {previousIndex:0,previousLocation:'1/101',previousSuspend:state()},
  ])assert.throws(()=>requireFactoryV3VisualState(visual,'2/101',state(),options),
    /F5_FACTORY_V3_VISUAL_CMI_INVALID/);
});
test('fresh browser context must visibly restore the very same authored slide',()=>{
  const initial=requireFactoryV3VisualState(visual,'2/101',state());
  assert.equal(requireFactoryV3ResumeMatch(initial,{...initial}),true);
  for(const changed of [
    {...initial,index:0},{...initial,index:2},{...initial,total:100},
    {...initial,unitId:'OTHER_SLIDE'},{...initial,packageVersion:'NEW_EDITION'},
  ])assert.throws(()=>requireFactoryV3ResumeMatch(initial,changed),
    /F5_FACTORY_V3_RESUME_MISMATCH/);
  assert.throws(()=>requireFactoryV3ResumeMatch({...initial,index:0},initial),
    /F5_FACTORY_V3_RESUME_MISMATCH/);
});
test('do not bypass an authored interaction to advance the course',()=>{
  assert.equal(chooseFactoryV3Navigation({
    nextVisible:true,nextEnabled:true,prevEnabled:true,initialRendered:visual,
  }),'FORWARD');
  assert.equal(chooseFactoryV3Navigation({
    nextVisible:true,nextEnabled:false,prevEnabled:true,initialRendered:visual,
  }),'RESUME_ONLY_AUTHORED_INTERACTION');
  assert.throws(()=>chooseFactoryV3Navigation({
    nextVisible:true,nextEnabled:false,prevEnabled:true,
    initialRendered:{...visual,interactionRequired:false},
  }),/F5_FACTORY_V3_NAVIGATION_UNAVAILABLE/);
  assert.throws(()=>chooseFactoryV3Navigation({
    nextVisible:false,nextEnabled:true,prevEnabled:true,initialRendered:visual,
  }),/F5_FACTORY_V3_NAVIGATION_UNAVAILABLE/);
});
