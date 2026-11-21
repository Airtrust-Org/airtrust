/**
 * Standalone LMS question bank administration. Registered via exam management:
 * F4 owns that file until its Player 3 integration has been coordinated.
 * Requires a staged, approved read/write API and an authenticated admin route.
 */
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {API_BASE_URL,fetchWithAuth} from '../../../config/api';
import {normalizeQuestionDifficulty,difficultyForPatch} from './examDifficulty';
import {examCard,examInput,examPrimary,examSecondary,examMuted,statusLabel} from './examUi';
import {parseQuestionCsv,examQuestionTemplate,type ImportQuestion} from './examQuestionCsv';

type Choice={id:string;text:string};
type Content={
  moduleId:string;topicId:string;sourceUnitId:string;sourceSha256:string;
  prompt:string;choices:Choice[];correctChoiceId:string;explanation:string;
  difficulty?:'BASICA'|'INTERMEDIARIA'|'AVANCADA';
};
type Revision=Content&{
  questionId:string;revision:number;status:'DRAFT'|'REVIEWED'|'PUBLISHED';
  contentSha256:string|null;createdBy?:string;lastEditedBy?:string;reviewedBy?:string|null;publishedBy?:string|null;
};
type Stored={revision:Revision;editVersion:number};
type Summary={questionId:string;revision:number;status:string;updatedAt:string;promptPreview?:string;moduleId?:string;topicId?:string;difficulty?:string|null};
type ResponseBody<T>={success:boolean;data?:T;code?:string};
const shaPattern=/^[a-f0-9]{64}$/;
const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const defaultOptions=():Choice[]=>[
  {id:'o1',text:''},{id:'o2',text:''},{id:'o3',text:''},{id:'o4',text:''},
];
function draft(sourceSha256:string):Content{
  return {moduleId:'',topicId:'',sourceUnitId:'',sourceSha256,
    prompt:'',choices:defaultOptions(),correctChoiceId:'',explanation:''};
}
async function req<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetchWithAuth(path,{method,cache:'no-store',
    headers:body?{'Content-Type':'application/json'}:undefined,
    body:body?JSON.stringify(body):undefined});
  const parsed=await response.json() as ResponseBody<T>;
  if(!response.ok||parsed.success!==true||parsed.data===undefined){
    throw Error(parsed.code||'QUESTION_BANK_REQUEST_FAILED');
  }
  return parsed.data;
}
export default function QuestionBankAdmin({
  courseId,trainingSourceSha256,onDirtyChange,
}:{
  /** Tenant/course selection is authorized by the API, never by this prop. */
  courseId:number;trainingSourceSha256:string;onDirtyChange?:(dirty:boolean)=>void;
}){
  const [items,setItems]=useState<Summary[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const [current,setCurrent]=useState<Stored|null>(null);
  const [questionId,setQuestionId]=useState(()=> 'questao-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,14));
  const [form,setForm]=useState<Content>(()=>draft(trainingSourceSha256));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [dirty,setDirty]=useState(false);
  const [filter,setFilter]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [showReview,setShowReview]=useState(false);
  const [importRows,setImportRows]=useState<ImportQuestion[]>([]);
  const errorRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  const validScope=Number.isSafeInteger(courseId)&&courseId>0&&
    shaPattern.test(trainingSourceSha256);
  const url=API_BASE_URL+'/lms/exams/admin/cursos/'+courseId+'/questoes';
  const canWrite=!busy&&validScope;
  const createMode=current===null;
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{
    if(!dirty)return;
    let bypassIntercept=false;
    const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    // React Router links bypass beforeunload. Intercept user-initiated navigation
    // in the capture phase while the editor has unsaved changes.
    const intercept=(event:MouseEvent)=>{
      const node=event.target;
      const anchor=node instanceof Element?node.closest('a[href]'):null;
      if(!anchor||event.defaultPrevented)return;
      if(bypassIntercept)return;
      // O diálogo é assíncrono: bloqueia o clique agora e reencaminha se confirmado.
      event.preventDefault();event.stopImmediatePropagation();
      void confirmDialog('Há alterações não salvas. Sair sem salvar?').then(ok=>{
        if(!ok)return;
        bypassIntercept=true;
        try{(anchor as HTMLElement).click();}finally{bypassIntercept=false;}
      });
    };
    window.addEventListener('beforeunload',handler);
    document.addEventListener('click',intercept,true);
    return()=>{window.removeEventListener('beforeunload',handler);document.removeEventListener('click',intercept,true);};
  },[dirty]);
  const confirmDiscard=async()=>!dirty||await confirmDialog('Existem alterações não salvas. Deseja descartá-las?');
  const listed=items.filter(item=>
    (statusFilter==='ALL'||item.status===statusFilter)&&
    (item.questionId+' '+(item.promptPreview||'')+' '+(item.moduleId||'')+' '+(item.topicId||''))
      .toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')));
  const newId=()=> 'questao-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,14);

  const reload=useCallback(async()=>{
    if(!validScope)return;
    const data=await req<Summary[]>(url);
    setItems(data);setHasMore(data.length===500);
  },[url,validScope]);
  useEffect(()=>{
    let active=true;
    if(!validScope)return;
    void req<Summary[]>(url).then(rows=>{if(active){setItems(rows);setHasMore(rows.length===500);}})
      .catch(()=>{if(active)setError('Banco indisponível. Verifique o acesso e a ativação em staging.');});
    return ()=>{active=false;};
  },[url,validScope]);
  function update<K extends keyof Content>(key:K,value:Content[K]){
    setForm(prev=>({...prev,[key]:value}));
    setDirty(true);
  }
  async function startNew(){
    if(!(await confirmDiscard()))return;
    setDirty(false);setCurrent(null);setQuestionId('questao-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,14));setForm(draft(trainingSourceSha256));
    setError('');setMessage('');
  }
  async function open(item:Summary){
    if(!canWrite||!(await confirmDiscard()))return;
    setBusy(true);setError('');setMessage('');
    try{
      const value=await req<Stored>(url+'/'+encodeURIComponent(item.questionId)+
        '/versoes/'+item.revision);
      setCurrent(value);setQuestionId(value.revision.questionId);setDirty(false);
      const r=value.revision;
      setForm({moduleId:r.moduleId,topicId:r.topicId,
        sourceUnitId:r.sourceUnitId,sourceSha256:r.sourceSha256,
        prompt:r.prompt,choices:r.choices.map(o=>({...o})),
        correctChoiceId:r.correctChoiceId,explanation:r.explanation,
        ...(r.difficulty?{difficulty:r.difficulty}:{})});
      if(r.sourceSha256!==trainingSourceSha256){
        setMessage('Questão criada para outra edição do conteúdo: confira antes de incluí-la numa prova desta edição.');
      }
    }catch{
      setError('Não foi possível abrir a versão desta questão.');
    }finally{setBusy(false);}
  }
  async function mutate(action:'save'|'review'|'publish'|'publish-confirmed'|'fork'){
    if(!canWrite)return;
    if(action==='save'&&createMode&&!form.correctChoiceId){
      setError('Selecione conscientemente a resposta correta antes de salvar.');
      return;
    }
    if(action==='save'&&createMode&&!form.difficulty){
      setError('Selecione o nível de dificuldade desta questão.');
      return;
    }
    if(action==='publish'){setShowReview(true);return;}
    setBusy(true);setError('');setMessage('');
    try{
      let result:Stored;
      if(createMode){
        if(action!=='save'||!idPattern.test(questionId))throw Error('QUESTION_ID_INVALID');
        result=await req<Stored>(url,'POST',{questionId,content:form});
      }else{
        const path=url+'/'+encodeURIComponent(current.revision.questionId)+
          '/versoes/'+current.revision.revision;
        if(action==='save'){
          if(current.revision.status!=='DRAFT')throw Error('VERSION_FROZEN');
          result=await req<Stored>(path,'PATCH',{
            expectedEditVersion:current.editVersion,changes:{...form,difficulty:difficultyForPatch(form.difficulty)},
          });
        }else if(action==='fork'){
          if(current.revision.status!=='PUBLISHED')throw Error('VERSION_NOT_PUBLISHED');
          result=await req<Stored>(path+'/nova-revisao','POST');
        }else{
          result=await req<Stored>(path+'/'+(action==='review'?'revisar':'publicar'),
            'POST',{expectedEditVersion:current.editVersion});
        }
      }
      setCurrent(result);setDirty(false);setShowReview(false);
      setQuestionId(result.revision.questionId);
      setForm({moduleId:result.revision.moduleId,topicId:result.revision.topicId,
        sourceUnitId:result.revision.sourceUnitId,sourceSha256:result.revision.sourceSha256,
        prompt:result.revision.prompt,choices:result.revision.choices.map(o=>({...o})),
        correctChoiceId:result.revision.correctChoiceId,explanation:result.revision.explanation,
        ...(result.revision.difficulty?{difficulty:result.revision.difficulty}:{})});
      await reload();
      setMessage(action==='save'?'Rascunho salvo.':
        action==='review'?'Enviada à revisão.':
        action==='publish-confirmed'?'Nova versão publicada.':'Nova revisão editável criada.');
    }catch{
      setError('A operação não foi confirmada. Recarregue a questão antes de tentar novamente.');
    }finally{setBusy(false);}
  }
  const downloadTemplate=()=>{
    const href=URL.createObjectURL(new Blob(['﻿'+examQuestionTemplate],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=href;link.download='modelo-questoes-airtrust.csv';
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1500);
  };
  const selectCsv=async(file:File|undefined)=>{
    setImportRows([]);setError('');
    if(!file)return;
    try{setImportRows(parseQuestionCsv(await file.text(),trainingSourceSha256));}
    catch(e){setError((e as Error).message);}
  };
  const importDrafts=async()=>{
    if(busy||!importRows.length)return;
    if(!(await confirmDialog('Importar '+importRows.length+' novas questões como rascunhos? Nenhuma será publicada automaticamente.')))return;
    setBusy(true);setError('');setMessage('');
    let count=0;
    try{
      for(const item of importRows){await req(url,'POST',item);count++;}
      await reload();setImportRows([]);
      setMessage(count+' rascunhos importados. Revise e publique individualmente.');
    }catch{
      await reload().catch(()=>{});
      setError(count+' questões criadas; a importação parou. Verifique as questões pendentes.');
      setImportRows([]);
    }finally{setBusy(false);}
  };
  const duplicate=async()=>{
    if(!current||!(await confirmDiscard()))return;
    setCurrent(null);setQuestionId(newId());setForm({...form,choices:form.choices.map(c=>({...c}))});
    setDirty(true);setMessage('Cópia local. Revise as alternativas e salve como nova questão.');setError('');
  };
  if(!validScope)return <p role="alert">Selecione um curso e uma edição válida para editar questões.</p>;
  const frozen=current!==null&&current.revision.status!=='DRAFT';
  return (
    <section className="space-y-5" aria-label="Banco de Questões">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Banco de Questões</h2>
          <p className={examMuted}>Administração independente dos arquivos SCORM. Curso #{courseId}.</p>
        </div>
        <button type="button" className={examSecondary} onClick={startNew} disabled={busy}>
          Nova questão
        </button>
      </header>
      <details className={examCard}>
        <summary className="cursor-pointer font-semibold">Importação assistida (CSV, somente rascunhos)</summary>
        <p className={examMuted+' mt-2'}>Use o modelo, valide até 30 questões por lote e revise os rascunhos. O sistema não publica provas nem altera matrículas.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={examSecondary} onClick={downloadTemplate}>Baixar modelo CSV</button>
          <label className="text-sm">Escolher CSV
            <input type="file" accept=".csv,text/csv" className={examInput+' mt-1'} disabled={busy} onChange={e=>void selectCsv(e.target.files?.[0])}/>
          </label>
        </div>
        {importRows.length>0&&<div className="mt-3 rounded-lg border border-emerald-300 p-3 text-sm dark:border-emerald-700">
          <p className="font-semibold">{importRows.length} questões validadas antes de criar rascunhos</p>
          <ol className="mt-2 list-inside list-decimal space-y-1">{importRows.map(q=>
            <li key={q.questionId}>{q.content.prompt} · {q.content.moduleId} · {q.content.difficulty}</li>)}</ol>
          <button type="button" className={examPrimary+' mt-3'} disabled={busy} onClick={()=>void importDrafts()}>Importar rascunhos validados</button>
        </div>}
      </details>
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className={examCard} aria-label="Versões disponíveis">
          <h3 className="font-semibold">Questões e versões</h3>
          <label className="block text-sm">Buscar código, enunciado, módulo ou assunto
            <input className={examInput+' mt-1'} value={filter} onChange={e=>setFilter(e.target.value)} />
          </label>
          <label className="block text-sm">Situação
            <select className={examInput+' mt-1'} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="ALL">Todas</option><option value="DRAFT">Rascunho</option><option value="REVIEWED">Em revisão</option><option value="PUBLISHED">Publicadas</option>
            </select>
          </label>
          {items.length===0&&<p className={examMuted}>Nenhuma questão cadastrada.</p>}
          {listed.map(item=>(
            <button key={item.questionId+':'+item.revision} type="button"
              className="block min-h-11 w-full rounded-lg border border-slate-200 p-3 text-left text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:border-slate-600 dark:hover:bg-slate-800"
              disabled={busy} onClick={()=>void open(item)}>
              <span className="block font-medium">{item.promptPreview||item.questionId}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{item.moduleId||'Módulo não identificado'} · {item.topicId||'Sem assunto'} · {item.difficulty||'Sem nível'}</span>
              <span className="block text-xs">{item.questionId} · v{item.revision}</span>
              <span className="text-slate-600 dark:text-slate-300">{statusLabel[item.status]||item.status}</span>
            </button>
          ))}
          {hasMore&&<button type="button" className={examSecondary} disabled={busy}
            onClick={()=>void req<Summary[]>(url+'?offset='+items.length).then(rows=>{
              setItems(old=>[...old,...rows]);setHasMore(rows.length===500);
            }).catch(()=>setError('Não foi possível carregar mais questões.'))}>Carregar mais questões</button>}
        </aside>
        <div className={examCard}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{createMode?'Nova questão':'Edição da questão'}</h2>
            <span className="text-sm text-slate-600 dark:text-slate-300">{createMode?'RASCUNHO':
              current.revision.status+' · v'+current.revision.revision}</span>
          </div>
          {error&&<p role="alert" tabIndex={-1} ref={errorRef}
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
          {message&&<p role="status" className="text-sm text-emerald-800 dark:text-emerald-200">{message}</p>}
          <ol aria-label="Etapas editoriais da questão" className="flex flex-wrap gap-2 text-xs">
            {['DRAFT','REVIEWED','PUBLISHED'].map((state,i)=><li key={state}
              className={'rounded-full border px-3 py-1.5 '+((current?.revision.status||'DRAFT')===state?
                'border-primary-800 bg-primary-50 font-semibold text-primary-800 dark:bg-slate-800 dark:text-primary-100':
                'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400')}>
                {i+1}. {statusLabel[state]}</li>)}
          </ol>
          {current&&<details className="text-xs text-slate-600 dark:text-slate-300">
            <summary className="cursor-pointer">Rastreabilidade editorial desta versão</summary>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <div>Criada por: {current.revision.createdBy||'Não informado'}</div>
              <div>Editada por: {current.revision.lastEditedBy||'Não informado'}</div>
              <div>Revisada por: {current.revision.reviewedBy||'Pendente'}</div>
              <div>Publicada por: {current.revision.publishedBy||'Pendente'}</div>
            </dl>
          </details>}
          <div className="grid gap-3 md:grid-cols-2">
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Código interno da questão</summary>
              <input className={examInput+' mt-1'} value={questionId}
                aria-label="Identificador da questão" disabled={!createMode||busy}
                onChange={e=>{setQuestionId(e.target.value);setDirty(true);}}/>
            </details>
            <label className="text-sm">Módulo
              <input className={examInput+' mt-1'} value={form.moduleId}
                disabled={frozen||busy} onChange={e=>update('moduleId',e.target.value)}/>
            </label>
            <label className="text-sm">Assunto
              <input className={examInput+' mt-1'} value={form.topicId}
                disabled={frozen||busy} onChange={e=>update('topicId',e.target.value)}/>
            </label>
            <label className="text-sm">Nível de dificuldade
              <select className={examInput+' mt-1'} value={form.difficulty||''}
                aria-label="Nível de dificuldade da questão" aria-invalid={createMode&&error.includes('dificuldade')} disabled={frozen||busy}
                onChange={e=>update('difficulty',normalizeQuestionDifficulty(e.target.value))}>
                <option value="">Selecione a dificuldade</option>
                <option value="BASICA">Básica</option>
                <option value="INTERMEDIARIA">Intermediária</option>
                <option value="AVANCADA">Avançada</option>
              </select>
            </label>
            <label className="text-sm">Unidade do material de origem
              <input className={examInput+' mt-1'} value={form.sourceUnitId}
                disabled={frozen||busy} onChange={e=>update('sourceUnitId',e.target.value)}/>
            </label>
          </div>
          <label className="block text-sm">Enunciado
            <textarea rows={3} className={examInput+' mt-1'} value={form.prompt}
              disabled={frozen||busy} onChange={e=>update('prompt',e.target.value)}/>
          </label>
          <fieldset className="space-y-2" aria-invalid={createMode&&error.includes("resposta correta")}>
            <legend className="font-medium">Alternativas (selecione a correta)</legend>
            {form.choices.map((option,i)=>(
              <div className="flex items-center gap-2" key={option.id}>
                <input type="radio" name="correct-answer" value={option.id}
                  aria-label={'Resposta correta: alternativa '+(i+1)}
                  checked={form.correctChoiceId===option.id}
                  disabled={frozen||busy}
                  onChange={()=>update('correctChoiceId',option.id)}/>
                <input aria-label={'Alternativa '+(i+1)}
                  className={examInput} value={option.text}
                  disabled={frozen||busy} onChange={e=>
                    update('choices',form.choices.map((x,j)=>
                      i===j?{...x,text:e.target.value}:x))}/>
              </div>
            ))}
          </fieldset>
          <label className="block text-sm">Explicação da resposta correta
            <textarea rows={3} className={examInput+' mt-1'} value={form.explanation}
              disabled={frozen||busy} onChange={e=>update('explanation',e.target.value)}/>
          </label>
          <p className="text-xs text-slate-600">Questões publicadas são imutáveis. Para corrigir uma questão já utilizada, crie uma nova revisão.</p>
          {showReview&&<div role="alertdialog" aria-label="Revisão final do gabarito" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            <h3 className="font-semibold">Confirme o gabarito antes de publicar</h3>
            <p className="mt-2">Enunciado: {form.prompt}</p>
            <p className="mt-2">Resposta correta: {form.choices.find(c=>c.id===form.correctChoiceId)?.text||'Não selecionada'}</p>
            <p className="mt-1">A publicação é imutável; futuras correções exigem nova revisão.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={examPrimary} disabled={!form.correctChoiceId||busy} onClick={()=>{setShowReview(false);void mutate('publish-confirmed');}}>Confirmar gabarito e publicar</button>
              <button type="button" className={examSecondary} onClick={()=>setShowReview(false)}>Voltar à edição</button>
            </div>
          </div>}
          <div className="flex flex-wrap gap-2">
            {!frozen&&<button type="button" disabled={!canWrite}
              className={examPrimary}
              onClick={()=>void mutate('save')}>Salvar rascunho</button>}
            {current&&<button type="button" className={examSecondary} disabled={busy} onClick={duplicate}>Duplicar questão</button>}
            {current?.revision.status==='DRAFT'&&
              <button type="button" className={examSecondary} disabled={!canWrite}
                onClick={()=>void mutate('review')}>Enviar para revisão</button>}
            {current?.revision.status==='REVIEWED'&&
              <button type="button" className={examSecondary} disabled={!canWrite}
                onClick={()=>void mutate('publish')}>Publicar versão</button>}
            {current?.revision.status==='PUBLISHED'&&
              <button type="button" className={examSecondary} disabled={!canWrite}
                onClick={()=>void mutate('fork')}>Criar nova revisão</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
