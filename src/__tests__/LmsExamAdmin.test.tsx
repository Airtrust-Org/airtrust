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
  it('exige nota mínima e confirmação editorial antes de publicar plano; não vincula automaticamente',async()=>{
    renderPage();
    await screen.findByText('Questão de segurança?',{exact:false});
    fireEvent.change(screen.getByLabelText('Edição do pacote SCORM'),{target:{value:pkg}});
    fireEvent.change(screen.getByLabelText('Identificador da prova'),{target:{value:'prova-crm-v1'}});
    fireEvent.change(screen.getByLabelText('SHA-256 da edição aprovada'),{target:{value:edition}});
    fireEvent.click(screen.getByLabelText('Incluir q1 v1'));
    fireEvent.click(screen.getByRole('button',{name:'Publicar plano imutável'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('NOTA_MÍNIMA'));
    fireEvent.change(screen.getByLabelText('Nota mínima de m1'),{target:{value:'70'}});
    fireEvent.click(screen.getByText(/Confirmo a cobertura do conteúdo/));
    mocked.mockImplementation(async (url,init)=>{
      if(String(url).endsWith('/provas')&&init?.method==='POST')return ok({planSha256:'e'.repeat(64)});
      if(String(url).endsWith('/edicoes'))return ok({editions:versions});
      if(String(url).includes('/questoes-publicadas?'))return ok({items:publishedQuestions,nextOffset:null});
      return new Response(JSON.stringify({success:false,code:'UNEXPECTED'}),{status:422});
    });
    fireEvent.click(screen.getByRole('button',{name:'Publicar plano imutável'}));
    await screen.findByText(/vínculo pendente/i);
    const published=mocked.mock.calls.find(([url,init])=>String(url).endsWith('/provas')&&init?.method==='POST');
    expect(published).toBeTruthy();
    const plan=JSON.parse((published![1]!.body as string)).plan;
    expect(plan).toMatchObject({
      courseId:26,tenantId:6,trainingSourceSha256:pkg,trainingEditionSha256:edition,
      acceptedQuestionSourceSha256:[pkg,source],
      sections:[{moduleId:'m1',minScorePct:70,questions:[{questionId:'q1',revision:1}]}],
    });
    expect(mocked.mock.calls.filter(([url])=>String(url).includes('/vinculo'))).toHaveLength(0);
  });
});
