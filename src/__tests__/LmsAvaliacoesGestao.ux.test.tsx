// @vitest-environment jsdom
import React from 'react';
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import LmsAvaliacoesGestao from '../react-app/pages/lms/exams/LmsAvaliacoesGestao';
import {fetchWithAuth} from '../react-app/config/api';
vi.mock('../react-app/config/api',()=>({fetchWithAuth:vi.fn()}));
vi.mock('../react-app/components/AppLayout',()=>({default:({children}:{children:React.ReactNode})=><main>{children}</main>}));
const fetchMock=vi.mocked(fetchWithAuth);
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
const course={
 id:26,titulo:'CRM Sintético',tipo_conteudo:'scorm',publicado:1,
 scorm_assessment_policy:'FORMATIVE',
 activePackageSha256:'a'.repeat(64),activeExamId:null,activeExamVersion:null,
};
const overview={
 courses:[course],questionCounts:[{curso_id:26,status:'PUBLISHED',total:10}],
 plans:[{cursoId:26,examId:'prova-crm',version:1,title:'Avaliação CRM',questionCount:10,publishedAt:'2026-11-20'}],
 bindings:[{cursoId:26,examId:'prova-crm',version:1,packageSha256:'b'.repeat(64),createdAt:'2026-11-19'}],
 totals:{attempts:5,passed:3,failed:1,inProgress:1},
 attempts:[],attemptsTruncated:false,coursesTruncated:false,plansTruncated:true,
};
const attempt={
 cursoId:26,cursoTitulo:'CRM Sintético',matriculaId:123,examId:'prova-crm',
 version:1,attemptNo:2,state:'SUBMITTED',passed:true,scorePct:82,
 alunoNome:'Aluno Sintético',startedAt:'2026-11-20 11:30:00',submittedAt:'2026-11-20 11:40:00',
};
const renderPage=()=>render(<MemoryRouter><LmsAvaliacoesGestao/></MemoryRouter>);
describe('Gestão de Avaliações, responsividade e transparência',()=>{
 beforeEach(()=>{
  fetchMock.mockReset();
  fetchMock.mockImplementation(async url=>{
   if(String(url).includes('/admin/overview'))return ok(overview);
   if(String(url).includes('/admin/resultados'))return ok({page:1,limit:25,total:1,pages:1,items:[attempt]});
   throw Error('Unexpected URL '+url);
  });
 });
 afterEach(()=>cleanup());
 it('não confunde vínculo de edição antiga com prova ativa e não chama números parciais de totais',async()=>{
  renderPage();
  await waitFor(()=>expect(screen.getAllByText('CRM Sintético').length).toBeGreaterThanOrEqual(1));
  expect(screen.getByText('Provas exibidas')).toBeTruthy();
  expect(screen.getByText('Vínculos exibidos')).toBeTruthy();
  expect(screen.getByText(/3 \/ 4/)).toBeTruthy();
  expect(screen.getAllByRole('status').some(s=>s.textContent?.includes('Catálogo parcial'))).toBe(true);
  expect(screen.queryByText('Prova ativa nesta edição')).toBeNull();
  expect(screen.getAllByText(/Vínculo em outra edição|Prova vinculada somente a outra edição/).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByRole('link',{name:'Vincular prova'})[0].getAttribute('href'))
    .toBe('/lms/admin/provas/26');
 });
 it('nunca disponibiliza CSV parcial quando nova tentativa desloca uma página e duplica ID',async()=>{
  const pageItems=(ids:string[])=>ids.map((attemptId,i)=>({
    ...attempt,attemptId,matriculaId:200+i,alunoNome:'Aluno '+attemptId,
  }));
  const first=pageItems(Array.from({length:25},(_,i)=>'id-'+(50-i)));
  const shifted=pageItems(Array.from({length:25},(_,i)=>'id-'+(26-i)));
  let pageRequests=0;
  fetchMock.mockImplementation(async url=>{
    if(String(url).includes('/admin/overview'))return ok(overview);
    if(String(url).includes('/admin/resultados')){
      pageRequests++;
      if(pageRequests<3)return ok({page:1,limit:25,total:50,pages:2,items:first});
      return ok({page:2,limit:25,total:50,pages:2,items:shifted});
    }
    throw Error('Unexpected URL '+url);
  });
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
  const blob=vi.fn(()=> 'blob:fake');
  const originalUrlCreator=Object.getOwnPropertyDescriptor(URL,'createObjectURL');
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:blob});
  renderPage();
  await waitFor(()=>expect(screen.getAllByText('CRM Sintético').length).toBeGreaterThanOrEqual(1));
  fireEvent.click(screen.getByRole('button',{name:'Resultados e notas'}));
  await screen.findByRole('button',{name:'Exportar filtro completo'});
  await waitFor(()=>expect(screen.getAllByText('Aluno id-50').length).toBeGreaterThanOrEqual(1));
  fireEvent.click(screen.getByRole('button',{name:'Exportar filtro completo'}));
  await screen.findByText(/Nenhum CSV parcial foi disponibilizado/);
  expect(pageRequests).toBe(3);
  expect(blob).not.toHaveBeenCalled();
  if(originalUrlCreator)Object.defineProperty(URL,'createObjectURL',originalUrlCreator);
  else Reflect.deleteProperty(URL,'createObjectURL');
  confirm.mockRestore();
 });
 it('apresenta resultado, detalhamento autorizado e não expõe respostas',async()=>{
  renderPage();
  await waitFor(()=>expect(screen.getAllByText('CRM Sintético').length).toBeGreaterThanOrEqual(1));
  fireEvent.click(screen.getByRole('button',{name:'Resultados e notas'}));
  await waitFor(()=>expect(screen.getAllByText('Aluno Sintético').length).toBeGreaterThanOrEqual(1));
  const details=screen.getAllByRole('button',{name:'Detalhar tentativa'});
  fireEvent.click(details[0]);
  expect(screen.getByRole('region',{name:'Detalhes da tentativa'}).textContent)
    .toMatch(/Matrícula|Resultado|82%/);
  expect(screen.queryByText('correctChoiceId')).toBeNull();
  expect(fetchMock.mock.calls.every(([url])=>!String(url).includes('gabarito'))).toBe(true);
 });
});
