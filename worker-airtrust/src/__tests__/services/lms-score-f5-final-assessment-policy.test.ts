import {describe,expect,it} from 'vitest';
import {decideScoreF5Finalization,type ScoreF5FinalizationInput} from '../../services/lms-score-f5-final-assessment-policy';

const ok: ScoreF5FinalizationInput={
  engineId:'AIRTRUST_UNIFIED_SCORE_SCORM12_V1',
  packageAssessment:'NONE',pinnedPolicy:'NO_FINAL_EXAM',
  activeEditionMatchesCycle:true,studyReceiptVerified:true,
  explicitStudyEndVerified:true,requiredUnitsVerified:true,
  statutoryAssessmentRequired:false,satisfactoryAssessmentVerified:false,
  externalExamPassed:false,
};
describe('Score F5 final-exam requirement is versioned and independent from study',()=>{
  it('no final exam: verified study may reach canonical completion without exam score',()=>{
    expect(decideScoreF5Finalization(ok)).toMatchObject({
      code:'READY_FOR_CANONICAL_COMPLETION',canCallCanonicalCompletion:true,
      examRequired:false,createsQualification:false,
    });
  });
  it('NR-20 candidate EXTERNAL cannot silently be treated as no-exam',()=>{
    expect(decideScoreF5Finalization({...ok,packageAssessment:'EXTERNAL'}))
      .toMatchObject({code:'PACKAGE_POLICY_MISMATCH',canCallCanonicalCompletion:false});
  });
  it('legal evaluation requirement survives absence of external final examination',()=>{
    expect(decideScoreF5Finalization({...ok,statutoryAssessmentRequired:true}))
      .toMatchObject({code:'SATISFACTORY_ASSESSMENT_REQUIRED',canCallCanonicalCompletion:false});
    expect(decideScoreF5Finalization({...ok,statutoryAssessmentRequired:true,
      satisfactoryAssessmentVerified:true})).toMatchObject({
      code:'READY_FOR_CANONICAL_COMPLETION',
    });
  });
  it('course not reviewed for regulatory assessment stays fail-closed',()=>{
    expect(decideScoreF5Finalization({...ok,statutoryAssessmentRequired:null}))
      .toMatchObject({code:'REGULATORY_REVIEW_REQUIRED',canCallCanonicalCompletion:false});
  });
  it('does not transfer completion from old package even if study was finished',()=>{
    expect(decideScoreF5Finalization({...ok,activeEditionMatchesCycle:false}))
      .toMatchObject({code:'EDITION_MISMATCH',canCallCanonicalCompletion:false});
  });
  it('requires explicit Worker study end and verified unit coverage',()=>{
    for(const k of ['studyReceiptVerified','explicitStudyEndVerified','requiredUnitsVerified'] as const){
      expect(decideScoreF5Finalization({...ok,[k]:false}))
        .toMatchObject({code:'STUDY_EVIDENCE_PENDING',canCallCanonicalCompletion:false});
    }
  });
  it('future activation demands external exam only on pinned eligible edition',()=>{
    const future={...ok,packageAssessment:'EXTERNAL' as const,pinnedPolicy:'EXTERNAL_REQUIRED' as const};
    expect(decideScoreF5Finalization(future))
      .toMatchObject({code:'EXTERNAL_EXAM_PENDING',canCallCanonicalCompletion:false,examRequired:true});
    expect(decideScoreF5Finalization({...future,externalExamPassed:true}))
      .toMatchObject({code:'READY_FOR_CANONICAL_COMPLETION',canCallCanonicalCompletion:true});
  });
  it('missing policy refuses to infer no-exam from global rollout setting',()=>{
    expect(decideScoreF5Finalization({...ok,pinnedPolicy:null}))
      .toMatchObject({code:'POLICY_NOT_PINNED',canCallCanonicalCompletion:false});
  });
});
