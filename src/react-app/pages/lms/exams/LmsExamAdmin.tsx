/**
 * Administrative exam composer. Only metadata and published question references
 * are loaded; answer keys stay in the private Worker. All writes are governed
 * by the activated tenant-scoped backend endpoints, never from the player.
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
  difficulty?:'BASICA'|'INTERMEDIARIA'|'AVANCADA';
};
type Published = { examId:string;version:number;packageSha256:string;planSha256:string };
type Eligibility={
  packageSha256:string;status:string;assessmentMode:string|null;
  workerApprovalRequired:boolean;canBind:boolean;
  boundExamId:string|null;boundExamVersion:number|null;reason:string|null;
};
type ListedExam={examId:string;version:number;title:string|null;publishedAt:string;
  boundPackageSha256:string|null;sourceSha:string|null};
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
  const [plans,setPlans]=useState<ListedExam[]>([]);
  const [eligibility,setEligibility]=useState<Eligibility|null>(null);
  const [eligibilityLoading,setEligibilityLoading]=useState(false);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [packageSha,setPackageSha]=useState('');
  const [tab,setTab]=useState<'compose'|'bank'>('compose');
  const [selected,setSelected]=useState<Record<string,number>>({});
  const [quantity,setQuantity]=useState<Record<'BASICA'|'INTERMEDIARIA'|'AVANCADA',string>>({
    BASICA:'0',INTERMEDIARIA:'0',AVANCADA:'0',
  });
  const [minimums,setMinimums]=useState<Record<string,string>>({});
  const [examTitle,setExamTitle]=useState('Avaliação final do treinamento');
  const [examId,setExamId]=useState(()=> 'prova-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,14));
  const [version,setVersion]=useState('1');
  const [editionSha,setEditionSha]=useState('');
  const [legal,setLegal]=useState<''|'yes'|'no'>('');
  const [note,setNote]=useState('');
  const [maxAttempts,setMaxAttempts]=useState('');
  const [retryDelayMinutes,setRetryDelayMinutes]=useState('0');
  const [timeLimitMinutes,setTimeLimitMinutes]=useState('');
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
      const [e,p]=await Promise.all([
        api<{editions:Edition[]}>(base+'/edicoes'),
        api<{items:ListedExam[]}>(base+'/provas'),
        loadQuestions(0),
      ]);
      setEditions(e.editions);
      setPlans(p.items);
      const preferred=e.editions.find(e=>e.status==='ACTIVE')||
        e.editions.find(e=>e.status==='VALIDATED');
      if(preferred)setPackageSha(old=>old||preferred.packageSha256);
    }catch(err){setError('Banco de provas indisponível: '+(err as Error).message);}
    finally{setLoading(false);}
  },[validId,base,loadQuestions]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if(sha.test(packageSha)&&!editionSha)setEditionSha(packageSha);
  },[packageSha,editionSha]);
  useEffect(()=>{
    if(!validId||!sha.test(packageSha)){setEligibility(null);return;}
    let active=true;
    setEligibility(null);setEligibilityLoading(true);
    void api<Eligibility>(base+'/aptidao?packageSha256='+packageSha)
      .then(value=>{if(active)setEligibility(value);})
      .catch(()=>{if(active)setError('Não foi possível verificar a modalidade física da edição.');})
      .finally(()=>{if(active)setEligibilityLoading(false);});
    return()=>{active=false;};
  },[base,validId,packageSha]);

  function changePackage(value:string){
    setPackageSha(value);setPublished(null);setConfirmed(false);setMessage('');setError('');
    setEditionSha(value);
    setEligibility(null);
  }
  function composeByDifficulty(){
    setError('');setMessage('');
    const levels=['BASICA','INTERMEDIARIA','AVANCADA'] as const;
    const requested=levels.map(level=>({level,count:Number(quantity[level])}));
    const total=requested.reduce((n,r)=>n+r.count,0);
    if(!total||total>200||requested.some(r=>!Number.isInteger(r.count)||r.count<0)){
      setError('Informe de 1 a 200 questões, distribuídas entre os três níveis.');
      return;
    }
    const selectedRows:Question[]=[];
    const used=new Set<string>();
    for(const {level,count} of requested){
      // The browser composes a reviewed draft. Final plan remains fixed, signed
      // by the Worker; no claim of per-learner randomization is made.
      const available=questions.filter(q=>q.difficulty===level);
      const seen=new Set<string>();
      const unique=available.filter(q=>{if(seen.has(q.questionId))return false;seen.add(q.questionId);return true;});
      if(unique.length<count){
        setError('Banco insuficiente para '+level+': '+unique.length+' disponíveis, '+count+' solicitadas.');return;
      }
      for(let i=unique.length-1;i>0;i--){
        const rand=crypto.getRandomValues(new Uint32Array(1))[0];
        const j=rand%(i+1);
        [unique[i],unique[j]]=[unique[j],unique[i]];
      }
      for(const q of unique.slice(0,count)){
        if(used.has(q.questionId))continue;
        used.add(q.questionId);selectedRows.push(q);
      }
    }
    if(selectedRows.length!==total){setError('As questões selecionadas não são únicas.');return;}
    setSelected(Object.fromEntries(selectedRows.map(q=>[q.questionId,q.revision])));
    // A course's normative minimum can be 70%, 80%, or module-specific.
    // Never invent an 80% minimum during composition: the administrator
    // must enter and explicitly approve the correct policy for each module.
    setMinimums(old=>Object.fromEntries(
      Object.entries(old).filter(([moduleId])=>selectedRows.some(q=>q.moduleId===moduleId))
    ));
    setMessage(total+' questões selecionadas. Defina a nota mínima autorizada de cada módulo antes de publicar.');
  }
  function buildPlan(){
    if(!edition||edition.boundExamId||edition.status==='SUPERSEDED'||!sha.test(packageSha))throw Error('EDIÇÃO_INDISPONÍVEL');
    if(examTitle.trim().length<3||examTitle.trim().length>100)throw Error('NOME_DA_PROVA_OBRIGATÓRIO');
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
    if(!/^(10|[1-9])$/.test(maxAttempts))throw Error('LIMITE_DE_TENTATIVAS_OBRIGATÓRIO_1_A_10');
    if(!/^(0|[1-9][0-9]{0,4})$/.test(retryDelayMinutes)||
      Number(retryDelayMinutes)>10080)throw Error('INTERVALO_DE_REPETIÇÃO_INVÁLIDO');
    if(timeLimitMinutes && (!/^[1-9][0-9]{0,2}$/.test(timeLimitMinutes)||
      Number(timeLimitMinutes)<5||Number(timeLimitMinutes)>240)) {
      throw Error('DURAÇÃO_DE_PROVA_INVÁLIDA_5_A_240');
    }
    if(!confirmed)throw Error('REVISÃO_EDITORIAL_NÃO_CONFIRMADA');
    return {schema:'AIRTRUST_EXTERNAL_EXAM_PLAN_V1',tenantId:course?.empresa_id,
      courseId:id,examId,title:examTitle.trim(),version:Number(version),
      trainingSourceSha256:packageSha,trainingEditionSha256:editionSha,
      acceptedQuestionSourceSha256:origins,consultationAllowed:true,
       attemptPolicy:{maxAttempts:Number(maxAttempts),retryDelayMinutes:Number(retryDelayMinutes),
         timeLimitMinutes:timeLimitMinutes?Number(timeLimitMinutes):null},sections};
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
  async function recover(selected?:ListedExam){
    setWorking(true);setError('');setMessage('');
    try {
      const selectedExamId=selected?.examId??examId;
      const selectedVersion=selected?.version??Number(version);
      const selectedSha=selected?.sourceSha??packageSha;
      if(!identifier.test(selectedExamId)||!Number.isSafeInteger(selectedVersion)||selectedVersion<1||!sha.test(selectedSha))
        throw Error('SELECIONE_A_EDIÇÃO_E_INFORME_A_PROVA');
      const result=await api<{planSha256:string;plan:{title?:string;trainingSourceSha256:string;trainingEditionSha256:string}}>(
        base+'/provas/'+encodeURIComponent(selectedExamId)+'/versoes/'+selectedVersion);
      if(result.plan.trainingSourceSha256!==selectedSha)throw Error('PROVA_PUBLICADA_PARA_OUTRA_EDIÇÃO');
      setExamId(selectedExamId);
      setExamTitle(result.plan.title||selected?.title||selectedExamId);
      setVersion(String(selectedVersion));
      setPackageSha(selectedSha);
      setPublished({examId:selectedExamId,version:selectedVersion,packageSha256:selectedSha,planSha256:result.planSha256});
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
      setPackageSha('');
      setEligibility(null);
      await refresh();
    }catch(err){setError('Vínculo não concluído: '+(err as Error).message);}
    finally{setWorking(false);}
  }
  const panel='rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900';
  const input='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
  return <AppLayout><main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <Link className="text-sm underline" to="/treinamentos/avaliacoes">Voltar à Gestão de Avaliações</Link>
    <header><h1 className="text-2xl font-semibold">Banco de questões e montagem de provas</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">{course?.titulo||`Curso #${id}`} — edição e política verificadas pelo Worker</p>
      <p className="mt-2 text-sm">Publicar um plano não altera matrículas. Vincular uma prova exige uma edição autorizada para avaliação externa.</p>
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
      {eligibilityLoading?<p role="status" className="mt-3 text-sm">Verificando contrato da edição no armazenamento...</p>:null}
      {eligibility&&<div className="mt-3 rounded-lg border p-3 text-sm" role="status">
        {eligibility.canBind?
          <p className="font-medium text-emerald-700">Edição apta para vincular prova externa. Manifesto EXTERNAL e aprovação pelo Worker confirmados.</p>:
          <p className="font-medium text-amber-700">
            {eligibility.boundExamId?
              'Prova '+eligibility.boundExamId+' v'+eligibility.boundExamVersion+' já vinculada a esta edição.':
              eligibility.reason==='EDITION_INACTIVE'?'Edição inativa: escolha uma edição validada ou atual.':
              'Esta edição não está homologada para prova externa.'}
            {' '}Modo declarado: {eligibility.assessmentMode??'Manifesto indisponível'}.
          </p>}
        {!eligibility.canBind&&!eligibility.boundExamId?<p className="mt-2">
          Para disponibilizar uma prova final do AirTrust, envie em
          <Link to="/lms/admin/cursos" className="mx-1 underline">Cursos EAD</Link>
          uma edição SCORM homologada em modo EXTERNAL, sem nota interna do pacote,
          com aprovação pelo Worker. Não é permitido converter o curso só alterando um campo.
        </p>:null}
      </div>}
      {plans.length>0&&<div className="mt-4 rounded-xl border p-3 text-sm">
        <h3 className="font-semibold">Provas já publicadas neste treinamento</h3>
        <div className="mt-2 flex flex-col gap-2">
        {plans.map(p=><div key={p.examId+':'+p.version} className="flex flex-wrap items-center justify-between gap-3">
          <span>{p.title||p.examId} · versão {p.version}
            {p.boundPackageSha256?' · vinculada a edição '+p.boundPackageSha256.slice(0,10):' · vínculo pendente'}</span>
          {!p.boundPackageSha256&&p.sourceSha?
            <button type="button" className="rounded border px-3 py-1" disabled={working}
              onClick={()=>void recover(p)}>Recuperar e vincular</button>:null}
        </div>)}
        </div>
      </div>}
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
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Selecione a edição EXTERNAL, publique as questões no banco, monte a prova e aprove o vínculo. Nenhuma matrícula será alterada por esta tela.</p>
      <label className="block text-sm font-medium">Nome da prova
        <input className={input+' mt-1'} value={examTitle} maxLength={100}
          aria-label="Nome da prova" disabled={!!published||working}
          onChange={e=>setExamTitle(e.target.value)}
          placeholder="Ex.: Avaliação Final — CRM"/>
      </label>
      <details className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
        <summary className="cursor-pointer font-medium">Configurações avançadas e rastreabilidade</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label>Identificador interno da prova
            <input className={input+' mt-1'} aria-label="Identificador da prova" value={examId}
              disabled={!!published||working} onChange={e=>setExamId(e.target.value)}/>
          </label>
          <label>Versão da prova
            <input className={input+' mt-1'} aria-label="Versão da prova" type="number" min="1" max="2147483647"
              disabled={!!published||working} value={version} onChange={e=>setVersion(e.target.value)}/>
          </label>
        </div>
        <label className="mt-3 block">SHA-256 da edição aprovada
          <input className={input+' mt-1'} aria-label="SHA-256 da edição aprovada"
            value={editionSha} disabled={!!published||working} onChange={e=>setEditionSha(e.target.value)}
            placeholder="64 caracteres hexadecimais"/>
        </label>
        <p className="mt-2 text-xs">O identificador interno é gerado automaticamente; o SHA inicial vem do pacote selecionado. Só altere o SHA quando houver outra edição editorial com proveniência controlada.</p>
      </details>
      <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h3 className="font-semibold">Montar prova por quantidade e dificuldade</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Defina quantas questões deseja de cada nível. O sistema escolhe versões publicadas;
          revise a seleção antes de publicar o plano fixo.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(['BASICA','INTERMEDIARIA','AVANCADA'] as const).map(level=>
            <label key={level} className="text-sm">{level==='BASICA'?'Básicas':level==='INTERMEDIARIA'?'Intermediárias':'Avançadas'}
              <input className={input+' mt-1'} type="number" min="0" max="200"
                aria-label={'Quantidade '+level} value={quantity[level]}
                disabled={working||!!published}
                onChange={e=>setQuantity(old=>({...old,[level]:e.target.value}))}/>
              <small className="block text-slate-500">
                {new Set(questions.filter(q=>q.difficulty===level).map(q=>q.questionId)).size} disponíveis
              </small>
            </label>)}
        </div>
        <button type="button" className="mt-3 rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={working||!!published} onClick={composeByDifficulty}>Selecionar questões</button>
        <p className="mt-2 text-xs text-slate-500">As questões antigas sem classificação podem ser incluídas manualmente.</p>
      </div>
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
          <span><strong>{q.moduleId}</strong> · {q.topicId} · {q.difficulty||'Sem nível'} · {q.questionId} v{q.revision}: {q.prompt}</span>
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
      <h3 className="mt-5 font-semibold">Política de tentativas da prova (imutável após publicação)</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Número máximo de tentativas (1 a 10)
          <input className={input+' mt-1'} type="number" min="1" max="10"
            aria-label="Número máximo de tentativas" value={maxAttempts}
            disabled={!!published||working} onChange={e=>setMaxAttempts(e.target.value)}/>
        </label>
        <label className="text-sm">Intervalo entre tentativas (minutos)
          <input className={input+' mt-1'} type="number" min="0" max="10080"
            aria-label="Intervalo entre tentativas" value={retryDelayMinutes}
            disabled={!!published||working} onChange={e=>setRetryDelayMinutes(e.target.value)}/>
        </label>
        <label className="text-sm">Limite de tempo (5 a 240 min; vazio = sem limite)
          <input className={input+' mt-1'} type="number" min="5" max="240"
            aria-label="Limite de tempo da prova" value={timeLimitMinutes}
            disabled={!!published||working} onChange={e=>setTimeLimitMinutes(e.target.value)}/>
        </label>
      </div>
      <p className="mt-2 text-xs">Cada tentativa, intervalo e duração fica fixado no plano versionado. A avaliação não modifica retroativamente os cursos formativos.</p>
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox"
        checked={confirmed} disabled={!!published||working}
        onChange={e=>setConfirmed(e.target.checked)}/>
        Confirmo a cobertura do conteúdo, os critérios de aprovação por módulo, a edição e a autorização editorial.</label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={working||!eligibility?.canBind||!edition||!!published}
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
          disabled={working||!eligibility?.canBind||!!edition?.boundExamId} onClick={()=>void bind()}>
          Vincular prova à edição</button>
      </section>:null}
    </section>:null}
  </main></AppLayout>;
}
