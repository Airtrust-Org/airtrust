import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({detectMismatch:vi.fn(),readProposal:vi.fn(),readHandoff:vi.fn()}));
vi.mock('../../services/lms-edition-mismatch',()=>({detectLmsEditionMismatch:mocks.detectMismatch}));
vi.mock('../../services/lms-scorm-active-resume-readonly',()=>({
  readScormActiveResumeProposal:mocks.readProposal,
}));
vi.mock('../../services/lms-scorm-active-handoff-read',()=>({readActiveScormHandoff:mocks.readHandoff}));

import {readLmsScormEditionState} from '../../services/lms-scorm-edition-read';

describe('readLmsScormEditionState provenance scope',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.detectMismatch.mockResolvedValue({required:true});
    mocks.readProposal.mockResolvedValue({status:'SUGGESTED_ANCHOR'});
    mocks.readHandoff.mockResolvedValue(null);
  });

  it('passes the exact enrollment and active cycle to the read-only resume reader',async()=>{
    const db={} as D1Database,bucket={} as R2Bucket;
    await readLmsScormEditionState({db,bucket,empresaId:6,matriculaId:100,
      matricula:{curso_id:119,tipo_conteudo:'scorm',status:'EM_ANDAMENTO',
        scorm_package_r2_prefix:'lms/scorm/6/119/active/',active_lms_cycle_id:812,
        active_lms_cycle_started_at:'2026-09-01T00:00:00Z'},
      progressoScorm:{cmi_json:'{"cmi.location":"2/3"}'},handoffEnabled:true});
    expect(mocks.readProposal).toHaveBeenCalledWith(expect.objectContaining({
      empresaId:6,cursoId:119,matriculaId:100,cycleId:812,
      activePrefix:'lms/scorm/6/119/active/',handoffHistoryEnabled:true,
    }));
  });

  it('does not propose resume when no current cycle is present',async()=>{
    const db={} as D1Database,bucket={} as R2Bucket;
    await readLmsScormEditionState({db,bucket,empresaId:6,matriculaId:100,
      matricula:{curso_id:119,tipo_conteudo:'scorm',status:'EM_ANDAMENTO',
        scorm_package_r2_prefix:'lms/scorm/6/119/active/'},
      progressoScorm:{cmi_json:'{"cmi.location":"2/3"}'},handoffEnabled:true});
    expect(mocks.readProposal).not.toHaveBeenCalled();
    expect(mocks.readHandoff).toHaveBeenCalledWith(expect.objectContaining({cycleId:null}));
  });
});
