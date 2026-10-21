/**
 * AirTrust LMS — independent bank editor API (NOT yet mounted).
 *
 * Staging-only default-off route. Mount in index.ts only after Schema V2
 * approval; F4 Player3 owns current index.ts and must not be overwritten.
 * Authorization: JWT, tenant middleware and ADMIN role, then private store.
 * No student endpoint here, no exams runtime, no completion/certificate write.
 */
import {Hono} from 'hono';
import {auth} from '../middleware/auth';
import {requireRole} from '../middleware/rbac';
import {getEmpresaId,getTenantContext} from '../middleware/tenant';
import type {Env} from '../types';
import {QuestionBankError, type QuestionContent} from '../lib/lms-exams/question-bank-domain';
import {
  QuestionStoreError,createAdminQuestionDraft,editAdminQuestionDraft,
  getAdminQuestion,listAdminQuestions,reviewAdminQuestion,
  publishAdminQuestion,forkAdminPublishedQuestion,
} from '../services/lms-exams/question-bank-store';

const routes=new Hono<{Bindings:Env}>();
const MAX_BODY=48*1024;

routes.use('*',async(c,next)=>{
  const flag=(c.env as unknown as Record<string,unknown>)['LMS_EXAM_QUESTION_ADMIN_STAGING'];
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

function positive(value:string):number{
  const n=Number(value);
  if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(n)){
    throw new QuestionStoreError('EXAM_QUESTION_REFERENCE_INVALID');
  }
  return n;
}
function actor(c:Parameters<typeof getEmpresaId>[0],courseId:string){
  const id=Number((c.get as (key:string)=>unknown)('userId'));
  const role=getTenantContext(c).role;
  return {empresaId:getEmpresaId(c),cursoId:positive(courseId),
    userId:id,tenantRole:role};
}
async function parseBoundedJson(c: {req:{raw:Request}}):Promise<Record<string,unknown>>{
  const type=c.req.raw.headers.get('content-type')||'';
  if(!/^application\/json(?:;|$)/i.test(type)) {
    throw new QuestionStoreError('EXAM_JSON_CONTENT_TYPE_REQUIRED');
  }
  const declared=Number(c.req.raw.headers.get('content-length')||0);
  if(Number.isFinite(declared) && declared>MAX_BODY){
    throw new QuestionStoreError('EXAM_JSON_BODY_TOO_LARGE');
  }
  const reader=c.req.raw.body?.getReader();
  if(!reader)throw new QuestionStoreError('EXAM_JSON_REQUIRED');
  const chunks:Uint8Array[]=[];
  let bytes=0;
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BODY){
        await reader.cancel();
        throw new QuestionStoreError('EXAM_JSON_BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const joined=new Uint8Array(bytes);
  let offset=0;
  for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
  let data:unknown;
  try{data=JSON.parse(new TextDecoder().decode(joined));}
  catch{throw new QuestionStoreError('EXAM_JSON_INVALID');}
  if(!data||typeof data!=='object'||Array.isArray(data)){
    throw new QuestionStoreError('EXAM_JSON_INVALID');
  }
  return data as Record<string,unknown>;
}
function exact(body:Record<string,unknown>,keys:readonly string[]):void{
  if(Object.keys(body).sort().join('|')!==[...keys].sort().join('|')){
    throw new QuestionStoreError('EXAM_JSON_FIELDS_INVALID');
  }
}
function getVersion(c:{req:{param:(key:string)=>string}}){
  return positive(c.req.param('revision'));
}
routes.onError((error,c)=>{
  if(error instanceof QuestionStoreError||error instanceof QuestionBankError){
    const code=error.code;
    const status=code.includes('NOT_FOUND')?404:
      code.includes('RBAC')||code.includes('TENANT')?403:
      code.includes('CONCURRENT')||code.includes('IMMUTABLE')||
      code.includes('NOT_EDITABLE')||code.includes('REQUIRED')?409:422;
    // No SQL, answer keys, payload or stack traces returned to clients.
    return c.json({success:false,code},status);
  }
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
export default routes;
