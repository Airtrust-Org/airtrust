/**
 * Standalone LMS question bank administration. Not yet registered in App.tsx:
 * F4 owns that file until its Player 3 integration has been coordinated.
 * Requires a staged, approved read/write API and an authenticated admin route.
 */
import {useCallback,useEffect,useState} from 'react';
import {API_BASE_URL,fetchWithAuth} from '../../../config/api';

type Choice={id:string;text:string};
type Content={
  moduleId:string;topicId:string;sourceUnitId:string;sourceSha256:string;
  prompt:string;choices:Choice[];correctChoiceId:string;explanation:string;
};
type Revision=Content&{
  questionId:string;revision:number;status:'DRAFT'|'REVIEWED'|'PUBLISHED';
  contentSha256:string|null;
};
type Stored={revision:Revision;editVersion:number};
type Summary={questionId:string;revision:number;status:string;updatedAt:string};
type ResponseBody<T>={success:boolean;data?:T;code?:string};
const shaPattern=/^[a-f0-9]{64}$/;
const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const defaultOptions=():Choice[]=>[
  {id:'o1',text:''},{id:'o2',text:''},{id:'o3',text:''},{id:'o4',text:''},
];
function draft(sourceSha256:string):Content{
  return {moduleId:'',topicId:'',sourceUnitId:'',sourceSha256,
    prompt:'',choices:defaultOptions(),correctChoiceId:'o1',explanation:''};
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
  courseId,trainingSourceSha256,
}:{
  /** Tenant/course selection is authorized by the API, never by this prop. */
  courseId:number;trainingSourceSha256:string;
}){
  const [items,setItems]=useState<Summary[]>([]);
  const [current,setCurrent]=useState<Stored|null>(null);
  const [questionId,setQuestionId]=useState('');
  const [form,setForm]=useState<Content>(()=>draft(trainingSourceSha256));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const validScope=Number.isSafeInteger(courseId)&&courseId>0&&
    shaPattern.test(trainingSourceSha256);
  const url=API_BASE_URL+'/lms/exams/admin/cursos/'+courseId+'/questoes';
  const canWrite=!busy&&validScope;
  const createMode=current===null;

  const reload=useCallback(async()=>{
    if(!validScope)return;
    setItems(await req<Summary[]>(url));
  },[url,validScope]);
  useEffect(()=>{
    let active=true;
    if(!validScope)return;
    void req<Summary[]>(url).then(rows=>{if(active)setItems(rows);})
      .catch(()=>{if(active)setError('Banco indisponível. Verifique o acesso e a ativação em staging.');});
    return ()=>{active=false;};
  },[url,validScope]);
  function update<K extends keyof Content>(key:K,value:Content[K]){
    setForm(prev=>({...prev,[key]:value}));
  }
  function startNew(){
    setCurrent(null);setQuestionId('');setForm(draft(trainingSourceSha256));
    setError('');setMessage('');
  }
  async function open(item:Summary){
    if(!canWrite)return;
    setBusy(true);setError('');setMessage('');
    try{
      const value=await req<Stored>(url+'/'+encodeURIComponent(item.questionId)+
        '/versoes/'+item.revision);
      if(value.revision.sourceSha256!==trainingSourceSha256){
        throw Error('EDIÇÃO DE CURSO INCOMPATÍVEL');
      }
      setCurrent(value);setQuestionId(value.revision.questionId);
      const r=value.revision;
      setForm({moduleId:r.moduleId,topicId:r.topicId,
        sourceUnitId:r.sourceUnitId,sourceSha256:r.sourceSha256,
        prompt:r.prompt,choices:r.choices.map(o=>({...o})),
        correctChoiceId:r.correctChoiceId,explanation:r.explanation});
    }catch{
      setError('Não foi possível abrir a versão desta questão.');
    }finally{setBusy(false);}
  }
  async function mutate(action:'save'|'review'|'publish'|'fork'){
    if(!canWrite)return;
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
            expectedEditVersion:current.editVersion,changes:form,
          });
        }else if(action==='fork'){
          if(current.revision.status!=='PUBLISHED')throw Error('VERSION_NOT_PUBLISHED');
          result=await req<Stored>(path+'/nova-revisao','POST');
        }else{
          result=await req<Stored>(path+'/'+(action==='review'?'revisar':'publicar'),
            'POST',{expectedEditVersion:current.editVersion});
        }
      }
      setCurrent(result);
      setQuestionId(result.revision.questionId);
      setForm({moduleId:result.revision.moduleId,topicId:result.revision.topicId,
        sourceUnitId:result.revision.sourceUnitId,sourceSha256:result.revision.sourceSha256,
        prompt:result.revision.prompt,choices:result.revision.choices.map(o=>({...o})),
        correctChoiceId:result.revision.correctChoiceId,explanation:result.revision.explanation});
      await reload();
      setMessage(action==='save'?'Rascunho salvo.':
        action==='review'?'Enviada à revisão.':
        action==='publish'?'Nova versão publicada.':'Nova revisão editável criada.');
    }catch{
      setError('A operação não foi confirmada. Recarregue a questão antes de tentar novamente.');
    }finally{setBusy(false);}
  }
  if(!validScope)return <p role="alert">Selecione um curso e uma edição válida para editar questões.</p>;
  const frozen=current!==null&&current.revision.status!=='DRAFT';
  return (
    <section className="mx-auto max-w-6xl space-y-5 p-5" aria-label="Banco de Questões">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Banco de Questões</h1>
          <p className="text-sm text-slate-600">Administração independente dos arquivos SCORM. Curso #{courseId}.</p>
        </div>
        <button type="button" className="rounded border px-3 py-2" onClick={startNew} disabled={busy}>
          Nova questão
        </button>
      </header>
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-xl border p-3" aria-label="Versões disponíveis">
          <h2 className="font-semibold">Questões e versões</h2>
          {items.length===0&&<p className="text-sm text-slate-600">Nenhuma questão cadastrada.</p>}
          {items.map(item=>(
            <button key={item.questionId+':'+item.revision} type="button"
              className="block w-full rounded border p-2 text-left text-sm hover:bg-slate-50"
              disabled={busy} onClick={()=>void open(item)}>
              <span className="block font-medium">{item.questionId} · v{item.revision}</span>
              <span className="text-slate-600">{item.status}</span>
            </button>
          ))}
        </aside>
        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{createMode?'Nova questão':'Edição da questão'}</h2>
            <span className="text-sm text-slate-600">{createMode?'RASCUNHO':
              current.revision.status+' · v'+current.revision.revision}</span>
          </div>
          {error&&<p role="alert" className="rounded border border-red-300 p-2 text-sm text-red-700">{error}</p>}
          {message&&<p role="status" className="text-sm text-green-700">{message}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">Identificador da questão
              <input className="mt-1 w-full rounded border p-2" value={questionId}
                disabled={!createMode||busy} onChange={e=>setQuestionId(e.target.value)}/>
            </label>
            <label className="text-sm">Módulo
              <input className="mt-1 w-full rounded border p-2" value={form.moduleId}
                disabled={frozen||busy} onChange={e=>update('moduleId',e.target.value)}/>
            </label>
            <label className="text-sm">Assunto
              <input className="mt-1 w-full rounded border p-2" value={form.topicId}
                disabled={frozen||busy} onChange={e=>update('topicId',e.target.value)}/>
            </label>
            <label className="text-sm">Unidade do material de origem
              <input className="mt-1 w-full rounded border p-2" value={form.sourceUnitId}
                disabled={frozen||busy} onChange={e=>update('sourceUnitId',e.target.value)}/>
            </label>
          </div>
          <label className="block text-sm">Enunciado
            <textarea rows={3} className="mt-1 w-full rounded border p-2" value={form.prompt}
              disabled={frozen||busy} onChange={e=>update('prompt',e.target.value)}/>
          </label>
          <fieldset className="space-y-2">
            <legend className="font-medium">Alternativas (selecione a correta)</legend>
            {form.choices.map((option,i)=>(
              <div className="flex items-center gap-2" key={option.id}>
                <input type="radio" name="correct-answer" value={option.id}
                  aria-label={'Resposta correta: alternativa '+(i+1)}
                  checked={form.correctChoiceId===option.id}
                  disabled={frozen||busy}
                  onChange={()=>update('correctChoiceId',option.id)}/>
                <input aria-label={'Alternativa '+(i+1)}
                  className="w-full rounded border p-2" value={option.text}
                  disabled={frozen||busy} onChange={e=>
                    update('choices',form.choices.map((x,j)=>
                      i===j?{...x,text:e.target.value}:x))}/>
              </div>
            ))}
          </fieldset>
          <label className="block text-sm">Explicação da resposta correta
            <textarea rows={3} className="mt-1 w-full rounded border p-2" value={form.explanation}
              disabled={frozen||busy} onChange={e=>update('explanation',e.target.value)}/>
          </label>
          <p className="text-xs text-slate-600">Questões publicadas são imutáveis. Para corrigir uma questão já utilizada, crie uma nova revisão.</p>
          <div className="flex flex-wrap gap-2">
            {!frozen&&<button type="button" disabled={!canWrite}
              className="rounded bg-blue-900 px-4 py-2 text-white disabled:opacity-50"
              onClick={()=>void mutate('save')}>Salvar rascunho</button>}
            {current?.revision.status==='DRAFT'&&
              <button type="button" className="rounded border px-3 py-2" disabled={!canWrite}
                onClick={()=>void mutate('review')}>Enviar para revisão</button>}
            {current?.revision.status==='REVIEWED'&&
              <button type="button" className="rounded border px-3 py-2" disabled={!canWrite}
                onClick={()=>void mutate('publish')}>Publicar versão</button>}
            {current?.revision.status==='PUBLISHED'&&
              <button type="button" className="rounded border px-3 py-2" disabled={!canWrite}
                onClick={()=>void mutate('fork')}>Criar nova revisão</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
