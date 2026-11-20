// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import LmsExamAdmin from '../react-app/pages/lms/exams/LmsExamAdmin';
import {fetchWithAuth} from '../react-app/config/api';
vi.mock('../react-app/config/api',()=>({fetchWithAuth:vi.fn()}));
vi.mock('../react-app/hooks/useLms',()=>({useLmsCurso:()=>({data:{id:26,empresa_id:6,titulo:'Curso sintético'}})}));
vi.mock('../react-app/components/AppLayout',()=>({default:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('../react-app/pages/lms/exams/QuestionBankAdmin',()=>({default:()=> <div>Editor de questões</div>}));
const mocked=vi.mocked(fetchWithAuth);
const pkg='a'.repeat(64),edition='b'.repeat(64),source='c'.repeat(64);
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200});
const publishedQuestions=[{
  questionId:'q1',revision:1,moduleId:'m1',topicId:'safety',prompt:'Questão de segurança?',
  sourceSha256:source,contentSha256:'d'.repeat(64),
}];
const versions=[{packageSha256:pkg,packageVersion:'1.0',status:'ACTIVE',uploadedAt:'2026-11-02',
  boundExamId:null,boundExamVersion:null}];
const renderPage=()=>render(<MemoryRouter initialEntries={['/lms/admin/provas/26']}>
  <Routes><Route path="/lms/admin/provas/:cursoId" element={<LmsExamAdmin/>}/></Routes>
</MemoryRouter>);
describe('Administração de provas por edição',()=>{
  beforeEach(()=>{mocked.mockReset();
    mocked.mockImplementation(async url=>{
      if(String(url).endsWith('/edicoes'))return ok({editions:versions});
      if(String(url).endsWith('/cursos/26/provas'))return ok({items:[],hasMore:false});
      if(String(url).includes('/aptidao?packageSha256='))return ok({
        packageSha256:pkg,status:'ACTIVE',assessmentMode:'EXTERNAL',
        workerApprovalRequired:true,canBind:true,boundExamId:null,boundExamVersion:null,reason:null,
      });
      if(String(url).includes('/questoes-publicadas?'))return ok({items:publishedQuestions,nextOffset:null});
      return new Response(JSON.stringify({success:false,code:'UNEXPECTED'}),{status:422});
    });
  });
  afterEach(()=>cleanup());
  it('lista apenas questões publicadas e edições servidas pelo backend',async()=>{
    renderPage();
    expect(await screen.findByText('Questão de segurança?',{exact:false})).toBeTruthy();
    expect(screen.getByRole('option',{name:/1.0 · ACTIVE/})).toBeTruthy();
    expect(screen.queryByText('SEGREDO')).toBeNull();
    expect(mocked.mock.calls.some(([url])=>String(url).includes('questoes-publicadas'))).toBe(true);
  });
  it('seleção por dificuldade não inventa nota mínima de 80% para curso de 70%',async()=>{
    mocked.mockImplementation(async url=>{
      if(String(url).endsWith('/edicoes'))return ok({editions:versions});
      if(String(url).endsWith('/cursos/26/provas'))return ok({items:[],hasMore:false});
      if(String(url).includes('/aptidao?'))return ok({
        packageSha256:pkg,status:'ACTIVE',assessmentMode:'EXTERNAL',
        workerApprovalRequired:true,canBind:true,boundExamId:null,boundExamVersion:null,reason:null,
      });
      if(String(url).includes('/questoes-publicadas?'))return ok({
        items:[{...publishedQuestions[0],difficulty:'BASICA'}],nextOffset:null,
      });
      return new Response(JSON.stringify({success:false,code:'UNEXPECTED'}),{status:422});
    });
    renderPage();
    await screen.findByText('Questão de segurança?',{exact:false});
    fireEvent.change(screen.getByLabelText('Quantidade BASICA'),{target:{value:'1'}});
    fireEvent.click(screen.getByRole('button',{name:'Selecionar questões'}));
    const minimum=screen.getByLabelText('Nota mínima de m1') as HTMLInputElement;
    expect(minimum.value).toBe('');
    expect(screen.getAllByRole('status').some(el=>el.textContent?.includes('nota mínima autorizada'))).toBe(true);
  });

  it('exige nota mínima e confirmação editorial antes de publicar plano; não vincula automaticamente',async()=>{
    renderPage();
    await screen.findByText('Questão de segurança?',{exact:false});
    await screen.findByText(/Edição apta para vincular prova externa/);
    expect((screen.getByLabelText('Edição do pacote SCORM') as HTMLSelectElement).value).toBe(pkg);
    fireEvent.change(screen.getByLabelText('Nome da prova'),{target:{value:'Avaliação Final de CRM'}});
    fireEvent.click(screen.getByText('Configurações avançadas e rastreabilidade'));
    fireEvent.change(screen.getByLabelText('Identificador da prova'),{target:{value:'prova-crm-v1'}});
    fireEvent.change(screen.getByLabelText('SHA-256 da edição aprovada'),{target:{value:edition}});
    fireEvent.click(screen.getByLabelText('Incluir q1 v1'));
    fireEvent.click(screen.getByRole('button',{name:'Publicar plano imutável'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('NOTA_MÍNIMA'));
    fireEvent.change(screen.getByLabelText('Nota mínima de m1'),{target:{value:'70'}});
    fireEvent.change(screen.getByLabelText('Número máximo de tentativas'),{target:{value:'3'}});
    fireEvent.change(screen.getByLabelText('Intervalo entre tentativas'),{target:{value:'0'}});
    fireEvent.change(screen.getByLabelText('Limite de tempo da prova'),{target:{value:'30'}});
    fireEvent.click(screen.getByText(/Confirmo a cobertura do conteúdo/));
    mocked.mockImplementation(async (url,init)=>{
      if(String(url).endsWith('/provas')&&init?.method==='POST')return ok({planSha256:'e'.repeat(64)});
      if(String(url).endsWith('/edicoes'))return ok({editions:versions});
      if(String(url).endsWith('/cursos/26/provas'))return ok({items:[],hasMore:false});
      if(String(url).includes('/aptidao?packageSha256='))return ok({
        packageSha256:pkg,status:'ACTIVE',assessmentMode:'EXTERNAL',
        workerApprovalRequired:true,canBind:true,boundExamId:null,boundExamVersion:null,reason:null,
      });
      if(String(url).includes('/questoes-publicadas?'))return ok({items:publishedQuestions,nextOffset:null});
      return new Response(JSON.stringify({success:false,code:'UNEXPECTED'}),{status:422});
    });
    fireEvent.click(screen.getByRole('button',{name:'Publicar plano imutável'}));
    await screen.findByText(/vínculo pendente/i);
    const published=mocked.mock.calls.find(([url,init])=>String(url).endsWith('/provas')&&init?.method==='POST');
    expect(published).toBeTruthy();
    const plan=JSON.parse((published![1]!.body as string)).plan;
    expect(plan).toMatchObject({
      courseId:26,tenantId:6,title:'Avaliação Final de CRM',trainingSourceSha256:pkg,trainingEditionSha256:edition,
      acceptedQuestionSourceSha256:[pkg,source],
      attemptPolicy:{maxAttempts:3,retryDelayMinutes:0,timeLimitMinutes:30},
      sections:[{moduleId:'m1',minScorePct:70,questions:[{questionId:'q1',revision:1}]}],
    });
    expect(mocked.mock.calls.filter(([url])=>String(url).includes('/vinculo'))).toHaveLength(0);
  });
});
