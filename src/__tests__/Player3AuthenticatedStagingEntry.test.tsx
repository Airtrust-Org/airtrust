import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {fetchWithAuth} from '@/react-app/config/api';
import Player3AuthenticatedStagingEntry from '@/react-app/pages/lms/player3/Player3AuthenticatedStagingEntry';
import {validatePlayer3Launch} from '@/react-app/pages/lms/player3/Player3AuthoredLaunchValidation';

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
const previewMounts=vi.hoisted(()=>({count:0}));
vi.mock('@/react-app/pages/lms/native/NativeStagingCoursePreview',()=>{
  function MockNativePreview({onVerifiedStarted}:{onVerifiedStarted?:()=>void}){
    const [instance]=React.useState(()=>++previewMounts.count);
    return <div data-testid="native-preview">Native existing pilot
      <span data-testid="native-preview-instance">{instance}</span>
      <button type="button" onClick={onVerifiedStarted}>verified pilot start</button>
    </div>;
  }
  return {default:MockNativePreview};
});
const sha=(s:string)=>s.repeat(64);
const launch={
  empresa_id:6,matricula_id:911,curso_id:57,ciclo_id:333,
  edition_sha256:sha('a'),
  content_origin:'https://authored-staging.example',
  content_url:'https://authored-staging.example/player3/6/57/'+sha('a')+'/'+sha('b')+'/index.html',
  assessment_presentation:'authored-html5' as const,
  resume_next_unit_id:'unit22',checkpoint_unit_ids:['unit21','unit22'],
  last_visited_unit_id:'unit21',
  official_stages_passed:false,completion_supported:false as const,
  pending_assessment:{
    stage_id:'module1',title:'Avaliação do módulo',
    questions:[{id:'q1',prompt:'Escolha',options:[
      {id:'a',text:'Uma opção'},{id:'b',text:'Outra opção'},
    ]}],
  },
};
const props={matriculaId:911,empresaId:6,cursoId:57,title:'Doutrinamento',active:true,allowLegacyNativePreview:true};
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
    expect(validatePlayer3Launch({...launch,checkpoint_unit_ids:['unit22','unit22']},props)).toBe(false);
    expect(validatePlayer3Launch({...launch,last_visited_unit_id:'wrong'},props)).toBe(false);
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
  it('exact 404 launch-OFF preserves physical Native only; 409 still blocks',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:false,code:'PLAYER3_AUTHORED_LAUNCH_NOT_ENABLED'},404));
    const {unmount}=render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByTestId('native-preview')).toBeInTheDocument();
    unmount();
    mockFetch.mockResolvedValueOnce(response({success:false},409));
    render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/não autorizado/i);
    expect(screen.queryByTestId('native-preview')).toBeNull();
    expect(screen.queryByTestId('player3-host')).toBeNull();
  });
  it('never falls back from activated SCORM to the older Native pilot',async()=>{
    mockFetch.mockResolvedValueOnce(response({
      success:false,code:'PLAYER3_AUTHORED_LAUNCH_NOT_ENABLED',
    },404));
    const view=render(<Player3AuthenticatedStagingEntry
      {...props} allowLegacyNativePreview={false}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/indisponível/i);
    expect(screen.queryByTestId('native-preview')).toBeNull();
    expect(screen.queryByTestId('player3-host')).toBeNull();
    view.unmount();
    const noStart=render(<Player3AuthenticatedStagingEntry
      {...props} active={false} allowLegacyNativePreview={false}/>);
    expect(screen.getByRole('button',{name:/iniciar treinamento no Player 3/i})).toBeInTheDocument();
    expect(screen.queryByTestId('native-preview')).toBeNull();
    noStart.unmount();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('starts an activated SCORM only after Worker POST and verified readback',async()=>{
    const digest=sha('a');
    mockFetch.mockResolvedValueOnce(response({success:true,data:{
      state:'STARTED',ciclo_id:333,edition_sha256:digest,
      completion_supported:false,
    }},201)).mockResolvedValueOnce(response({success:true,data:{
      matricula_id:911,ciclo_id:333,edition_sha256:digest,
      mode:'LEARN',next_sequence:1,
    }})).mockResolvedValueOnce(response({success:true,data:launch}));
    render(<Player3AuthenticatedStagingEntry {...props}
      active={false} allowLegacyNativePreview={false}/>);
    expect(screen.queryByTestId('player3-host')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/iniciar treinamento no Player 3/i}));
    expect(await screen.findByTestId('player3-host')).toHaveTextContent('learner');
    expect(screen.queryByTestId('native-preview')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenNthCalledWith(1,
      '/api/lms/native/matriculas/911/iniciar',
      expect.objectContaining({method:'POST',body:'{}'}));
    expect(mockFetch).toHaveBeenNthCalledWith(2,
      '/api/lms/native/matriculas/911/sessao',
      expect.objectContaining({method:'GET'}));
    expect(mockFetch).toHaveBeenNthCalledWith(3,
      '/api/lms/native/matriculas/911/etapas/lancamento',
      expect.objectContaining({method:'GET'}));
  });
  it('never retries or launches after ambiguous start or conflicting cycle readback',async()=>{
    for(const responses of [
      [response({success:false},503)],
      [response({success:true,data:{
        state:'STARTED',ciclo_id:333,edition_sha256:sha('a'),
        completion_supported:false,
      }},201),response({success:true,data:{
        matricula_id:911,ciclo_id:444,edition_sha256:sha('a'),
        mode:'LEARN',next_sequence:1,
      }})],
    ]){
      for(const r of responses)mockFetch.mockResolvedValueOnce(r);
      const view=render(<Player3AuthenticatedStagingEntry {...props}
        active={false} allowLegacyNativePreview={false}/>);
      fireEvent.click(screen.getByRole('button',{name:/iniciar treinamento no Player 3/i}));
      expect(await screen.findByRole('alert')).toHaveTextContent(/reabra o treinamento/i);
      expect(screen.getByRole('button',{name:/iniciar treinamento no Player 3/i})).toBeDisabled();
      expect(screen.queryByTestId('player3-host')).toBeNull();
      expect(screen.queryByTestId('native-preview')).toBeNull();
      view.unmount();
    }
  });
  it('does not restart an already completed SCORM enrollment',async()=>{
    render(<Player3AuthenticatedStagingEntry {...props}
      active={false} completed={true} allowLegacyNativePreview={false}/>);
    expect(screen.getByRole('status')).toHaveTextContent(/histórico/i);
    expect(screen.queryByRole('button',{name:/iniciar treinamento/i})).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a generic 404 rather than treating it as pilot permission',async()=>{
    mockFetch.mockResolvedValueOnce(response({
      success:false,code:'NATIVE_ENROLLMENT_NOT_FOUND',
    },404));
    render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/indisponível/i);
    expect(screen.queryByTestId('native-preview')).toBeNull();
  });

  it('never attempts an authored write for unstarted enrollment',async()=>{
    render(<Player3AuthenticatedStagingEntry {...props} active={false}/>);
    expect(await screen.findByTestId('native-preview')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('remounts the fallback preview when tenant or course changes with the same enrollment id',async()=>{
    const view=render(<Player3AuthenticatedStagingEntry {...props} active={false}/>);
    const first=(await screen.findByTestId('native-preview-instance')).textContent;
    view.rerender(<Player3AuthenticatedStagingEntry {...props} active={false} empresaId={7}/>);
    const second=screen.getByTestId('native-preview-instance').textContent;
    expect(second).not.toBe(first);
    view.rerender(<Player3AuthenticatedStagingEntry {...props} active={false} empresaId={7} cursoId={58}/>);
    expect(screen.getByTestId('native-preview-instance').textContent).not.toBe(second);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('moves a first-time learner into the original HTML5 only after a Worker-verified Native start',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:true,data:{
      ...launch,resume_next_unit_id:'unit21',last_visited_unit_id:null,
    }}));
    render(<Player3AuthenticatedStagingEntry {...props} active={false}/>);
    expect(await screen.findByTestId('native-preview')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'verified pilot start'}));
    const host=await screen.findByTestId('player3-host');
    expect(host).toHaveTextContent('learner');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/lms/native/matriculas/911/etapas/lancamento',
      expect.objectContaining({method:'GET',cache:'no-store'}),
    );
  });

  it('does not fall back to an unverified authored launch after confirmed start',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:false},409));
    render(<Player3AuthenticatedStagingEntry {...props} active={false}/>);
    fireEvent.click(await screen.findByRole('button',{name:'verified pilot start'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não autorizado/i);
    expect(screen.queryByTestId('player3-host')).toBeNull();
    expect(screen.queryByTestId('native-preview')).toBeNull();
  });

  it('hides an old tenant iframe before the next Worker admission completes',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:true,data:launch}));
    let releaseNext:((res:Response)=>void)|undefined;
    mockFetch.mockImplementationOnce(()=>new Promise<Response>(resolve=>{
      releaseNext=resolve;
    }));
    const view=render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByTestId('player3-host')).toHaveTextContent('/player3/6/57/');
    view.rerender(<Player3AuthenticatedStagingEntry {...props} empresaId={7}/>);
    expect(screen.queryByTestId('player3-host')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/verificando edição/i);
    await waitFor(()=>expect(mockFetch).toHaveBeenCalledTimes(2));
    releaseNext?.(response({success:true,data:{
      ...launch,empresa_id:7,
      content_url:'https://authored-staging.example/player3/7/57/'+
        sha('a')+'/'+sha('b')+'/index.html',
    }}));
    expect(await screen.findByTestId('player3-host')).toHaveTextContent('/player3/7/57/');
  });

  it('hides a learner iframe immediately if the enrollment is no longer started',async()=>{
    mockFetch.mockResolvedValueOnce(response({success:true,data:launch}));
    const view=render(<Player3AuthenticatedStagingEntry {...props}/>);
    expect(await screen.findByTestId('player3-host')).toBeInTheDocument();
    view.rerender(<Player3AuthenticatedStagingEntry {...props} active={false}/>);
    expect(screen.queryByTestId('player3-host')).toBeNull();
    expect(await screen.findByTestId('native-preview')).toBeInTheDocument();
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
