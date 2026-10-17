import {beforeEach,describe,expect,it,vi} from 'vitest';
import {loadNativePrivateCourse} from '../../services/lms-native-content-loader';
import {readNativeLearnerSession} from '../../services/lms-native-readiness-repository';
import {readPlayer3ModuleSession} from '../../services/lms-player3-module-progress-reader';
import {readPlayer3JointPreflight} from '../../services/lms-player3-joint-preflight';
import type {Env} from '../../types';

vi.mock('../../services/lms-native-content-loader',()=>({
  loadNativePrivateCourse:vi.fn(),
}));
vi.mock('../../services/lms-native-readiness-repository',()=>({
  readNativeLearnerSession:vi.fn(),
}));
vi.mock('../../services/lms-player3-module-progress-reader',()=>({
  readPlayer3ModuleSession:vi.fn(),
}));
const SHA='a'.repeat(64);
const context={
  env:{ENVIRONMENT:'staging'} as Env,
  db:{} as D1Database,
  bucket:{} as R2Bucket,
  empresaId:6,matriculaId:911,actorUserId:33,
};
const session={
  editionSha256:SHA,cycleId:301,completionSupported:false,
  allOfficialStagesPassed:true,
  stages:[
    {stageId:'exam1',attempts:1,passed:true,lastScorePct:100,nextAttemptNumber:2},
    {stageId:'exam2',attempts:2,passed:true,lastScorePct:80,nextAttemptNumber:3},
  ],
};
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(loadNativePrivateCourse).mockResolvedValue({
    mode:'LEARN',editionHash:SHA,cursoId:80,cicloId:301,
    artifact:{units:[
      {id:'welcome',kind:'lesson'},{id:'introQuiz',kind:'assessment'},
      {id:'procedure',kind:'lesson'},
    ]},
  } as never);
  vi.mocked(readNativeLearnerSession).mockResolvedValue({
    summary:{
      editionHash:SHA,cicloId:301,mode:'LEARN',
      seenLessonIds:['welcome','procedure'],nextSequence:3,
    },readiness:{readyForCanonicalCompletion:false},
  } as never);
  vi.mocked(readPlayer3ModuleSession).mockResolvedValue(session as never);
});
describe('Player3 Worker content+official-stage joint diagnostic',()=>{
  it('rechecks pinned identity from actual server content and module receipts',async()=>{
    const result=await readPlayer3JointPreflight(context);
    expect(result).toMatchObject({
      readyForAtomicTerminalPreflight:true,reason:'READY_FOR_TERMINAL_PREFLIGHT',
      totalRequiredLessons:2,verifiedLessons:2,officialStageCount:2,
      officialStagesPassed:2,completionSupported:false,
    });
    expect(readNativeLearnerSession).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId:33,scope:{
        empresaId:6,matriculaId:911,cursoId:80,cicloId:301,artifactHash:SHA,
      },
    }));
    expect(JSON.stringify(result)).not.toContain('answer');
    expect(JSON.stringify(result)).not.toContain('certificate');
  });
  it('does not declare readiness when viewing is incomplete although exams passed',async()=>{
    vi.mocked(readNativeLearnerSession).mockResolvedValueOnce({
      summary:{mode:'LEARN',seenLessonIds:['welcome']},readiness:{},
    } as never);
    expect(await readPlayer3JointPreflight(context)).toMatchObject({
      reason:'CONTENT_NOT_FINISHED',readyForAtomicTerminalPreflight:false,
    });
  });
  it('rejects a changed edition or cycle between two authenticated reads',async()=>{
    vi.mocked(readPlayer3ModuleSession).mockResolvedValueOnce({
      ...session,cycleId:302,
    } as never);
    expect(await readPlayer3JointPreflight(context)).toMatchObject({
      reason:'EDITION_OR_CYCLE_MISMATCH',readyForAtomicTerminalPreflight:false,
    });
  });
  it('review mode cannot advance and does not query modular exam receipts',async()=>{
    vi.mocked(loadNativePrivateCourse).mockResolvedValueOnce({
      mode:'REVIEW',editionHash:SHA,cursoId:80,cicloId:301,
      artifact:{units:[{id:'welcome',kind:'lesson'}]},
    } as never);
    const result=await readPlayer3JointPreflight(context);
    expect(result.readyForAtomicTerminalPreflight).toBe(false);
    expect(readNativeLearnerSession).not.toHaveBeenCalled();
    expect(readPlayer3ModuleSession).not.toHaveBeenCalled();
  });
});
