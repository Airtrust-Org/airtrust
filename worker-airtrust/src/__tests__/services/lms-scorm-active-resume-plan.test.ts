import { describe, expect, it } from 'vitest';
import { planScormActiveResume } from '../../services/lms-scorm-active-resume-plan';

describe('SCORM active-edition resume (navigation is not certification)', () => {
  it('maps CFIT 32/37 to same stable ID in a 43-unit ACTIVE edition', () => {
    const old = Array.from({length: 37}, (_, i) => 'cfit-'+(i+1));
    const active = [...old.slice(0,12), 'new-threat', ...old.slice(12,29), 'new-warning', ...old.slice(29), 'new-summary', 'new-review', 'new-check', 'new-close'];
    const plan = planScormActiveResume({
      activeSlideIds:active, previousSlideIds:old,
      previousVisitedIds:old.slice(0,32), previousCursorId:'cfit-32',
      previousPosition:32, previousTotal:37,
    });
    expect(plan).toMatchObject({
      status:'VERIFIED_ANCHOR', targetSlideId:'cfit-32', targetPosition:34,
      reviewRequired:true, canTransferScore:false, canMarkComplete:false,
    });
    expect(plan.pendingUnitIds).toContain('new-threat');
  });

  it('CFIT 37/37 is not evidence of a passed assessment or completion', () => {
    const old=['intro','review','final'];
    const result=planScormActiveResume({
      activeSlideIds:['intro','revision','review','new-assessment','final'],
      previousSlideIds:old, previousVisitedIds:old,
      previousCursorId:'final', previousPosition:3, previousTotal:3,
    });
    expect(result.targetSlideId).toBe('final');
    expect(result.pendingUnitIds).toContain('new-assessment');
    expect(result.canMarkComplete).toBe(false);
    expect(result.canTransferScore).toBe(false);
  });

  it('Code of Ethics 2/61 can navigate a 72-unit active package with no comparable IDs, but receives no credit', () => {
    const active=Array.from({length:72},(_,i)=>'new-'+(i+1));
    const result=planScormActiveResume({
      activeSlideIds:active, previousPosition:2, previousTotal:61,
    });
    expect(result.status).toBe('SUGGESTED_ANCHOR');
    expect(result.targetPosition).toBe(2);
    expect(result.verifiedUnitIds).toEqual([]);
    expect(result.pendingUnitIds).toHaveLength(72);
    expect(result.canMarkComplete).toBe(false);
  });

  it('requires an authenticated reviewed crosswalk to map renamed units', () => {
    const result=planScormActiveResume({
      activeSlideIds:['new-start','new-training','new-end'],
      previousSlideIds:['old-start','old-training','old-end'],
      previousVisitedIds:['old-start','old-training'],
      previousCursorId:'old-training',
      reviewedEquivalence:{'old-start':'new-start','old-training':'new-training'},
    });
    expect(result).toMatchObject({status:'VERIFIED_ANCHOR',targetPosition:2});
    expect(result.verifiedUnitIds).toEqual(['new-start','new-training']);
  });

  it('does not trust an ambiguous crosswalk mapping two old slides to one new slide', () => {
    const result=planScormActiveResume({
      activeSlideIds:['new1','new2'], previousSlideIds:['old1','old2'],
      previousVisitedIds:['old1','old2'], previousCursorId:'old2',
      previousPosition:2, previousTotal:2,
      reviewedEquivalence:{old1:'new1',old2:'new1'},
    });
    expect(result.status).toBe('SUGGESTED_ANCHOR');
    expect(result.verifiedUnitIds).toEqual([]);
  });

  it('rejects malformed active manifests with duplicate IDs', () => {
    expect(planScormActiveResume({activeSlideIds:['x','x']}))
      .toMatchObject({status:'INVALID_ACTIVE_PACKAGE',canMarkComplete:false});
  });

  it('prefers last matched anchor before removed old cursor', () => {
    const result=planScormActiveResume({
      activeSlideIds:['a','b','d'],previousSlideIds:['a','b','c','d'],
      previousVisitedIds:['a','b','c'],previousCursorId:'c',
      previousPosition:3,previousTotal:4,
    });
    expect(result).toMatchObject({status:'VERIFIED_ANCHOR',targetSlideId:'b',targetPosition:2});
  });

  it('begins at active start without usable old evidence', () => {
    expect(planScormActiveResume({activeSlideIds:['one','two']}))
      .toMatchObject({status:'START_ACTIVE',targetPosition:1,reviewRequired:true});
  });
});
