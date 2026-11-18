/**
 * AirTrust LMS — independent bank editor API (default-off).
 *
 * Mounted at /api/lms/exams/admin but default-off: every request answers 503 unless the environment
 * is authorized, the production tenant is explicitly allowlisted, and
 * the Schema V2 0571/0572 tables are present.
 * Authorization: JWT, tenant middleware and ADMIN role, then private store.
 * No student endpoint here, no exams runtime, no completion/certificate write.
 */
import {Hono} from 'hono';
import {auth} from '../middleware/auth';
import {requireRole} from '../middleware/rbac';
import {getEmpresaId,getTenantContext} from '../middleware/tenant';
import type {Env} from '../types';
import {hasLmsExamSchema,isLmsExamSurfaceEnabled} from '../lib/lms-exams/lms-exam-activation';
import {readActiveCompletionManifest} from '../services/lms-completion-manifest-evidence';
import {type ExamPlan, type QuestionContent} from '../lib/lms-exams/question-bank-domain';
import {
  QuestionStoreError,createAdminQuestionDraft,editAdminQuestionDraft,
  getAdminQuestion,listAdminQuestions,listPublishedExamQuestions,reviewAdminQuestion,
  publishAdminQuestion,forkAdminPublishedQuestion,
} from '../services/lms-exams/question-bank-store';
import {bindExamToEdition,publishExamPlan,type ExamAdminActor} from '../services/lms-exams/exam-attempt-store';
import {exact,examErrorCode,examHttpStatus,parseBoundedJson,positive} from './lms-exam-route-helpers';

const routes=new Hono<{Bindings:Env}>();

routes.use('*',auth());
routes.use('*',async(c,next)=>{
  if(!isLmsExamSurfaceEnabled(c.env,'admin',getEmpresaId(c))){
    return c.json({success:false,code:'QUESTION_BANK_NOT_ACTIVATED'},503);
  }
  if(c.env.ENVIRONMENT==='production' && !(await hasLmsExamSchema(c.env.DB))){
    return c.json({success:false,code:'EXAM_SCHEMA_NOT_READY'},503);
  }
  await next();
});
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

/** Display-only grade derived from immutable recorded evidence. A pass verdict
 * still belongs exclusively to the attempt writer. */
function scoreForReport(planText:string|null,resultText:string|null):number|null{
  if(!planText||!resultText)return null;
  try{
    const plan=JSON.parse(planText) as {sections?:{moduleId?:string;questions?:unknown[]}[]};
    const result=JSON.parse(resultText) as {
      sections?:{moduleId?:string;correct?:number;total?:number;scorePct?:number}[]
    };
    if(!Array.isArray(plan.sections)||!plan.sections.length||!Array.isArray(result.sections))return null;
    let exactCorrect=0,weighted=0,total=0,useExact=true;
    const seen=new Set<string>();
    for(const section of plan.sections){
      if(!section.moduleId||seen.has(section.moduleId)||!Array.isArray(section.questions)||
          section.questions.length===0)return null;
      seen.add(section.moduleId);
      const grade=result.sections.find(r=>r.moduleId===section.moduleId);
      if(!grade)return null;
      const size=section.questions.length;
      total+=size;
      if(Number.isInteger(grade.correct)&&grade.total===size&&
          grade.correct!>=0&&grade.correct!<=size){
        exactCorrect+=grade.correct!;
      }else{useExact=false;}
      if(!Number.isFinite(grade.scorePct)||grade.scorePct!<0||grade.scorePct!>100)return null;
      weighted+=grade.scorePct!*size;
    }
    if(seen.size!==result.sections.length||total===0)return null;
    const score=useExact?100*exactCorrect/total:weighted/total;
    return Math.round(score*100)/100;
  }catch{return null;}
}

/** Paged assessment results, never answer keys. Auth/ADMIN/tenant is checked above. */
routes.get('/resultados',async c=>{
  const pageRaw=c.req.query('page')||'1',limitRaw=c.req.query('limit')||'25';
  const courseRaw=c.req.query('cursoId')||'';
  const resultFilter=c.req.query('resultado')||'todos';
  const search=(c.req.query('busca')||'').trim();
  if(!/^[1-9][0-9]{0,3}$/.test(pageRaw)||Number(pageRaw)>1000||
      !/^[1-9][0-9]{0,2}$/.test(limitRaw)||Number(limitRaw)>100||
      (courseRaw!==''&&!/^[1-9][0-9]{0,8}$/.test(courseRaw))||
      !['todos','aprovado','reprovado','andamento'].includes(resultFilter)||
      search.length>80||/[\u0000-\u001f\u007f]/.test(search)){
    throw new QuestionStoreError('EXAM_REPORT_FILTER_INVALID');
  }
  const page=Number(pageRaw),limit=Number(limitRaw),tenant=getEmpresaId(c);
  const conditions=['a.empresa_id=?'];
  const params:(string|number)[]=[tenant];
  if(courseRaw){conditions.push('a.curso_id=?');params.push(Number(courseRaw));}
  if(resultFilter==='aprovado')conditions.push("a.state='SUBMITTED' AND a.passed=1");
  if(resultFilter==='reprovado')conditions.push("a.state='SUBMITTED' AND a.passed=0");
  if(resultFilter==='andamento')conditions.push("a.state='IN_PROGRESS'");
  if(search){
    conditions.push('(f.nome LIKE ? OR c.titulo LIKE ? OR a.exam_id LIKE ?)');
    params.push('%'+search+'%','%'+search+'%','%'+search+'%');
  }
  const from=' FROM lms_exam_attempts a '+
    'LEFT JOIN lms_exam_plans p ON p.empresa_id=a.empresa_id AND p.curso_id=a.curso_id '+
      'AND p.exam_id=a.exam_id AND p.version=a.exam_version AND p.plan_sha256=a.plan_sha256 '+
    'LEFT JOIN lms_matriculas m ON m.id=a.matricula_id AND m.empresa_id=a.empresa_id '+
    'LEFT JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=a.empresa_id '+
    'LEFT JOIN lms_cursos c ON c.id=a.curso_id AND c.empresa_id=a.empresa_id '+
    'WHERE '+conditions.join(' AND ');
  const [count,records]=await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS total'+from).bind(...params)
      .first<{total:number}>(),
    c.env.DB.prepare('SELECT a.curso_id,c.titulo,a.matricula_id,a.exam_id,a.exam_version,'+
      'a.attempt_no,a.state,a.passed,a.started_at,a.submitted_at,a.result_json,'+
      'f.nome AS aluno_nome,p.plan_json'+from+
      ' ORDER BY a.started_at DESC,a.id DESC LIMIT ? OFFSET ?')
      .bind(...params,limit,(page-1)*limit)
      .all<{curso_id:number;titulo:string|null;matricula_id:number;exam_id:string;
        exam_version:number;attempt_no:number;state:string;passed:number|null;
        started_at:string;submitted_at:string|null;result_json:string|null;
        aluno_nome:string|null;plan_json:string|null}>(),
  ]);
  return c.json({success:true,data:{
    page,limit,total:count?.total||0,
    pages:Math.ceil((count?.total||0)/limit),
    items:(records.results||[]).map(row=>({
      cursoId:row.curso_id,cursoTitulo:row.titulo||null,matriculaId:row.matricula_id,
      alunoNome:row.aluno_nome||null,examId:row.exam_id,version:row.exam_version,
      attemptNo:row.attempt_no,state:row.state,
      passed:row.passed===null?null:row.passed===1,
      scorePct:row.state==='SUBMITTED'?scoreForReport(row.plan_json,row.result_json):null,
      startedAt:row.started_at,submittedAt:row.submitted_at,
    })),
  }});
});

/** One tenant-scoped read model for the independent assessment management hub.
 * No question answer, personal identifier or mutation is exposed here.
 * Same ADMIN + schema and feature guards as the editor. */
routes.get('/overview',async c=>{
  const tenant=getEmpresaId(c);
  const [courseRows,questionRows,planRows,bindingRows,totalsRow,attemptRows]=await Promise.all([
    c.env.DB.prepare(
      'SELECT id,titulo,tipo_conteudo,scorm_assessment_policy,publicado '+
      'FROM lms_cursos WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL '+
      'ORDER BY titulo COLLATE NOCASE LIMIT 250'
    ).bind(tenant).all<{id:number;titulo:string;tipo_conteudo:string;
      scorm_assessment_policy:string|null;publicado:number}>(),
    c.env.DB.prepare(
      'SELECT curso_id,status,COUNT(DISTINCT question_key) AS total FROM lms_exam_question_revisions '+
      'WHERE empresa_id=? GROUP BY curso_id,status'
    ).bind(tenant).all<{curso_id:number;status:string;total:number}>(),
    c.env.DB.prepare(
      'SELECT curso_id,exam_id,version,plan_json,published_at FROM lms_exam_plans '+
      'WHERE empresa_id=? ORDER BY published_at DESC LIMIT 250'
    ).bind(tenant).all<{curso_id:number;exam_id:string;version:number;plan_json:string;published_at:string}>(),
    c.env.DB.prepare(
      'SELECT curso_id,package_sha256,exam_id,exam_version,created_at '+
      'FROM lms_exam_edition_bindings WHERE empresa_id=? ORDER BY created_at DESC LIMIT 250'
    ).bind(tenant).all<{curso_id:number;package_sha256:string;exam_id:string;
      exam_version:number;created_at:string}>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS total,SUM(CASE WHEN state='SUBMITTED' AND passed=1 THEN 1 ELSE 0 END) AS passed,"+
      "SUM(CASE WHEN state='SUBMITTED' AND passed=0 THEN 1 ELSE 0 END) AS failed,"+
      "SUM(CASE WHEN state='IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress "+
      'FROM lms_exam_attempts WHERE empresa_id=?'
    ).bind(tenant).first<{total:number;passed:number|null;failed:number|null;in_progress:number|null}>(),
    c.env.DB.prepare(
      'SELECT a.curso_id,a.matricula_id,a.exam_id,a.exam_version,a.attempt_no,a.state,a.passed,'+
      'a.started_at,a.submitted_at,a.result_json,f.nome AS aluno_nome,'+
      'p.plan_json AS attempt_plan_json FROM lms_exam_attempts a '+
      'LEFT JOIN lms_exam_plans p ON p.empresa_id=a.empresa_id AND p.curso_id=a.curso_id '+
      'AND p.exam_id=a.exam_id AND p.version=a.exam_version AND p.plan_sha256=a.plan_sha256 '+
      'LEFT JOIN lms_matriculas m ON m.id=a.matricula_id AND m.empresa_id=a.empresa_id '+
      'LEFT JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=a.empresa_id '+
      'WHERE a.empresa_id=? ORDER BY a.started_at DESC LIMIT 100'
    ).bind(tenant).all<{curso_id:number;matricula_id:number;exam_id:string;
      exam_version:number;attempt_no:number;state:string;passed:number|null;
      started_at:string;submitted_at:string|null;result_json:string|null;aluno_nome:string|null;attempt_plan_json:string|null}>(),
  ]);
  const plans=(planRows.results||[]).map(row=>{
    let questionCount:number|null=null,title:string|null=null;
    try{
      const plan=JSON.parse(row.plan_json) as {title?:unknown;sections?:{questions?:unknown[]}[]};
      if(typeof plan.title==='string')title=plan.title;
      if(Array.isArray(plan.sections)){
        questionCount=plan.sections.reduce((n,sec)=>n+
          (Array.isArray(sec.questions)?sec.questions.length:0),0);
      }
    }catch{ /* corrupted plans are not silently accepted */ }
    return {cursoId:row.curso_id,examId:row.exam_id,version:row.version,
      questionCount,title,publishedAt:row.published_at};
  });
  const attempts=(attemptRows.results||[]).map(row=>{
    const scorePct=row.state==='SUBMITTED'?scoreForReport(row.attempt_plan_json,row.result_json):null;
    return {cursoId:row.curso_id,matriculaId:row.matricula_id,
      examId:row.exam_id,version:row.exam_version,attemptNo:row.attempt_no,
      state:row.state,passed:row.passed===null?null:row.passed===1,
      scorePct,alunoNome:row.aluno_nome||null,startedAt:row.started_at,submittedAt:row.submitted_at};
  });
  return c.json({success:true,data:{
    courses:courseRows.results||[],questionCounts:questionRows.results||[],
    plans,bindings:(bindingRows.results||[]).map(row=>({
      cursoId:row.curso_id,packageSha256:row.package_sha256,
      examId:row.exam_id,version:row.exam_version,createdAt:row.created_at,
    })),
    totals:{attempts:totalsRow?.total||0,passed:totalsRow?.passed||0,
      failed:totalsRow?.failed||0,inProgress:totalsRow?.in_progress||0},
    attempts,attemptsTruncated:(totalsRow?.total||0)>100,
    coursesTruncated:(courseRows.results||[]).length===250,
    plansTruncated:(planRows.results||[]).length===250,
  }});
});


/** The physical tenant-scoped R2 manifest, not a SCORED/FORMATIVE label,
 * determines whether the selected edition can receive an external exam. */
routes.get('/cursos/:cursoId/aptidao',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const sha=c.req.query('packageSha256')||'';
  if(!/^[a-f0-9]{64}$/.test(sha))throw new QuestionStoreError('EXAM_EDITION_SHA_INVALID');
  const edition=await c.env.DB.prepare(
    'SELECT p.status,p.r2_prefix,b.exam_id,b.exam_version '+
    'FROM lms_scorm_package_versions p '+
    'LEFT JOIN lms_exam_edition_bindings b ON b.empresa_id=p.empresa_id '+
    'AND b.curso_id=p.curso_id AND b.package_sha256=p.package_sha256 '+
    'WHERE p.empresa_id=? AND p.curso_id=? AND p.package_sha256=? LIMIT 1'
  ).bind(a.empresaId,a.cursoId,sha).first<{
    status:string;r2_prefix:string;exam_id:string|null;exam_version:number|null;
  }>();
  if(!edition)return c.json({success:false,code:'EXAM_EDITION_NOT_FOUND'},404);
  const manifest=await readActiveCompletionManifest({
    bucket:c.env.BUCKET,empresaId:a.empresaId,cursoId:a.cursoId,
    activePrefix:edition.r2_prefix,
  });
  const compatible=manifest?.assessmentMode==='EXTERNAL'&&manifest.workerApprovalRequired;
  const available=['ACTIVE','VALIDATED'].includes(edition.status);
  const canBind=Boolean(compatible&&available&&!edition.exam_id);
  return c.json({success:true,data:{
    packageSha256:sha,status:edition.status,assessmentMode:manifest?.assessmentMode??null,
    workerApprovalRequired:manifest?.workerApprovalRequired===true,
    canBind,boundExamId:edition.exam_id,boundExamVersion:edition.exam_version,
    reason:edition.exam_id?'ALREADY_BOUND':!available?'EDITION_INACTIVE':
      !manifest?'MANIFEST_NOT_FOUND':!compatible?'EDITION_NOT_EXTERNAL':null,
  }});
});

/** Published course exam plans without answer keys or grading data. */
routes.get('/cursos/:cursoId/provas',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const rows=await c.env.DB.prepare(
    'SELECT p.exam_id,p.version,p.published_at,p.plan_json,b.package_sha256 '+
    'FROM lms_exam_plans p LEFT JOIN lms_exam_edition_bindings b '+
    'ON b.empresa_id=p.empresa_id AND b.curso_id=p.curso_id '+
    'AND b.exam_id=p.exam_id AND b.exam_version=p.version AND b.plan_sha256=p.plan_sha256 '+
    'WHERE p.empresa_id=? AND p.curso_id=? '+
    'ORDER BY p.published_at DESC,p.exam_id,p.version DESC LIMIT 101'
  ).bind(a.empresaId,a.cursoId).all<{
    exam_id:string;version:number;published_at:string;plan_json:string;package_sha256:string|null;
  }>();
  const all=rows.results||[];
  return c.json({success:true,data:{
    items:all.slice(0,100).map(row=>{
      let sourceSha:string|null=null,title:string|null=null;
      try{
        const plan=JSON.parse(row.plan_json) as {trainingSourceSha256?:unknown;title?:unknown};
        if(typeof plan.title==='string')title=plan.title;
        if(typeof plan.trainingSourceSha256==='string'&&
            /^[a-f0-9]{64}$/.test(plan.trainingSourceSha256)){
          sourceSha=plan.trainingSourceSha256;
        }
      }catch{ /* malformed plan cannot be attached to an edition */ }
      return {examId:row.exam_id,version:row.version,
        publishedAt:row.published_at,boundPackageSha256:row.package_sha256,sourceSha,title};
    }),
    hasMore:all.length>100,
  }});
});

// Staging-only metadata: package versions and any immutable existing binding.
routes.get('/cursos/:cursoId/edicoes',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const rows=await c.env.DB.prepare(
    'SELECT p.package_sha256,p.package_version,p.status,p.uploaded_at,'+
    'b.exam_id,b.exam_version FROM lms_scorm_package_versions p '+
    'LEFT JOIN lms_exam_edition_bindings b ON b.empresa_id=p.empresa_id '+
    'AND b.curso_id=p.curso_id AND b.package_sha256=p.package_sha256 '+
    'WHERE p.empresa_id=? AND p.curso_id=? '+
    "AND p.status IN ('ACTIVE','VALIDATED','SUPERSEDED') "+
    'ORDER BY p.uploaded_at DESC LIMIT 100'
  ).bind(a.empresaId,a.cursoId).all<{
    package_sha256:string;package_version:string;status:string;uploaded_at:string;
    exam_id:string|null;exam_version:number|null;
  }>();
  return c.json({success:true,data:{editions:(rows.results||[]).map(row=>({
    packageSha256:row.package_sha256,packageVersion:row.package_version,
    status:row.status,uploadedAt:row.uploaded_at,
    boundExamId:row.exam_id,boundExamVersion:row.exam_version,
  }))}});
});
routes.get('/cursos/:cursoId/questoes-publicadas',async c=>{
  const a=actor(c,c.req.param('cursoId'));
  const raw=c.req.query('offset')||'0';
  if(!/^(0|[1-9][0-9]{0,5})$/.test(raw)){
    throw new QuestionStoreError('EXAM_PAGINATION_INVALID');
  }
  const data=await listPublishedExamQuestions(c.env.DB,a,Number(raw));
  return c.json({success:true,data});
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
// Recovery after network interruption between publish and binding.
routes.get('/cursos/:cursoId/provas/:examId/versoes/:version',async c=>{
  const a=examActor(c);
  const cursoId=positive(c.req.param('cursoId'));
  if(a.tenantRole!=='admin')throw new QuestionStoreError('EXAM_ADMIN_RBAC_REQUIRED');
  const row=await c.env.DB.prepare(
    'SELECT plan_json,plan_sha256 FROM lms_exam_plans '+
    'WHERE empresa_id=? AND curso_id=? AND exam_id=? AND version=? LIMIT 1'
  ).bind(a.empresaId,cursoId,c.req.param('examId'),positive(c.req.param('version')))
    .first<{plan_json:string;plan_sha256:string}>();
  if(!row) return c.json({success:false,code:'EXAM_PLAN_NOT_FOUND'},404);
  // The plan only holds question references and hashes, never answer keys.
  return c.json({success:true,data:{plan:JSON.parse(row.plan_json),planSha256:row.plan_sha256}});
});
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
  // A binding to a FORMATIVE/NONE/SCORM edition would be misleading and could
  // interfere with its existing completion policy. Accept only a physically
  // present, tenant-scoped, Worker-controlled EXTERNAL manifest. Never trust
  // a client-supplied assessment mode or a generic SCORM policy label.
  const cursoId=positive(c.req.param('cursoId'));
  const edition=await c.env.DB.prepare(
    "SELECT r2_prefix,status FROM lms_scorm_package_versions " +
    "WHERE empresa_id=? AND curso_id=? AND package_sha256=? LIMIT 1"
  ).bind(getEmpresaId(c),cursoId,body.packageSha256)
    .first<{r2_prefix:string;status:string}>();
  if(!edition) {
    // Do not reveal cross-tenant edition existence via a conflict response.
    return c.json({success:false,code:'EXAM_EDITION_NOT_FOUND'},404);
  }
  if(!['ACTIVE','VALIDATED'].includes(edition.status)){
    return c.json({success:false,code:'EXAM_EDITION_UNAVAILABLE'},409);
  }
  const manifest=await readActiveCompletionManifest({
    bucket:c.env.BUCKET,empresaId:getEmpresaId(c),cursoId,
    activePrefix:edition.r2_prefix,
  });
  if(!manifest || manifest.assessmentMode!=='EXTERNAL' || !manifest.workerApprovalRequired){
    return c.json({success:false,code:'EXAM_EDITION_NOT_EXTERNAL'},409);
  }
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
