import {beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({
  fetch:vi.fn(),
  params:{matriculaId:'101'},
  auth:{user:{id:900},empresaAtualId:6,isAuthenticated:true},
  legacyMounts:0,
}));
vi.mock('@/react-app/config/api',()=>({
  API_BASE_URL:'/api',fetchWithAuth:mocks.fetch,
}));
vi.mock('@/react-app/hooks/useAuth',()=>({
  useAuth:()=>mocks.auth,
}));
vi.mock('react-router-dom',()=>({
  useParams:()=>mocks.params,
  Navigate:({to}:{to:string})=><span data-testid="route-player3">{to}</span>,
}));
vi.mock('@/react-app/pages/lms/LmsPlayer',()=>({
  default:()=>{
    mocks.legacyMounts++;
    return <span data-testid="route-legacy">SCORM 1.2 legado</span>;
  },
}));
import LmsPlayerRouteGate from '@/react-app/pages/lms/LmsPlayerRouteGate';
const payload=(data:unknown,status=200)=>
  new Response(JSON.stringify(data),{
    status,headers:{'content-type':'application/json'},
  });
const admitted={success:true,data:{
  matricula_id:101,curso_id:31,
  mode:'LEARN',native_package:'NOT_YET_ENABLED',
}};
const notNative=(code:string)=>
  payload({success:false,code},404);

describe('LMS launch router — Player3 admission must precede legacy SCORM',()=>{
  beforeEach(()=>{
    mocks.fetch.mockReset();
    mocks.legacyMounts=0;
    mocks.params={matriculaId:'101'};
    mocks.auth={user:{id:900},empresaAtualId:6,isAuthenticated:true};
  });

  it('preserves SCORM when Worker says pilot off or no activation marker',async()=>{
    for(const code of ['NATIVE_PLAYER_NOT_ENABLED','NATIVE_COURSE_NOT_AVAILABLE']){
      mocks.fetch.mockResolvedValueOnce(notNative(code));
      const view=render(<LmsPlayerRouteGate/>);
      expect(screen.queryByTestId('route-legacy')).toBeNull();
      expect(await screen.findByTestId('route-legacy')).toHaveTextContent('SCORM 1.2');
      expect(screen.queryByTestId('route-player3')).toBeNull();
      view.unmount();
    }
    expect(mocks.legacyMounts).toBe(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('routes a Worker-verified activated SCORM enrollment to Player3',async()=>{
    mocks.fetch.mockResolvedValueOnce(payload(admitted));
    render(<LmsPlayerRouteGate/>);
    expect(await screen.findByTestId('route-player3'))
      .toHaveTextContent('/lms/player/native/101');
    expect(screen.queryByTestId('route-legacy')).toBeNull();
    expect(mocks.legacyMounts).toBe(0);
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/lms/native/matriculas/101/admissao',
      expect.objectContaining({method:'GET',cache:'no-store',signal:expect.any(AbortSignal)}),
    );
  });

  it('denies ambiguous, forged and unauthenticated responses without SCORM fallback',async()=>{
    for(const r of [
      payload({success:false,code:'NATIVE_ENROLLMENT_NOT_FOUND'},404),
      payload({success:false},403),
      payload({success:false},503),
      payload({...admitted,data:{...admitted.data,matricula_id:999}}),
      payload({...admitted,data:{...admitted.data,native_package:'REVIEW_ONLY'}}),
      payload({...admitted,data:{...admitted.data,mode:'INVALID'}}),
    ]){
      mocks.fetch.mockResolvedValueOnce(r);
      const view=render(<LmsPlayerRouteGate/>);
      expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível/i);
      expect(screen.queryByTestId('route-legacy')).toBeNull();
      expect(screen.queryByTestId('route-player3')).toBeNull();
      view.unmount();
    }
    expect(mocks.legacyMounts).toBe(0);
  });

  it('blocks if the Worker request fails or the URL/actor is invalid',async()=>{
    mocks.fetch.mockRejectedValueOnce(Error('network'));
    const failing=render(<LmsPlayerRouteGate/>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível/i);
    failing.unmount();
    mocks.params={matriculaId:'oops'};
    const invalid=render(<LmsPlayerRouteGate/>);
    expect(screen.getByRole('alert')).toHaveTextContent(/não autorizado/i);
    invalid.unmount();
    mocks.params={matriculaId:'101'};
    mocks.auth={...mocks.auth,isAuthenticated:false};
    render(<LmsPlayerRouteGate/>);
    expect(screen.getByRole('alert')).toHaveTextContent(/não autorizado/i);
    expect(mocks.legacyMounts).toBe(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores the previous account admission after identity changes mid-request',async()=>{
    let finishOld:((value:Response)=>void)|undefined;
    mocks.fetch.mockImplementationOnce(()=>new Promise<Response>(
      resolve=>{finishOld=resolve;},
    ));
    const view=render(<LmsPlayerRouteGate/>);
    expect(screen.getByRole('status')).toHaveTextContent(/verificando/i);
    mocks.auth={...mocks.auth,user:{id:901}};
    mocks.fetch.mockResolvedValueOnce(notNative('NATIVE_COURSE_NOT_AVAILABLE'));
    view.rerender(<LmsPlayerRouteGate/>);
    expect(await screen.findByTestId('route-legacy')).toBeInTheDocument();
    finishOld?.(payload(admitted));
    await waitFor(()=>expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('route-player3')).toBeNull();
    expect(mocks.legacyMounts).toBeGreaterThan(0);
  });
  it('requires fresh Worker admission after logout and re-login with the same identity',async()=>{
    mocks.fetch.mockResolvedValueOnce(notNative('NATIVE_COURSE_NOT_AVAILABLE'));
    const view=render(<LmsPlayerRouteGate/>);
    expect(await screen.findByTestId('route-legacy')).toBeInTheDocument();
    mocks.auth={...mocks.auth,isAuthenticated:false};
    view.rerender(<LmsPlayerRouteGate/>);
    expect(screen.queryByTestId('route-legacy')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/não autorizado/i);

    let rejectAdmission:((response:Response)=>void)|undefined;
    mocks.fetch.mockImplementationOnce(()=>new Promise<Response>(resolve=>{
      rejectAdmission=resolve;
    }));
    mocks.auth={...mocks.auth,isAuthenticated:true};
    view.rerender(<LmsPlayerRouteGate/>);
    expect(screen.getByRole('status')).toHaveTextContent(/verificando/i);
    expect(screen.queryByTestId('route-legacy')).toBeNull();
    rejectAdmission?.(payload({success:false},403));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível/i);
    expect(mocks.legacyMounts).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('cannot reuse an old account admission after switching away and back',async()=>{
    mocks.fetch.mockResolvedValueOnce(payload(admitted));
    const view=render(<LmsPlayerRouteGate/>);
    expect(await screen.findByTestId('route-player3')).toBeInTheDocument();
    mocks.auth={...mocks.auth,user:{id:901}};
    mocks.fetch.mockResolvedValueOnce(payload({success:false},403));
    view.rerender(<LmsPlayerRouteGate/>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível/i);
    mocks.auth={...mocks.auth,user:{id:900}};
    mocks.fetch.mockResolvedValueOnce(payload({success:false},403));
    view.rerender(<LmsPlayerRouteGate/>);
    expect(screen.getByRole('status')).toHaveTextContent(/verificando/i);
    expect(screen.queryByTestId('route-player3')).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível/i);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

});
