import {describe,expect,it} from 'vitest';
import {extractPersistedScormResume} from '../../lib/lms-player3/legacy-resume-evidence';
const ids=['dsq_intro','dsq_01','dsq_02','dsq_03','dsq_04'];
const source={ordered_source_unit_ids:ids,expected_package_version:'V0.1.3-RC8.1'};
const resume=(o:unknown)=>extractPersistedScormResume({...source,
  persisted_suspend_data:JSON.stringify(o)});
describe('Player3 resume evidence from original authoring formats',()=>{
  it('reads v3 persisted slide visits but does not certify legacy answers',()=>{
    expect(resume({v:3,p:source.expected_package_version,a:3,d:[0,1,2],
      c:true,q:{assessment:{passed:true,score:100}}})).toEqual({
      classification:'VISITED_UNITS',active_unit_id:'dsq_03',
      visited_unit_ids:['dsq_intro','dsq_01','dsq_02'],
      source_package_version:source.expected_package_version,reason:'SAVED_VISIT_SET',
      grants_assessment_pass:false,grants_completion:false,
    });
  });
  it('does not assume visiting slide 5 means slides 1..4 completed',()=>{
    expect(resume({v:3,p:source.expected_package_version,a:4,d:[3]}))
      .toMatchObject({classification:'VISITED_UNITS',visited_unit_ids:['dsq_03'],
        active_unit_id:'dsq_04'});
  });
  it('supports v2 and v4 variants preserving actual visited IDs',()=>{
    for(const v of [2,4]){
      expect(resume({v,p:source.expected_package_version,a:2,d:['dsq_intro','dsq_01']}))
        .toMatchObject({classification:'VISITED_UNITS',visited_unit_ids:ids.slice(0,2)});
    }
  });
  it('recognizes compact v4 bookmark-only without inferring visits',()=>{
    expect(resume({v:4,p:source.expected_package_version,a:4,x:[],g:[],A:[],c:true}))
      .toMatchObject({classification:'BOOKMARK_ONLY',active_unit_id:'dsq_04',
        visited_unit_ids:[],grants_completion:false});
  });
  it('fails closed on a different package version or unsupported format',()=>{
    expect(resume({v:3,p:'old-version',a:4,d:[0]}).classification)
      .toBe('REVIEW_REQUIRED');
    expect(resume({s:'A10',c:2,v:'bitmap'}).classification).toBe('REVIEW_REQUIRED');
  });
  it('does not accept invalid or duplicated visited indexes',()=>{
    expect(resume({v:3,p:source.expected_package_version,a:4,d:[0,0]}))
      .toMatchObject({classification:'REVIEW_REQUIRED',reason:'DUPLICATE_VISITED_UNIT'});
    expect(resume({v:3,p:source.expected_package_version,a:4,d:[99]}))
      .toMatchObject({classification:'REVIEW_REQUIRED',reason:'INVALID_VISITED_SET'});
  });
  it('rejects corrupt bookmarks and malformed JSON',()=>{
    expect(resume({v:3,p:source.expected_package_version,a:999,d:[]}))
      .toMatchObject({classification:'REVIEW_REQUIRED',reason:'INVALID_BOOKMARK'});
    expect(extractPersistedScormResume({...source,persisted_suspend_data:'{'}))
      .toMatchObject({classification:'REVIEW_REQUIRED',reason:'INVALID_SUSPEND_JSON'});
  });
});
