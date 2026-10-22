import {describe,expect,it} from 'vitest';
import {isScormHandoffSessionCurrent} from '../../services/lms-scorm-handoff-session';

describe('SCORM handoff asset-session binding',()=>{
  it('accepts a legacy session before the cycle has a handoff receipt',()=>{
    expect(isScormHandoffSessionCurrent({claimedCycleId:0,claimedHandoffId:0,
      activeCycleId:17,activeHandoffId:null})).toBe(true);
  });
  it('rejects old sessions once the current cycle has an immutable handoff receipt',()=>{
    expect(isScormHandoffSessionCurrent({claimedCycleId:17,claimedHandoffId:0,
      activeCycleId:17,activeHandoffId:200})).toBe(false);
    expect(isScormHandoffSessionCurrent({claimedCycleId:17,claimedHandoffId:199,
      activeCycleId:17,activeHandoffId:200})).toBe(false);
  });
  it('accepts only the session bound to the current receipt and cycle',()=>{
    expect(isScormHandoffSessionCurrent({claimedCycleId:17,claimedHandoffId:200,
      activeCycleId:17,activeHandoffId:200})).toBe(true);
    expect(isScormHandoffSessionCurrent({claimedCycleId:16,claimedHandoffId:200,
      activeCycleId:17,activeHandoffId:200})).toBe(false);
  });
});
