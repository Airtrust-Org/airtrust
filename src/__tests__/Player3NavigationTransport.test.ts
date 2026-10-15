import {describe,expect,it,vi} from 'vitest';
import {makePlayer3NavigationRecorder,validNavigationScope}
  from '@/react-app/pages/lms/player3/Player3NavigationTransport';

const sha='a'.repeat(64);
const scope={
  matriculaId:911,empresaId:6,cicloId:333,editionSha256:sha,
  nextUnitId:'unit22',checkpointUnitIds:['unit21','unit22'],
  lastVisitedUnitId:'unit21',
};
const payload=(data:unknown,status=200)=>new Response(JSON.stringify({success:true,data}),{
  status,headers:{'content-type':'application/json'},
});
const before={
  matricula_id:911,ciclo_id:333,edition_sha256:sha,mode:'LEARN',
  next_sequence:2,seen_lesson_ids:['unit21'],last_visited_unit_id:'unit21',
};
const after={...before,next_sequence:3,
  seen_lesson_ids:['unit21','unit22'],last_visited_unit_id:'unit22'};
const applied={
  state:'APPLIED',committed_sequence:2,edition_sha256:sha,completion_supported:false,
};
describe('Player3 authenticated navigation checkpoint, never certification',()=>{
  it('rejects untrusted identifiers, duplicate and alien unit allowlists',()=>{
    expect(validNavigationScope(scope)).toBe(true);
    expect(validNavigationScope({...scope,checkpointUnitIds:['unit21','unit21']})).toBe(false);
    expect(validNavigationScope({...scope,lastVisitedUnitId:'foreign'})).toBe(false);
    expect(validNavigationScope({...scope,nextUnitId:'foreign'})).toBe(false);
  });
  it('uses only GET session → POST checkpoint → GET session, preserving scope',async()=>{
    const req=vi.fn().mockResolvedValueOnce(payload(before))
      .mockResolvedValueOnce(payload(applied,201))
      .mockResolvedValueOnce(payload(after));
    const recorder=makePlayer3NavigationRecorder(scope,req,'/api');
    expect(await recorder('unit22')).toBe(true);
    expect(req.mock.calls.map(x=>x[1].method)).toEqual(['GET','POST','GET']);
    expect(req.mock.calls[1][0]).toBe('/api/lms/native/matriculas/911/checkpoints');
    const posted=JSON.parse(req.mock.calls[1][1].body as string);
    expect(Object.keys(posted).sort()).toEqual(['eventId','sequence','unitId']);
    expect(posted.sequence).toBe(2);
    expect(posted.unitId).toBe('unit22');
    expect(posted.eventId).toMatch(/^p3v-[a-f0-9]{32}$/);
    expect(posted.score_pct).toBeUndefined();
    expect(posted.completion).toBeUndefined();
  });
  it('does not write the same last visited unit or an unapproved stage',async()=>{
    const req=vi.fn().mockResolvedValue(payload(before));
    const recorder=makePlayer3NavigationRecorder(scope,req,'/api');
    expect(await recorder('unknown')).toBe(false);
    expect(await recorder('unit21')).toBe(true);
    expect(req).toHaveBeenCalledTimes(1);
    expect(req.mock.calls[0][1].method).toBe('GET');
  });
  it('revisiting any committed lesson cannot create a duplicate event',async()=>{
    const req=vi.fn().mockResolvedValue(payload({
      ...after,last_visited_unit_id:'unit22',
    }));
    const recorder=makePlayer3NavigationRecorder(scope,req,'/api');
    expect(await recorder('unit21')).toBe(true);
    expect(req.mock.calls.map(x=>x[1].method)).toEqual(['GET']);
  });
  it('rejects skipping to a later allowlisted unit without writing evidence',async()=>{
    const req=vi.fn().mockResolvedValue(payload(before));
    const recorder=makePlayer3NavigationRecorder({
      ...scope,checkpointUnitIds:['unit21','unit22','unit23'],
    },req,'/api');
    await expect(recorder('unit23')).rejects.toThrow('OUT_OF_ORDER');
    expect(req.mock.calls.map(x=>x[1].method)).toEqual(['GET']);
    await expect(recorder('unit22')).rejects.toThrow('REOPEN_TO_RECONCILE');
  });
  it('lost POST response locks the session and never repeats the evidence write',async()=>{
    const req=vi.fn().mockResolvedValueOnce(payload(before))
      .mockRejectedValueOnce(new Error('response dropped after commit'));
    const recorder=makePlayer3NavigationRecorder(scope,req,'/api');
    await expect(recorder('unit22')).rejects.toThrow('response dropped');
    await expect(recorder('unit22')).rejects.toThrow('REOPEN_TO_RECONCILE');
    expect(req).toHaveBeenCalledTimes(2);
  });
  it('requires exact cycle/edition and readback sequence, never infers success',async()=>{
    const mismatch=vi.fn().mockResolvedValue(payload({...before,ciclo_id:777}));
    await expect(makePlayer3NavigationRecorder(scope,mismatch,'/api')('unit22'))
      .rejects.toThrow('LEDGER_SCOPE_CONFLICT');
    const stale=vi.fn().mockResolvedValueOnce(payload(before))
      .mockResolvedValueOnce(payload(applied,201))
      .mockResolvedValueOnce(payload(before));
    await expect(makePlayer3NavigationRecorder(scope,stale,'/api')('unit22'))
      .rejects.toThrow('RECHECK_FAILED');
    expect(stale).toHaveBeenCalledTimes(3);
  });
});
