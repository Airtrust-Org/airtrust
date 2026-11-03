/**
 * Administrative exam composer. Only metadata and published question references
 * are loaded; answer keys stay in the private Worker. All writes are governed
 * by the existing staging-only endpoints, never from the player.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../../../components/AppLayout';
import { useLmsCurso } from '../../../hooks/useLms';
import { fetchWithAuth } from '../../../config/api';
import QuestionBankAdmin from './QuestionBankAdmin';

type Edition = {
  packageSha256:string;packageVersion:string;status:string;uploadedAt:string;
  boundExamId:string|null;boundExamVersion:number|null;
};
type Question = {
  questionId:string;revision:number;moduleId:string;topicId:string;prompt:string;
  sourceSha256:string;contentSha256:string;
};
type Published = { examId:string;version:number;packageSha256:string;planSha256:string };
type Envelope<T> = {success:boolean;data?:T;code?:string};
const sha = /^[a-f0-9]{64}$/;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

async function api<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetchWithAuth(path,{cache:'no-store',...init});
  let payload:Envelope<T>={success:false};
  try { payload=await response.json() as Envelope<T>; } catch { /* JSON required */ }
  if(!response.ok||!payload.success||payload.data===undefined){
    throw new Error(payload.code||'EXAM_ADMIN_REQUEST_FAILED');
  }
  return payload.data;
}
const post=(payload:unknown):RequestInit=>({
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
});

export default function LmsExamAdmin():React.ReactElement {
  const {cursoId}=useParams<{cursoId:string}>();
  const id=Number(cursoId);
  const validId=Number.isSafeInteger(id)&&id>0;
  const {data:course}=useLmsCurso(validId?id:0);
  const base=`/api/lms/exams/admin/cursos/${id}`;
  const [editions,setEditions]=useState<Edition[]>([]);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [packageSha,setPackageSha]=useState('');
  const [tab,setTab]=useState<'compose'|'bank'>('compose');
  const [selected,setSelected]=useState<Record<string,number>>({});
  const [minimums,setMinimums]=useState<Record<string,string>>({});
  const [examId,setExamId]=useState('');
  const [version,setVersion]=useState('1');
  const [editionSha,setEditionSha]=useState('');
  const [legal,setLegal]=useState<''|'yes'|'no'>('');
  const [note,setNote]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [published,setPublished]=useState<Published|null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const edition=editions.find(e=>e.packageSha256===packageSha);
  const picked=questions.filter(q=>selected[q.questionId]===q.revision);
  const groups=useMemo(()=>{
    const grouped=new Map<string,Question[]>();
    for(const q of picked)grouped.set(q.moduleId,[...(grouped.get(q.moduleId)||[]),q]);
    return [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[questions,selected]);

  const loadQuestions=useCallback(async(offset:number)=>{
    const data=await api<{items:Question[];nextOffset:number|null}>(`${base}/questoes-publicadas?offset=${offset}`);
    setQuestions(old=>offset===0?data.items:[...old,...data.items]);
    setNextOffset(data.nextOffset);
  },[base]);
  const refresh=useCallback(async()=>{
    if(!validId)return;
    setLoading(true);setError('');
    try{
      const [e]=await Promise.all([
        api<{editions:Edition[]}>(base+'/edicoes'),
        loadQuestions(0),
      ]);
      setEditions(e.editions);
    }catch(err){setError('Banco de provas indisponível: '+(err as Error).message);}
    finally{setLoading(false);}
  },[validId,base,loadQuestions]);
  useEffect(()=>{void refresh();},[refresh]);

  function changePackage(value:string){
    setPackageSha(value);setPublished(null);setConfirmed(false);setMessage('');setError('');
    setEditionSha('');
  }
  function buildPlan(){
    if(!edition||edition.boundExamId||edition.status==='SUPERSEDED'||!sha.test(packageSha))throw Error('EDIÇÃO_INDISPONÍVEL');
    if(!identifier.test(examId)||!Number.isSafeInteger(Number(version))||Number(version)<1||Number(version)>2147483647)
      throw Error('IDENTIFICADOR_OU_VERSÃO_INVÁLIDOS');
    if(!sha.test(editionSha))throw Error('SHA_DA_EDIÇÃO_INVÁLIDO');
    if(!groups.length)throw Error('SELECIONE_QUESTÕES_PUBLICADAS');
    const origins=[...new Set([packageSha,...picked.map(q=>q.sourceSha256)])];
    if(origins.length>20)throw Error('ORIGENS_DE_QUESTÕES_EM_EXCESSO');
    const sections=groups.map(([moduleId,items])=>{
      const threshold=Number(minimums[moduleId]||'');
      if(!/^(100|[1-9][0-9]?)$/.test(minimums[moduleId]||'')||
        !Number.isInteger(threshold)||threshold<1||threshold>100) {
        throw Error('NOTA_MÍNIMA_NÃO_CONFIGURADA_EM_'+moduleId);
      }
      return {moduleId,minScorePct:threshold,questions:items.map(q=>({
        questionId:q.questionId,revision:q.revision,contentSha256:q.contentSha256,
      }))};
    });
    if(!confirmed)throw Error('REVISÃO_EDITORIAL_NÃO_CONFIRMADA');
    return {schema:'AIRTRUST_EXTERNAL_EXAM_PLAN_V1',tenantId:course?.empresa_id,
      courseId:id,examId,version:Number(version),
      trainingSourceSha256:packageSha,trainingEditionSha256:editionSha,
      acceptedQuestionSourceSha256:origins,consultationAllowed:true,sections};
  }
  async function publish(){
    setWorking(true);setError('');setMessage('');
    try{
      const plan=buildPlan();
      const result=await api<{planSha256:string}>(base+'/provas',post({plan}));
      setPublished({examId,version:Number(version),packageSha256:packageSha,planSha256:result.planSha256});
      setMessage('Plano imutável publicado. O vínculo com o curso ainda NÃO foi realizado.');
    }catch(err){setError('Publicação não concluída: '+(err as Error).message);}
    finally{setWorking(false);}
  }
  async function recover(){
    setWorking(true);setError('');setMessage('');
    try {
      if(!identifier.test(examId)||!Number.isSafeInteger(Number(version))||Number(version)<1||!sha.test(packageSha))
        throw Error('SELECIONE_A_EDIÇÃO_E_INFORME_A_PROVA');
      const result=await api<{planSha256:string;plan:{trainingSourceSha256:string;trainingEditionSha256:string}}>(
        `${base}/provas/${encodeURIComponent(examId)}/versoes/${version}`);
      if(result.plan.trainingSourceSha256!==packageSha)throw Error('PROVA_PUBLICADA_PARA_OUTRA_EDIÇÃO');
      setPublished({examId,version:Number(version),packageSha256,planSha256:result.planSha256});
      setEditionSha(result.plan.trainingEditionSha256);
      setMessage('Plano publicado recuperado. Confira a classificação normativa e vincule-o à edição.');
    }catch(err){setError('Não foi possível recuperar: '+(err as Error).message);}
    finally{setWorking(false);}
  }
  async function bind(){
    setWorking(true);setError('');setMessage('');
    try {
      if(!published||published.packageSha256!==packageSha||edition?.boundExamId)throw Error('VÍNCULO_INVÁLIDO');
      if(legal==='')throw Error('CLASSIFICAÇÃO_NORMATIVA_OBRIGATÓRIA');
      if(note.trim().length<10||note.trim().length>500)throw Error('JUSTIFICATIVA_DE_10_A_500_CARACTERES');
      await api<{bindingId:string}>(
        `${base}/provas/${encodeURIComponent(published.examId)}/versoes/${published.version}/vinculo`,
        post({packageSha256:published.packageSha256,statutoryAssessmentRequired:legal==='yes',approvalNote:note.trim()})
      );
      setMessage('Prova vinculada à edição. O curso não foi publicado nem matrículas foram modificadas.');
      setPublished(null);
      await refresh();
    }catch(err){setError('Vínculo não concluído: '+(err as Error).message);}
    finally{setWorking(false);}
  }
  const panel='rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900';
  const input='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
  return <AppLayout><main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <Link className="text-sm underline" to="/lms/admin/cursos">Voltar às configurações LMS</Link>
    <header><h1 className="text-2xl font-semibold">Banco de questões e montagem de provas</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">{course?.titulo||`Curso #${id}`} — edição e política verificadas pelo Worker</p>
      <p className="mt-2 text-sm">Homologação: publicar um plano não conclui matrícula nem emite certificado.</p>
    </header>
    {!validId?<p role="alert">Curso inválido.</p>:null}
    {error?<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>:null}
    {message?<p role="status" className="rounded bg-blue-50 p-3 text-sm text-blue-900">{message}</p>:null}
    {loading?<p>Carregando edições e questões publicadas…</p>:null}
    {!loading&&validId?<section className={panel}>
      <label className="block text-sm font-medium">Edição do pacote SCORM
        <select className={input+' mt-2'} aria-label="Edição do pacote SCORM" value={packageSha}
          onChange={e=>changePackage(e.target.value)}>
          <option value="">Selecione uma edição identificada pelo servidor</option>
          {editions.map(e=><option value={e.packageSha256} key={e.packageSha256}>
            {e.packageVersion} · {e.status} · {e.packageSha256.slice(0,12)}
            {e.boundExamId?` · vinculada à prova ${e.boundExamId} v${e.boundExamVersion}`:''}
          </option>)}
        </select>
      </label>
      {editions.length===0?<p className="mt-2 text-sm">Nenhum pacote validado encontrado. Não é permitido inventar uma edição.</p>:null}
      {edition?.boundExamId?<p className="mt-2 text-sm">Esta edição já está vinculada a uma prova imutável.</p>:null}
      {edition?.status==='SUPERSEDED'?<p className="mt-2 text-sm">Edição substituída: indisponível para novos vínculos.</p>:null}
      <div className="mt-4 flex gap-2">
        <button type="button" aria-pressed={tab==='compose'} className="rounded border px-3 py-2" onClick={()=>setTab('compose')}>Montagem da prova</button>
        <button type="button" aria-pressed={tab==='bank'} className="rounded border px-3 py-2" onClick={()=>setTab('bank')}>Banco de questões</button>
        <button type="button" className="rounded border px-3 py-2" disabled={working} onClick={()=>void refresh()}>Atualizar catálogo</button>
      </div>
    </section>:null}
    {!loading&&validId&&tab==='bank'&&sha.test(packageSha)?
      <QuestionBankAdmin courseId={id} trainingSourceSha256={packageSha}/>:null}
    {!loading&&validId&&tab==='compose'?<section className={panel}>
      <h2 className="mb-3 text-lg font-semibold">Composição e critérios de aprovação</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Identificador da prova
          <input className={input+' mt-1'} aria-label="Identificador da prova" value={examId}
            disabled={!!published||working} onChange={e=>setExamId(e.target.value)} placeholder="prova-crm-v1"/>
        </label>
        <label className="text-sm">Versão da prova
          <input className={input+' mt-1'} aria-label="Versão da prova" type="number" min="1" max="2147483647"
            disabled={!!published||working} value={version} onChange={e=>setVersion(e.target.value)}/>
        </label>
        <label className="text-sm">SHA-256 da edição aprovada
          <input className={input+' mt-1'} aria-label="SHA-256 da edição aprovada"
            value={editionSha} disabled={!!published||working} onChange={e=>setEditionSha(e.target.value)}
            placeholder="64 caracteres hexadecimais"/>
        </label>
      </div>
      <p className="mt-2 text-xs">Use o SHA da edição aprovada na governança de conteúdo, não um valor arbitrário. A API valida o formato; a homologação deve atestar a proveniência.</p>
      <h3 className="mt-5 font-semibold">Questões publicadas ({questions.length})</h3>
      {questions.length===0?<p className="text-sm">O banco ainda não contém questões publicadas para este curso.</p>:null}
      <div className="mt-2 max-h-80 space-y-2 overflow-y-auto" aria-label="Questões disponíveis">
        {questions.map(q=><label className="flex gap-3 rounded border p-2 text-sm" key={q.questionId+':'+q.revision}>
          <input type="checkbox" aria-label={`Incluir ${q.questionId} v${q.revision}`}
            disabled={!!published||working} checked={selected[q.questionId]===q.revision}
            onChange={e=>setSelected(old=>{
              const next={...old};
              if(e.target.checked)next[q.questionId]=q.revision;
              else delete next[q.questionId];
              return next;
            })}/>
          <span><strong>{q.moduleId}</strong> · {q.topicId} · {q.questionId} v{q.revision}: {q.prompt}</span>
        </label>)}
      </div>
      {nextOffset!==null?<button type="button" className="mt-3 rounded border px-3 py-2"
        disabled={working} onClick={()=>void loadQuestions(nextOffset).catch(e=>setError(String(e)))}>
        Carregar mais questões</button>:null}
      <h3 className="mt-5 font-semibold">Critérios por módulo</h3>
      {groups.length===0?<p className="text-sm">Selecione as questões para configurar a aprovação por módulo.</p>:null}
      {groups.map(([moduleId,items])=><div className="mt-2 flex flex-wrap items-center gap-3 rounded border p-3" key={moduleId}>
        <span className="flex-1 text-sm">{moduleId} · {items.length} questão(ões)</span>
        <label className="text-sm">Nota mínima (%)
          <input type="number" min="1" max="100" aria-label={`Nota mínima de ${moduleId}`}
            className={input+' ml-2 w-24'} value={minimums[moduleId]||''}
            disabled={!!published||working} onChange={e=>setMinimums(old=>({...old,[moduleId]:e.target.value}))}/>
        </label>
      </div>)}
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox"
        checked={confirmed} disabled={!!published||working}
        onChange={e=>setConfirmed(e.target.checked)}/>
        Confirmo a cobertura do conteúdo, os critérios de aprovação por módulo, a edição e a autorização editorial.</label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={working||!edition||!!edition.boundExamId||edition.status==='SUPERSEDED'||!!published}
          onClick={()=>void publish()}>Publicar plano imutável</button>
        <button type="button" className="rounded border px-3 py-2 disabled:opacity-50"
          disabled={working||!edition||!!published}
          onClick={()=>void recover()}>Recuperar plano já publicado</button>
      </div>
      {published?<section className="mt-5 rounded-xl border border-amber-300 p-4">
        <h3 className="font-semibold">Plano publicado — vínculo pendente</h3>
        <p className="text-xs">SHA do plano: {published.planSha256}</p>
        <label className="mt-3 block text-sm">Obrigatoriedade normativa da avaliação
          <select className={input+' mt-1'} aria-label="Obrigatoriedade normativa da avaliação"
            value={legal} onChange={e=>setLegal(e.target.value as ''|'yes'|'no')}>
            <option value="">Classificação obrigatória</option><option value="yes">Exigida por norma</option>
            <option value="no">Exigida pelo treinamento, não por norma</option>
          </select>
        </label>
        <label className="mt-3 block text-sm">Justificativa de aprovação
          <textarea className={input+' mt-1'} rows={3} value={note}
            aria-label="Justificativa de aprovação" onChange={e=>setNote(e.target.value)}/>
        </label>
        <button type="button" className="mt-3 rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={working||!!edition?.boundExamId} onClick={()=>void bind()}>
          Vincular prova à edição</button>
      </section>:null}
    </section>:null}
  </main></AppLayout>;
}
