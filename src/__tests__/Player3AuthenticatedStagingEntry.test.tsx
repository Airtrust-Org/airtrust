import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {fetchWithAuth} from '@/react-app/config/api';
import Player3AuthenticatedStagingEntry,{validatePlayer3Launch}
  from '@/react-app/pages/lms/player3/Player3AuthenticatedStagingEntry';

vi.mock('@/react-app/config/api',()=>({API_BASE_URL:'/api',fetchWithAuth:vi.fn()}));
vi.mock('@/react-app/pages/lms/player3/Player3Html5Host',()=>({
  default:(props:{
    contentUrl:string;reviewOnly:boolean;terminalScope:unknown;
    pendingAssessment?:{onVerifiedStagePassed:(r:never)=>void}|null;
  })=><div data-testid="player3-host">
    <span>{props.contentUrl}</span>
    <span>{props.reviewOnly?'review':'learner'}</span>
    <span>{props.terminalScope?'terminal':'assessment'}</span>
    <button onClick={()=>props.pendingAssessment?.onVerifiedStagePassed({} as never)}>
      confirmed by Worker
    </button>
  </div>,
}));
vi.mock('@/react-app/pages/lms/native/NativeStagingCoursePreview',()=>({
  default:()=> <div data-testid="native-preview">Native existing pilot</div>,
}));
const sha=(s:string)=>s.repeat(64);
const launch={
  empresa_id:6,matricula_id:911,curso_id:57,ciclo_id:333,
  edition_sha256:sha('a'),
  content_origin:'https://authored-staging.example',
  content_url:'https://authored-staging.example/player3/6/57/'+sha('a')+'/'+sha('b')+'/index.html',
  assessment_presentation:'authored-html5' as const,
  official_stages_passed:false,completion_supported:false as const,
  pending_assessment:{
    stage_id:'module1',title:'Avaliação do módulo',
    questions:[{id:'q1',prompt:'Escolha',options:[
      {id:'a',text:'Uma opção'},{id:'b',text:'Outra opção'},
    ]}],
  },
};
const props={matriculaId:911,empresaId:6,cursoId:57,title:'Doutrinamento',active:true};
const mockFetch=vi.mocked(fetchWithAuth);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json'},
});

describe('authenticated original HTML5 learner entry (no ungoverned fallback)',()=>{
  beforeEach(()=>mockFetch.mockReset());
  it('accepts only same tenant, edition, and de-keyed assessment projection',()=>{
    expect(validatePlayer3Launch(launch,props)).toBe(true);
    expect(validatePlayer3Launch({...launch,empresa_id:7},props)).toBe(false);
    expect(validatePlayer3Launch({...launch,content_url:'https://evil.example/test'},props)).toBe(false);
    expect(validatePlayer3Launch({...launch,content_url:
      'https://authored-staging.example/player3/7/57/'+sha('a')+'/'+sha('b')+'/index.html'},props)).toBe(false);
    expect(validatePlayer3Launch({...launch,pending_assessment:{
      ...launch.pending_assessment,questions:[{...launch.pending_assessment.questions[0],
        correctOptionId:'a'}],
    }},props)).toBe(false);
    expect(validatePlayer3Launch({...launch,official_stages_passed:true},props)).toBe(false);
  });
  it('mounts the source-backed iframe only for a valid Worker launch',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:true,data:launch}));
    render(<Player3AuthenticatedStagingEntry {...props}/>);
    const host=await screen.findByTestId('player3-host');
    expect(host).toHaveTextContent('/player3/6/57/');
    expect(host).toHaveTextContent('learner');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/lms/native/matriculas/911/etapas/lancamento',
      expect.objectContaining({method:'GET',cache:'no-store'}));
    expect(screen.queryByTestId('native-preview')).toBeNull();
  });
  it('404 means feature OFF, preserving existing Native; 409 must block',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:false},404));
    const {unmount}=render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByTestId('native-preview')).toBeInTheDocument();
    unmount();
    mockFetch.mockResolvedValueOnce(response({success:false},409));
    render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/não autorizado/i);
    expect(screen.queryByTestId('native-preview')).toBeNull();
    expect(screen.queryByTestId('player3-host')).toBeNull();
  });
  it('never attempts an authored write for unstarted enrollment',async()=>{
    render(<Player3AuthenticatedStagingEntry {...props} active={false}/>);
    expect(await screen.findByTestId('native-preview')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('updates the stage only after a Worker-verified callback',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:true,data:launch}))
      .mockResolvedValueOnce(response({success:true,data:{
        ...launch,official_stages_passed:true,pending_assessment:null,
      }}));
    render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByTestId('player3-host')).toHaveTextContent('assessment');
    fireEvent.click(screen.getByText('confirmed by Worker'));
    await waitFor(()=>expect(screen.getByTestId('player3-host')).toHaveTextContent('terminal'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls.every(c=>c[1]?.method==='GET')).toBe(true);
  });
});
