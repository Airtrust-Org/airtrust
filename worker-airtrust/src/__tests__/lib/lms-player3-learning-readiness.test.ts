import {describe,expect,it} from 'vitest';
import {assessPlayer3JointReadiness} from '../../lib/lms-player3/learning-readiness';
import type {Player3ModuleSession} from '../../services/lms-player3-module-progress-reader';

const edition='a'.repeat(64);
const modules:Player3ModuleSession={
  editionSha256:edition,cycleId:1000,allOfficialStagesPassed:true,
  completionSupported:false,
  stages:[
    {stageId:'exam1',attempts:2,lastScorePct:100,passed:true,nextAttemptNumber:3},
    {stageId:'exam2',attempts:1,lastScorePct:80,passed:true,nextAttemptNumber:2},
  ],
};
const fixture=(override:Record<string,unknown>={})=>assessPlayer3JointReadiness({
  mode:'LEARN',editionSha256:edition,cycleId:1000,
  requiredLessonIds:['intro','safety','conclusion'],
  recordedLessonIds:['intro','safety','conclusion'],
  moduleSession:modules,
  ...override,
});
describe('Player3 joint readiness (never a terminal write)',()=>{
  it('requires all actual content units and official module passes',()=>{
    expect(fixture()).toEqual({
      readyForAtomicTerminalPreflight:true,reason:'READY_FOR_TERMINAL_PREFLIGHT',
      editionSha256:edition,cycleId:1000,totalRequiredLessons:3,
      verifiedLessons:3,officialStageCount:2,officialStagesPassed:2,
      completionSupported:false,
    });
  });
  it('fails closed even with all module exams passed when lesson missing',()=>{
    expect(fixture({recordedLessonIds:['intro','safety']}))
      .toMatchObject({readyForAtomicTerminalPreflight:false,
        reason:'CONTENT_NOT_FINISHED',verifiedLessons:2});
  });
  it('fails with all lessons viewed if any official exam is not passed',()=>{
    const partial={...modules,allOfficialStagesPassed:false,
      stages:[modules.stages[0],{...modules.stages[1],passed:false}]};
    expect(fixture({moduleSession:partial})).toMatchObject({
      reason:'OFFICIAL_STAGES_NOT_PASSED',officialStagesPassed:1,
    });
  });
  it('rejects stale or switched edition and cycle, even for approved modules',()=>{
    expect(fixture({moduleSession:{...modules,editionSha256:'b'.repeat(64)}}))
      .toMatchObject({reason:'EDITION_OR_CYCLE_MISMATCH'});
    expect(fixture({moduleSession:{...modules,cycleId:1001}}))
      .toMatchObject({reason:'EDITION_OR_CYCLE_MISMATCH'});
  });
  it('refuses REVIEW and completion and never creates a certificate',()=>{
    const result=fixture({mode:'REVIEW'});
    expect(result).toMatchObject({reason:'REVIEW_READ_ONLY',
      readyForAtomicTerminalPreflight:false,completionSupported:false});
    expect(result).not.toHaveProperty('certificate');
    expect(result).not.toHaveProperty('status');
  });
  it('recognizes an empty read-only review ledger without treating it as fake certification',()=>{
    // The read-only joint preflight intentionally supplies no module rows for
    // completed/review-mode enrollments; [] must not be treated as a passed exam.
    const noStages={...modules,stages:[],allOfficialStagesPassed:false};
    const review=fixture({mode:'REVIEW',recordedLessonIds:[],moduleSession:noStages});
    expect(review).toMatchObject({
      readyForAtomicTerminalPreflight:false,reason:'REVIEW_READ_ONLY',
      officialStageCount:0,officialStagesPassed:0,completionSupported:false,
    });
    expect(fixture({mode:'LEARN',recordedLessonIds:[],moduleSession:noStages}))
      .toMatchObject({reason:'INVALID_EVIDENCE',readyForAtomicTerminalPreflight:false});
    expect(fixture({mode:'REVIEW',moduleSession:{...noStages,allOfficialStagesPassed:true}}))
      .toMatchObject({reason:'INVALID_EVIDENCE',readyForAtomicTerminalPreflight:false});
    expect(fixture({mode:'REVIEW',moduleSession:{...noStages,cycleId:1001}}))
      .toMatchObject({reason:'EDITION_OR_CYCLE_MISMATCH',readyForAtomicTerminalPreflight:false});
  });
  it('refuses forged, duplicate or unexpected content IDs',()=>{
    for(const recordedLessonIds of [
      ['intro','intro','safety','conclusion'],
      ['intro','safety','another'],
    ])expect(fixture({recordedLessonIds})).toMatchObject({
      reason:'INVALID_EVIDENCE',
    });
    expect(fixture({requiredLessonIds:[]})).toMatchObject({
      reason:'INVALID_EVIDENCE',
    });
  });
  it('rejects a forged stage pass without an official attempt',()=>{
    const modified={...modules,stages:[
      {...modules.stages[0],attempts:0},modules.stages[1],
    ]};
    expect(fixture({moduleSession:modified})).toMatchObject({
      reason:'INVALID_EVIDENCE',
    });
  });
  it('does not trust an inconsistent aggregate allOfficialStagesPassed flag',()=>{
    expect(fixture({moduleSession:{...modules,allOfficialStagesPassed:false}}))
      .toMatchObject({reason:'INVALID_EVIDENCE'});
  });
});
