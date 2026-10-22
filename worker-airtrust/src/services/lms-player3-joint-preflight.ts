/**
 * Player3 authenticated READ-ONLY content+exam evidence preflight.
 * A 'ready' result is NOT an enrollment completion authorization:
 * a governed, transaction-local guard and HTML5 visual E2E are still required.
 */
import type {Env} from '../types';
import {loadNativePrivateCourse} from './lms-native-content-loader';
import {readNativeLearnerSession} from './lms-native-readiness-repository';
import {readPlayer3ModuleSession} from './lms-player3-module-progress-reader';
import {assessPlayer3JointReadiness,type Player3JointReadiness}
  from '../lib/lms-player3/learning-readiness';

export async function readPlayer3JointPreflight(input:{
  env:Env;db:D1Database;bucket:R2Bucket;
  empresaId:number;matriculaId:number;actorUserId:number;
}):Promise<Player3JointReadiness>{
  const course=await loadNativePrivateCourse(input);
  if(course.mode!=='LEARN'){
    // Reject review-mode before fetching any learner write evidence.
    return assessPlayer3JointReadiness({
      mode:'REVIEW',
      editionSha256:course.editionHash,cycleId:course.cicloId,
      requiredLessonIds:course.artifact.units.filter(x=>x.kind==='lesson').map(x=>x.id),
      recordedLessonIds:[],
      moduleSession:{
        editionSha256:course.editionHash,cycleId:course.cicloId,
        allOfficialStagesPassed:false,completionSupported:false,stages:[],
      },
    });
  }
  const scope={
    empresaId:input.empresaId,matriculaId:input.matriculaId,
    cursoId:course.cursoId,cicloId:course.cicloId,
    artifactHash:course.editionHash,
  };
  const [lesson,modular]=await Promise.all([
    readNativeLearnerSession({
      env:input.env,db:input.db,actorUserId:input.actorUserId,
      scope,artifact:course.artifact,
    }),
    readPlayer3ModuleSession(input),
  ]);
  const required=course.artifact.units.filter(x=>x.kind==='lesson').map(x=>x.id);
  return assessPlayer3JointReadiness({
    mode:lesson.summary.mode,
    editionSha256:course.editionHash,cycleId:course.cicloId,
    requiredLessonIds:required,
    recordedLessonIds:lesson.summary.seenLessonIds,
    moduleSession:modular,
  });
}
