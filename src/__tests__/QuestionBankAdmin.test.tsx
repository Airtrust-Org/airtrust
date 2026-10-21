// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import QuestionBankAdmin from '../react-app/pages/lms/exams/QuestionBankAdmin';
import {fetchWithAuth} from '../react-app/config/api';

vi.mock('../react-app/config/api',()=>({
  API_BASE_URL:'/api',
  fetchWithAuth:vi.fn(),
}));
const mocked=vi.mocked(fetchWithAuth);
const sha='a'.repeat(64);
const scope={courseId:100,trainingSourceSha256:sha};
const empty=()=>new Response(JSON.stringify({success:true,data:[]}),{
  status:200,headers:{'Content-Type':'application/json'},
});
const content={
  questionId:'q1',revision:1,status:'PUBLISHED',contentSha256:'f'.repeat(64),
  moduleId:'m1',topicId:'topic',sourceUnitId:'u1',sourceSha256:sha,
  prompt:'Qual é o procedimento correto?',choices:[
    {id:'o1',text:'Inspecionar'}, {id:'o2',text:'Ignorar'},
  ],correctChoiceId:'o1',explanation:'Inspeção é necessária',
};
function success(data:unknown,status=200){
  return new Response(JSON.stringify({success:true,data}),{
    status,headers:{'Content-Type':'application/json'},
  });
}
describe('Question bank separated from SCORM player',()=>{
  beforeEach(()=>{vi.resetAllMocks();});
  it('refuses an unpinned course and does not contact any API',()=>{
    render(<QuestionBankAdmin courseId={0} trainingSourceSha256={sha}/>);
    expect(screen.getByRole('alert').textContent).toContain('Selecione um curso');
    expect(mocked).not.toHaveBeenCalled();
  });
  it('shows an independent admin editor with no course iframe',async()=>{
    mocked.mockResolvedValue(empty());
    const {container}=render(<QuestionBankAdmin {...scope}/>);
    expect(screen.getByRole('heading',{name:'Banco de Questões'})).toBeTruthy();
    expect(screen.getByText('Nova questão',{selector:'button'})).toBeTruthy();
    expect(screen.getByLabelText('Enunciado')).toBeTruthy();
    expect(screen.getByLabelText('Explicação da resposta correta')).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
    await waitFor(()=>expect(mocked).toHaveBeenCalledTimes(1));
  });
  it('published questions are read-only and allow only a new revision',async()=>{
    mocked.mockResolvedValueOnce(success([{
      questionId:'q1',revision:1,status:'PUBLISHED',updatedAt:'2026-10-20',
    }])).mockResolvedValueOnce(success({revision:content,editVersion:1}));
    render(<QuestionBankAdmin {...scope}/>);
    const existing=await screen.findByRole('button',{name:/q1 · v1/});
    fireEvent.click(existing);
    await waitFor(()=>expect(screen.getByDisplayValue(content.prompt)).toBeTruthy());
    expect((screen.getByLabelText('Enunciado') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole('button',{name:'Salvar rascunho'})).toBeNull();
    expect(screen.getByRole('button',{name:'Criar nova revisão'})).toBeTruthy();
  });
  it('sends only an editable draft payload to the independent bank route',async()=>{
    mocked.mockResolvedValueOnce(empty()).mockResolvedValueOnce(
      success({revision:{
        ...content,status:'DRAFT',contentSha256:null,
        questionId:'questao-1',moduleId:'m1',topicId:'topic',
        sourceUnitId:'u1',prompt:'Pergunta?',explanation:'Porque sim',
        choices:[
          {id:'o1',text:'Sim'},{id:'o2',text:'Não'},
          {id:'o3',text:'Talvez'},{id:'o4',text:'Nunca'},
        ],
      },editVersion:1},201)
    ).mockResolvedValueOnce(empty());
    render(<QuestionBankAdmin {...scope}/>);
    await waitFor(()=>expect(mocked).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Identificador da questão'),
      {target:{value:'questao-1'}});
    fireEvent.change(screen.getByLabelText('Módulo'),{target:{value:'m1'}});
    fireEvent.change(screen.getByLabelText('Assunto'),{target:{value:'topic'}});
    fireEvent.change(screen.getByLabelText('Unidade do material de origem'),
      {target:{value:'u1'}});
    fireEvent.change(screen.getByLabelText('Enunciado'),{target:{value:'Pergunta?'}});
    fireEvent.change(screen.getByLabelText('Explicação da resposta correta'),
      {target:{value:'Porque sim'}});
    for(const [i,text] of ['Sim','Não','Talvez','Nunca'].entries()){
      fireEvent.change(screen.getByLabelText('Alternativa '+(i+1)),{
        target:{value:text},
      });
    }
    fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));
    await waitFor(()=>expect(mocked).toHaveBeenCalledTimes(3));
    const [url,options]=mocked.mock.calls[1];
    expect(url).toBe('/api/lms/exams/admin/cursos/100/questoes');
    expect(options?.method).toBe('POST');
    const payload=JSON.parse(options!.body as string);
    expect(Object.keys(payload).sort()).toEqual(['content','questionId']);
    expect(payload.questionId).toBe('questao-1');
    expect(payload.content.prompt).toBe('Pergunta?');
    expect(payload.content.sourceSha256).toBe(sha);
    expect(payload.content.correctChoiceId).toBe('o1');
  });
});
