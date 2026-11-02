/**
 * AirTrust LMS — independent bank editor API (default-off).
 *
 * Mounted at /api/lms/exams/admin but default-off: every request answers 503
 * unless ENVIRONMENT is staging and the review flag is set. Production stays
 * closed until the Schema V2 change is applied and the gate is revisited.
 * Authorization: JWT, tenant middleware and ADMIN role, then private store.
 * No student endpoint here, no exams runtime, no completion/certificate write.
 */
import {Hono} from 'hono';
import {auth} from '../middleware/auth';
import {requireRole} from '../middleware/rbac';
import {getEmpresaId,getTenantContext} from '../middleware/tenant';
import type {Env} from '../types';
import {type ExamPlan, type QuestionContent} from '../lib/lms-exams/question-bank-domain';
import {
  QuestionStoreError,createAdminQuestionDraft,editAdminQuestionDraft,
  getAdminQuestion,listAdminQuestions,reviewAdminQuestion,
  publishAdminQuestion,forkAdminPublishedQuestion,
} from '../services/lms-exams/question-bank-store';
import {bindExamToEdition,publishExamPlan,type ExamAdminActor} from '../services/lms-exams/exam-attempt-store';
import {exact,examErrorCode,examHttpStatus,parseBoundedJson,positive} from './lms-exam-route-helpers';

const routes=new Hono<{Bindings:Env}>();

routes.use('*',async(c,next)=>{
  const flag=Reflect.get(c.env, 'LMS_EXAM_QUESTION_ADMIN_STAGING');
  if(c.env.ENVIRONMENT!=='staging' || flag!=='REVIEWED_SCHEMA_ONLY'){
    return c.json({success:false,code:'QUESTION_BANK_NOT_ACTIVATED'},503);
  }
  await next();
});
routes.use('*',auth());
routes.use('*',requireRole('admin'));
routes.use('*',async(c,next)=>{
  await next();
  c.header('Cache-Control','no-store, private');
  c.header('Pragma','no-cache');
});

function actor(c:Parameters<typeof getEmpresaId>[0],courseId:string){
  const id=Number((c.get as (key:string)=>unknown)('userId'));
  const role=getTenantContext(c).role;
  return {empresaId:getEmpresaId(c),cursoId:positive(courseId),
    userId:id,tenantRole:role};
}
function getVersion(c:{req:{param:(key:string)=>string}}){
  return positive(c.req.param('revision'));
}
routes.onError((error,c)=>{
  const code=examErrorCode(error);
  if(code)return c.json({success:false,code},examHttpStatus(code));
  throw error;
});
routes.get('/cursos/:cursoId/questoes',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const items=await listAdminQuestions(c.env.DB,a);
  return c.json({success:true,data:items});
});
routes.post('/cursos/:cursoId/questoes',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const body=await parseBoundedJson(c);
  exact(body,['questionId','content']);
  const data=await createAdminQuestionDraft(c.env.DB,a,
    body.questionId as string,body.content as QuestionContent);
  return c.json({success:true,data},201);
});
routes.get('/cursos/:cursoId/questoes/:questionId/versoes/:revision',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const data=await getAdminQuestion(c.env.DB,a,c.req.param('questionId'),getVersion(c));
  return c.json({success:true,data});
});
routes.patch('/cursos/:cursoId/questoes/:questionId/versoes/:revision',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const body=await parseBoundedJson(c);
  exact(body,['expectedEditVersion','changes']);
  const data=await editAdminQuestionDraft(c.env.DB,a,c.req.param('questionId'),
    getVersion(c),Number(body.expectedEditVersion),body.changes as Partial<QuestionContent>);
  return c.json({success:true,data});
});
routes.post('/cursos/:cursoId/questoes/:questionId/versoes/:revision/revisar',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const body=await parseBoundedJson(c);
  exact(body,['expectedEditVersion']);
  const data=await reviewAdminQuestion(c.env.DB,a,c.req.param('questionId'),
    getVersion(c),Number(body.expectedEditVersion));
  return c.json({success:true,data});
});
routes.post('/cursos/:cursoId/questoes/:questionId/versoes/:revision/publicar',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const body=await parseBoundedJson(c);
  exact(body,['expectedEditVersion']);
  const data=await publishAdminQuestion(c.env.DB,a,c.req.param('questionId'),
    getVersion(c),Number(body.expectedEditVersion));
  return c.json({success:true,data});
});
routes.post('/cursos/:cursoId/questoes/:questionId/versoes/:revision/nova-revisao',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const data=await forkAdminPublishedQuestion(c.env.DB,a,
    c.req.param('questionId'),getVersion(c));
  return c.json({success:true,data},201);
});
function examActor(c:Parameters<typeof getEmpresaId>[0]):ExamAdminActor{
  return {empresaId:getEmpresaId(c),userId:Number((c.get as (key:string)=>unknown)('userId')),
    tenantRole:getTenantContext(c).role};
}
// Plans: published once, immutable. The body carries references to published
// questions only (no answer key); the Worker re-validates every reference.
routes.post('/cursos/:cursoId/provas',async c=>{
  const cursoId=positive(c.req.param('cursoId'));
  const body=await parseBoundedJson(c);
  exact(body,['plan']);
  const plan=body.plan as ExamPlan;
  if(!plan||plan.courseId!==cursoId){
    throw new QuestionStoreError('EXAM_PLAN_INVALID_COURSE');
  }
  const data=await publishExamPlan(c.env.DB,examActor(c),plan);
  return c.json({success:true,data},201);
});
routes.post('/cursos/:cursoId/provas/:examId/versoes/:version/vinculo',async c=>{
  const body=await parseBoundedJson(c);
  exact(body,['packageSha256','statutoryAssessmentRequired','approvalNote']);
  const data=await bindExamToEdition(c.env.DB,examActor(c),{
    cursoId:positive(c.req.param('cursoId')),examId:c.req.param('examId'),
    version:positive(c.req.param('version')),
    packageSha256:body.packageSha256 as string,
    statutoryAssessmentRequired:body.statutoryAssessmentRequired as boolean,
    approvalNote:body.approvalNote as string,
  });
  return c.json({success:true,data},201);
});
export default routes;
