import {describe,expect,it,vi} from 'vitest';
import {
  createQuestionDraft,reviewQuestionDraft,publishReviewedQuestion,
  type QuestionRevision,type QuestionContent,
} from '../../lib/lms-exams/question-bank-domain';
import {
  createAdminQuestionDraft,editAdminQuestionDraft,reviewAdminQuestion,
  publishAdminQuestion,getAdminQuestion,listAdminQuestions,
} from '../../services/lms-exams/question-bank-store';

const content:QuestionContent={
  moduleId:'m1',topicId:'t1',sourceUnitId:'u1',
  sourceSha256:'a'.repeat(64),
  prompt:'Qual procedimento?',choices:[
    {id:'o1',text:'Conferir'},{id:'o2',text:'Ignorar'},
  ],correctChoiceId:'o1',explanation:'Conferir evita erros',
};
const scope={tenantId:6,courseId:100,questionId:'q1'};
const admin=(userId=11)=>({empresaId:6,cursoId:100,userId,tenantRole:'admin'});
const draft=createQuestionDraft(scope,content,'u11');
type Row={
  empresa_id:number;curso_id:number;question_key:string;revision:number;
  status:string;content_json:string;edit_version:number;created_by:string;
  last_edited_by:string;reviewed_by:string|null;published_by:string|null;
  content_sha256:string|null;
};
function row(q:QuestionRevision,editVersion=1):Row {
  const {moduleId,topicId,sourceUnitId,sourceSha256,prompt,choices,
    correctChoiceId,explanation}=q;
  return {
    empresa_id:q.tenantId,curso_id:q.courseId,question_key:q.questionId,
    revision:q.revision,status:q.status,content_json:JSON.stringify({
      moduleId,topicId,sourceUnitId,sourceSha256,prompt,choices,
      correctChoiceId,explanation,
    }),edit_version:editVersion,created_by:q.createdBy,
    last_edited_by:q.lastEditedBy,reviewed_by:q.reviewedBy,
    published_by:q.publishedBy,content_sha256:q.contentSha256,
  };
}
type Call={sql:string;params:unknown[]};
function fakeDb(queue:(Row|null)[],list:unknown[]=[]){
  const calls:Call[]=[];
  const db={
    prepare(sql:string){
      return {bind(...params:unknown[]){
        calls.push({sql,params});
        return {
          first:vi.fn(async()=>queue.shift()??null),
          all:vi.fn(async()=>({results:list})),
        };
      }};
    },
  };
  return {db:db as unknown as D1Database,calls};
}
describe('LMS exam question bank private storage boundary',()=>{
  it('denies non-admin and invalid tenant/user before opening D1',async()=>{
    const f=fakeDb([]);
    for(const a of [
      {...admin(),tenantRole:'manager'}, {...admin(),empresaId:0},
      {...admin(),cursoId:0}, {...admin(),userId:0},
    ]){
      await expect(createAdminQuestionDraft(f.db,a,'q1',content))
        .rejects.toThrow('EXAM_ADMIN_RBAC_REQUIRED');
    }
    expect(f.calls).toHaveLength(0);
  });
  it('creates private draft using SQL bindings and never logs a key',async()=>{
    const f=fakeDb([row(draft)]);
    const data=await createAdminQuestionDraft(f.db,admin(),'q1',content);
    expect(data.revision.status).toBe('DRAFT');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].sql).toContain('RETURNING');
    expect(f.calls[0].sql).toContain('VALUES(?,?,?,1');
    expect(f.calls[0].sql).not.toContain(content.correctChoiceId);
    expect(f.calls[0].params.slice(0,3)).toEqual([6,100,'q1']);
  });
  it('lists metadata only, without selecting answer bank data',async()=>{
    const f=fakeDb([],[{
      question_key:'q1',revision:1,status:'DRAFT',
      updated_at:'2026-10-20 20:00:00',
    }]);
    const list=await listAdminQuestions(f.db,admin());
    expect(list).toEqual([{
      questionId:'q1',revision:1,status:'DRAFT',
      updatedAt:'2026-10-20 20:00:00',
    }]);
    expect(f.calls[0].sql).not.toMatch(/content_json|correct_choice|explanation/i);
    expect(f.calls[0].params).toEqual([6,100]);
  });
  it('optimistic edit uses tenant and version in UPDATE; mismatch fails',async()=>{
    const updated={...draft,prompt:'Reescrita',lastEditedBy:'u22'};
    const f=fakeDb([row(draft),row(updated,2)]);
    const r=await editAdminQuestionDraft(f.db,admin(22),'q1',1,1,{prompt:'Reescrita'});
    expect(r.editVersion).toBe(2);
    expect(f.calls[1].sql).toContain("status='DRAFT' AND edit_version=?");
    expect(f.calls[1].params.slice(-5)).toEqual([6,100,'q1',1,1]);
    const stale=fakeDb([row(draft),null]);
    await expect(editAdminQuestionDraft(stale.db,admin(22),'q1',1,1,
      {prompt:'Perdida'})).rejects.toThrow('EXAM_DRAFT_CONCURRENT_UPDATE');
    const mismatch=fakeDb([row(draft)]);
    await expect(editAdminQuestionDraft(mismatch.db,admin(22),'q1',1,2,
      {prompt:'Perdida'})).rejects.toThrow('EXAM_DRAFT_CONCURRENT_UPDATE');
    expect(mismatch.calls).toHaveLength(1);
  });
  it('review and publish require separate validated lifecycle and pin digest',async()=>{
    const reviewed=reviewQuestionDraft(draft,'u22');
    const pub=await publishReviewedQuestion(reviewed,'u33');
    const reviewDb=fakeDb([row(draft),row(reviewed)]);
    const r=await reviewAdminQuestion(reviewDb.db,admin(22),'q1',1,1);
    expect(r.revision.status).toBe('REVIEWED');
    expect(reviewDb.calls[1].params).toEqual(['u22',6,100,'q1',1,1]);
    const publishDb=fakeDb([row(reviewed),row(pub)]);
    const p=await publishAdminQuestion(publishDb.db,admin(33),'q1',1,1);
    expect(p.revision.contentSha256).toBe(pub.contentSha256);
    expect(publishDb.calls[1].params[1]).toBe(pub.contentSha256);
    expect(p.revision.status).toBe('PUBLISHED');
  });
  it('detects a tampered published question before returning private data',async()=>{
    const pub=await publishReviewedQuestion(reviewQuestionDraft(draft,'u22'),'u33');
    const f=fakeDb([row({...pub,prompt:'Alterado sem nova versão'})]);
    await expect(getAdminQuestion(f.db,admin(),'q1',1))
      .rejects.toThrow('EXAM_PUBLISHED_REVISION_HASH_MISMATCH');
  });
  it('denies cross-tenant database row even if DB adapter misroutes it',async()=>{
    const other={...draft,tenantId:7};
    const f=fakeDb([row(other)]);
    await expect(getAdminQuestion(f.db,admin(),'q1',1))
      .rejects.toThrow('EXAM_QUESTION_TENANT_SCOPE_MISMATCH');
    expect(f.calls[0].params).toEqual([6,100,'q1',1]);
  });
});
