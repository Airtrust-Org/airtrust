/** Gestão central de avaliações do LMS. Não concede certificados nem expõe gabaritos. */
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {BookOpen,ClipboardList,RefreshCw,Search,ShieldAlert} from 'lucide-react';
import AppLayout from '../../../components/AppLayout';
import {ExamPageHeader,ExamEmpty,examPage,examCard,examInput,examPrimary,examSecondary,examSmall} from './examUi';
import {fetchWithAuth} from '../../../config/api';
import {buildExamResultsCsv} from './examReportCsv';
import {ExamExportIntegrity} from './examExportIntegrity';

type Course={id:number;titulo:string;tipo_conteudo:string;scorm_assessment_policy:string|null;publicado:number;activePackageSha256:string|null;activeExamId:string|null;activeExamVersion:number|null};
type Plan={cursoId:number;examId:string;version:number;title:string|null;questionCount:number|null;publishedAt:string};
type Binding={cursoId:number;examId:string;version:number;packageSha256:string;createdAt:string};
type QuestionCount={curso_id:number;status:string;total:number};
type Attempt={attemptId?:string;cursoId:number;matriculaId:number;examId:string;version:number;attemptNo:number;
 state:string;passed:boolean|null;scorePct:number|null;alunoNome:string|null;startedAt:string;submittedAt:string|null};
type Overview={courses:Course[];questionCounts:QuestionCount[];plans:Plan[];bindings:Binding[];
 totals:{attempts:number;passed:number;failed:number;inProgress:number};
 attempts:Attempt[];attemptsTruncated:boolean;coursesTruncated:boolean;plansTruncated:boolean};
type Envelope={success:boolean;code?:string;data?:Overview};
type ReportRow=Attempt&{cursoTitulo:string|null;sections?:{moduleId:string;scorePct:number;minScorePct:number}[]};
type Report={page:number;limit:number;total:number;pages:number;items:ReportRow[]};
type ReportEnvelope={success:boolean;code?:string;data?:Report};
const panel=examCard;
const control=examSecondary;
const datetime=(s:string|null)=>s?new Date(s.includes('T')?s:s.replace(' ','T')+'Z').toLocaleString('pt-BR'):'—';

export default function LmsAvaliacoesGestao(){
 const [data,setData]=useState<Overview|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [tab,setTab]=useState<'provas'|'resultados'|'ajuda'>('provas');
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState<'todos'|'vinculados'|'sem-vinculo'>('todos');
 const [course,setCourse]=useState('todos');
 const [resultFilter,setResultFilter]=useState('todos');
 const [resultSearch,setResultSearch]=useState('');
 const [debouncedSearch,setDebouncedSearch]=useState('');
 const [exporting,setExporting]=useState(false);
 const [selectedAttempt,setSelectedAttempt]=useState<ReportRow|null>(null);
 const [resultPage,setResultPage]=useState(1);
 const [reportRefresh,setReportRefresh]=useState(0);
 const [report,setReport]=useState<Report|null>(null);
 const [reportLoading,setReportLoading]=useState(false);
 const [reportError,setReportError]=useState('');
 useEffect(()=>{const t=window.setTimeout(()=>setDebouncedSearch(resultSearch.trim()),400);return()=>window.clearTimeout(t);},[resultSearch]);
 useEffect(()=>{
  if(tab!=='resultados'||!data)return;
  let active=true;
  setReportLoading(true);setReportError('');setReport(null);
  const query=new URLSearchParams({
    page:String(resultPage),limit:'25',resultado:resultFilter,
    ...(course!=='todos'?{cursoId:course}:{}),
    ...(debouncedSearch?{busca:debouncedSearch}:{}),
  });
  void fetchWithAuth('/api/lms/exams/admin/resultados?'+query.toString(),{cache:'no-store'})
    .then(async response=>{
      const body=await response.json() as ReportEnvelope;
      if(!response.ok||!body.success||!body.data)throw Error(body.code||'EXAM_REPORT_UNAVAILABLE');
      if(active)setReport(body.data);
    }).catch(()=>{if(active)setReportError('Não foi possível carregar os resultados. Tente novamente.');})
    .finally(()=>{if(active)setReportLoading(false);});
  return()=>{active=false;};
 },[tab,data,course,resultFilter,debouncedSearch,resultPage,reportRefresh]);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const response=await fetchWithAuth('/api/lms/exams/admin/overview',{cache:'no-store'});
   const value=await response.json() as Envelope;
   if(!response.ok||!value.success||!value.data)throw Error(value.code||'Falha ao consultar avaliações');
   setData(value.data);setSelectedAttempt(null);
  }catch(e){setData(null);setError((e as Error).message);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const rows=useMemo(()=>{
  if(!data)return [];
  return data.courses.filter(c=>c.tipo_conteudo==='scorm').map(c=>({
   c,
   published:data.questionCounts.filter(q=>q.curso_id===c.id&&q.status==='PUBLISHED').reduce((n,q)=>n+q.total,0),
   draft:data.questionCounts.filter(q=>q.curso_id===c.id&&q.status!=='PUBLISHED').reduce((n,q)=>n+q.total,0),
   plans:data.plans.filter(p=>p.cursoId===c.id),
   binds:data.bindings.filter(b=>b.cursoId===c.id),
  }));
 },[data]);
 const visible=rows.filter(r=>
  (r.c.titulo.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))||String(r.c.id).includes(search))&&
  (filter==='todos'||(filter==='vinculados'?!!r.c.activeExamId:!r.c.activeExamId)));
 const attempts=report?.items||[];
 const names=new Map(data?.courses.map(c=>[c.id,c.titulo])||[]);
 const published=data?.questionCounts.filter(q=>q.status==='PUBLISHED').reduce((n,q)=>n+q.total,0)||0;
 const submitted=(data?.totals.passed||0)+(data?.totals.failed||0);
 const score=submitted?Math.round((data?.totals.passed||0)/submitted*100)+'%':'—';
 const exportAllFiltered=async()=>{
  if(!report?.total||exporting)return;
  if(report.pages>200){setReportError('O filtro excede 5.000 registros. Refine os filtros antes de exportar.');return;}
  if(!window.confirm('Exportar '+report.total+' tentativas dos filtros atuais? O CSV pode conter dados pessoais de alunos.'))return;
  setExporting(true);setReportError('');
  try{
   const snapshot=new ExamExportIntegrity<ReportRow>(report.total,report.pages,25);
   const pageQuery=(page:number)=>new URLSearchParams({page:String(page),limit:'25',resultado:resultFilter,
      ...(course!=='todos'?{cursoId:course}:{}),...(debouncedSearch?{busca:debouncedSearch}:{})});
   const getPage=async(page:number):Promise<Report>=>{
    const response=await fetchWithAuth('/api/lms/exams/admin/resultados?'+pageQuery(page).toString(),{cache:'no-store'});
    const body=await response.json() as ReportEnvelope;
    if(!response.ok||!body.success||!body.data)throw Error('EXAM_EXPORT_FETCH_FAILED');
    return body.data;
   };
   for(let page=1;page<=report.pages;page++){
    snapshot.add(await getPage(page));
   }
   snapshot.checkFinalPage(await getPage(1));
   const csv=buildExamResultsCsv([...snapshot.items()]);
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
   const link=document.createElement('a');
   link.href=url;link.download='airtrust-avaliacoes-filtro-completo.csv';
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch{setReportError('Os resultados mudaram durante a exportação ou não puderam ser confirmados. Nenhum CSV parcial foi disponibilizado. Atualize e tente novamente.');}
  finally{setExporting(false);}
 };
 const exportReportPage=()=>{
  if(!report?.items.length)return;
  const csv=buildExamResultsCsv(report.items.map(a=>({...a,cursoTitulo:a.cursoTitulo||names.get(a.cursoId)||null})));
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');
  link.href=url;link.download='airtrust-avaliacoes-pagina-'+report.page+'.csv';
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
 };
 return <AppLayout><div className={examPage}>
  <ExamPageHeader title="Gestão de Avaliações" description="Crie e organize provas, vincule edições autorizadas de EAD e acompanhe resultados."
    actions={<button type="button" className={examSecondary} disabled={loading} onClick={()=>void load()}><RefreshCw className="h-4 w-4" aria-hidden/> Atualizar</button>}/>
  {loading&&<p role="status">Carregando avaliações...</p>}
  {error&&<p role="alert" className="rounded-xl border border-amber-400 p-4 text-sm">
   <strong>Dados indisponíveis.</strong> {error==='QUESTION_BANK_NOT_ACTIVATED'?'Módulo ainda não habilitado para esta empresa.':error}
   {' '}Nenhum resultado foi presumido.</p>}
  {data&&<>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
    {[
     ['Provas exibidas',data.plans.length],['Vínculos exibidos',data.bindings.length],
     ['Questões exibidas',published],['Tentativas',data.totals.attempts],['Aprovação (submetidas)',score],
    ].map(([label,value])=><div className={panel} key={label}>
     <strong className="block text-2xl font-bold tabular-nums">{value}</strong>
     <span className={examSmall}>{label}{label==='Aprovação (submetidas)'&&submitted?' · '+data.totals.passed+' / '+submitted:''}</span>
    </div>)}
   </div>
   <nav aria-label="Seções de avaliações" className="flex flex-wrap gap-2 border-b pb-3">
    {([
     ['provas','Provas e bancos de questões'],['resultados','Resultados e notas'],['ajuda','Como funciona'],
    ] as const).map(([id,label])=><button type="button" key={id} aria-pressed={tab===id}
     className={'min-h-11 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary '+(tab===id?'bg-primary-800 text-white':'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')}
     onClick={()=>setTab(id)}>{label}</button>)}
   </nav>
   {tab==='provas'&&<section className={panel}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
     <div><h2 className="text-lg font-semibold">Avaliações por treinamento</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">Selecione um curso para criar questões, montar a prova e vinculá-la à edição de EAD.</p></div>
     <Link className={control} to="/lms/admin/cursos">Configurar cursos EAD</Link>
    </div>
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
     <label className="relative min-w-0"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/>
      <span className="sr-only">Buscar curso</span>
      <input className={examInput+' pl-9'} value={search} onChange={e=>setSearch(e.target.value)}
       placeholder="Buscar treinamento pelo nome ou número"/></label>
     <select aria-label="Filtrar cursos" className={examInput+" sm:w-auto"} value={filter}
      onChange={e=>setFilter(e.target.value as typeof filter)}>
      <option value="todos">Todos</option><option value="vinculados">Com prova na edição atual</option>
      <option value="sem-vinculo">Sem prova na edição atual</option>
     </select>
    </div>
    {(data.coursesTruncated||data.plansTruncated)&&<p role="status" className="text-sm text-amber-700">Catálogo parcial: o servidor aplicou limite de resultados.</p>}
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-sm">
     <thead className="border-b text-xs uppercase text-slate-500"><tr>
      <th className="py-3 pr-3">Treinamento</th><th>Questões</th><th>Provas</th><th>Situação</th><th className="text-right">Ação</th>
     </tr></thead>
     <tbody className="divide-y dark:divide-slate-800">{visible.map(({c,published,draft,plans,binds})=><tr key={c.id}>
      <td className="py-3 pr-3"><strong className="block">{c.titulo}</strong>
       <small className="text-slate-500">Curso #{c.id} · {c.publicado?'Publicado':'Não publicado'}</small></td>
      <td>{published} publicada(s)<small className="block text-slate-500 dark:text-slate-400">{draft} em preparação</small></td>
      <td>{plans.length} plano(s){plans[0]&&<small className="block text-slate-500 dark:text-slate-400">{plans[0].title||plans[0].examId}</small>}</td>
      <td>{c.activeExamId?
        <span className="font-medium text-emerald-700">Prova da edição atual: {c.activeExamId} v{c.activeExamVersion}</span>:
        !c.activePackageSha256?'Sem edição SCORM ativa':
        binds.length>0?'Prova vinculada somente a outra edição':
        plans.length?'Prova publicada — vínculo com edição atual pendente':'Prova final não configurada'}
       <small className="block text-slate-500 dark:text-slate-400">Política do SCORM: {c.scorm_assessment_policy||'Não definida'} · a exigência externa depende da edição homologada</small></td>
      <td className="text-right"><Link to={'/lms/admin/provas/'+c.id}
       className={examPrimary}>
       {c.activeExamId?'Gerenciar':plans.length?'Vincular prova':'Configurar prova'}</Link></td>
     </tr>)}</tbody>
    </table>{visible.length===0&&<p className="py-8 text-center text-slate-600">Nenhum curso encontrado.</p>}</div>
    <div className="space-y-3 md:hidden" aria-label="Treinamentos e situação das provas">
     {visible.map(({c,published,draft,plans,binds})=><article key={c.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="font-semibold text-slate-900 dark:text-white">{c.titulo}</h3>
      <p className={examSmall+' mt-1'}>Curso #{c.id} · {c.publicado?'Publicado':'Não publicado'}</p>
      <p className="mt-3 text-sm font-semibold">{c.activeExamId?'Prova ativa nesta edição':!c.activePackageSha256?'Sem edição ativa':binds.length?'Vínculo em outra edição':plans.length?'Plano publicado — vínculo pendente':'Prova não configurada'}</p>
      <p className={examSmall+' mt-1'}>{published} questões publicadas · {draft} em preparação</p>
      <Link to={'/lms/admin/provas/'+c.id} className={examPrimary+' mt-3 w-full'}>{c.activeExamId?'Gerenciar prova':plans.length?'Vincular prova':'Configurar prova'}</Link>
     </article>)}
     {visible.length===0&&<ExamEmpty title="Nenhum treinamento encontrado" details="Altere a busca ou o filtro."/>}
    </div>
   </section>}
   {tab==='resultados'&&<section className={panel}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
     <div><h2 className="text-lg font-semibold">Resultados das avaliações externas</h2>
      <p className="text-sm text-slate-600">Notas de provas submetidas; não confundir com progresso do SCORM.</p></div>
     <div className="flex flex-wrap gap-2">
      <select aria-label="Filtrar por treinamento" className={examInput} value={course}
        onChange={e=>{setCourse(e.target.value);setResultPage(1);setSelectedAttempt(null);}}>
       <option value="todos">Todos os treinamentos</option>
       {rows.map(({c})=><option key={c.id} value={c.id}>{c.titulo}</option>)}
      </select>
      <select aria-label="Filtrar por resultado" className={examInput} value={resultFilter}
        onChange={e=>{setResultFilter(e.target.value);setResultPage(1);setSelectedAttempt(null);}}>
       <option value="todos">Todos os resultados</option>
       <option value="aprovado">Aprovados</option>
       <option value="reprovado">Reprovados</option>
       <option value="andamento">Em andamento</option>
      </select>
      <button type="button" className={control} disabled={!report?.items.length||reportLoading||exporting}
        onClick={exportReportPage}>Exportar página CSV</button>
      <button type="button" className={examPrimary} disabled={!report?.total||reportLoading||exporting}
        onClick={()=>void exportAllFiltered()}>{exporting?'Preparando exportação...':'Exportar filtro completo'}</button>
     </div>
    </div>
    <label className="block pb-3 text-sm">
     <span className="sr-only">Buscar aluno, treinamento ou prova</span>
     <input className={examInput} value={resultSearch}
       onChange={e=>{setResultSearch(e.target.value);setResultPage(1);setSelectedAttempt(null);}}
       maxLength={80} placeholder="Buscar aluno, treinamento ou prova"/>
    </label>
    {reportLoading&&<p role="status" className="py-2 text-sm">Consultando resultados...</p>}
    {reportError&&<div role="alert" className="my-2 rounded border border-rose-300 p-3 text-sm">
      Relatório indisponível: {reportError}
      <button className="ml-3 underline" type="button" onClick={()=>setReportRefresh(n=>n+1)}>Tentar novamente</button>
    </div>}
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-sm">
     <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-3">Treinamento / Prova</th>
      <th>Aluno / Matrícula</th><th>Tentativa</th><th>Nota</th><th>Resultado</th><th>Data</th></tr></thead>
     <tbody className="divide-y dark:divide-slate-800">{attempts.map((a,i)=><tr key={[a.matriculaId,a.examId,a.version,a.attemptNo,i].join(':')}>
      <td className="py-3"><strong className="block">{a.cursoTitulo||names.get(a.cursoId)||'Curso #'+a.cursoId}</strong>
       <small className="text-slate-500">{a.examId} v{a.version}</small>
       <button className="mt-1 block min-h-10 text-sm font-medium text-primary-800 underline dark:text-primary-100" type="button" onClick={()=>setSelectedAttempt(a)}>Detalhar tentativa</button></td>
      <td><strong className="block">{a.alunoNome||"Aluno não identificado"}</strong><small className="text-slate-500">Matrícula #{a.matriculaId}</small></td><td>{a.attemptNo}</td>
      <td>{a.scorePct===null?'—':a.scorePct.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'}</td>
      <td>{a.state==='IN_PROGRESS'?'Em andamento':a.passed?'Aprovado':'Reprovado'}</td>
      <td>{datetime(a.submittedAt||a.startedAt)}</td>
     </tr>)}</tbody></table>
     {!reportLoading&&!reportError&&attempts.length===0&&<p className="py-8 text-center text-slate-600">Nenhuma tentativa registrada.</p>}
    </div>
    <div className="space-y-3 md:hidden" aria-label="Resultados de provas">
      {attempts.map(a=><article key={[a.matriculaId,a.examId,a.version,a.attemptNo].join(':')} className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
        <h3 className="font-semibold">{a.cursoTitulo||names.get(a.cursoId)||'Curso #'+a.cursoId}</h3>
        <p className="mt-1">{a.alunoNome||'Aluno não identificado'} · matrícula #{a.matriculaId}</p>
        <p className="mt-2 font-medium">{a.state==='IN_PROGRESS'?'Em andamento':a.passed?'Aprovado':'Reprovado'} · {a.scorePct===null?'Sem nota':a.scorePct.toLocaleString('pt-BR')+'%'}</p>
        <p className={examSmall+' mt-1'}>{datetime(a.submittedAt||a.startedAt)}</p>
        <button className="mt-2 min-h-11 font-medium text-primary-800 underline dark:text-primary-100" type="button" onClick={()=>setSelectedAttempt(a)}>Detalhar tentativa</button>
      </article>)}
    </div>
    {selectedAttempt&&<section aria-label="Detalhes da tentativa" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex justify-between gap-3"><h3 className="font-semibold">Tentativa {selectedAttempt.attemptNo} · {selectedAttempt.alunoNome||'Aluno não identificado'}</h3>
        <button type="button" className={control} onClick={()=>setSelectedAttempt(null)}>Fechar</button></div>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div><dt className="font-medium">Treinamento</dt><dd>{selectedAttempt.cursoTitulo||'Curso #'+selectedAttempt.cursoId}</dd></div>
        <div><dt className="font-medium">Prova e versão</dt><dd>{selectedAttempt.examId} · v{selectedAttempt.version}</dd></div>
        <div><dt className="font-medium">Matrícula</dt><dd>#{selectedAttempt.matriculaId}</dd></div>
        <div><dt className="font-medium">Resultado</dt><dd>{selectedAttempt.state==='IN_PROGRESS'?'Em andamento':selectedAttempt.passed?'Aprovado':'Reprovado'}</dd></div>
        <div><dt className="font-medium">Nota global</dt><dd>{selectedAttempt.scorePct===null?'Pendente':selectedAttempt.scorePct+'%'}</dd></div>
        <div><dt className="font-medium">Registro</dt><dd>{datetime(selectedAttempt.submittedAt||selectedAttempt.startedAt)}</dd></div>
      </dl>
      {selectedAttempt.sections?.length?<div className="mt-4">
        <h4 className="font-semibold">Desempenho por módulo</h4>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">{selectedAttempt.sections.map(section=>
          <li key={section.moduleId} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900">
            <strong>{section.moduleId}</strong>
            <p>Nota {section.scorePct}% · mínimo {section.minScorePct}%</p>
          </li>)}
        </ul>
      </div>:null}
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Notas e critérios extraídos do plano imutável da tentativa. Nenhuma resposta ou gabarito é exposto.</p>
    </section>}
    {report&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span role="status">{report.total} tentativa(s) no filtro · Página {report.page} de {Math.max(report.pages,1)}</span>
      <div className="flex gap-2">
       <button type="button" className={control} disabled={reportLoading||report.page<=1}
        onClick={()=>setResultPage(n=>Math.max(1,n-1))}>Anterior</button>
       <button type="button" className={control} disabled={reportLoading||report.page>=report.pages}
        onClick={()=>setResultPage(n=>n+1)}>Próxima</button>
      </div>
    </div>}
    <p className="mt-3 text-xs text-slate-500">Aprovação de prova não emite certificado isoladamente: a conclusão pertence ao LMS canônico.</p>
   </section>}
   {tab==='ajuda'&&<section className={panel}>
    <h2 className="mb-3 text-lg font-semibold">Fluxo de gestão de avaliações</h2>
    <ol className="list-inside list-decimal space-y-3 text-sm">
     <li>Selecione o curso e sua edição do conteúdo SCORM.</li>
     <li>Cadastre o banco de questões com assunto, módulo, nível de dificuldade e gabarito privado.</li>
     <li>Revise as questões, escolha quantidade e dificuldade e estabeleça as notas mínimas.</li>
     <li>Configure tentativas e tempo, publique o plano imutável e aprove o vínculo à edição.</li>
     <li>Após a conclusão do estudo, o player oferece a prova; a aprovação é verificada antes da conclusão do curso.</li>
    </ol>
    <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-300 p-4 text-sm">
     <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600"/>
     <p>Uma política SCORM <strong>SCORED</strong> não equivale a avaliação externa.
      O vínculo só é permitido para edição com manifesto físico validado no Worker
      em modo <strong>EXTERNAL</strong> e aprovação obrigatória. Cursos existentes não são modificados automaticamente.</p>
    </div>
   </section>}
  </>}
 </div></AppLayout>;
}
