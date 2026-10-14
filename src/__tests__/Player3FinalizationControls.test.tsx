import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {fetchWithAuth} from '@/react-app/config/api';
import Player3FinalizationControls from
  '@/react-app/pages/lms/player3/Player3FinalizationControls';
import Player3Html5Host from '@/react-app/pages/lms/player3/Player3Html5Host';

vi.mock('@/react-app/config/api',()=>({
  API_BASE_URL:'/api',fetchWithAuth:vi.fn(),
}));
const request=vi.mocked(fetchWithAuth);
const scope={matriculaId:911,cycleId:800,editionSha256:'a'.repeat(64)};
const ok=(data:unknown,status=200)=>new Response(JSON.stringify({success:true,data}),
  {status,headers:{'content-type':'application/json'}});
const readiness=(changes:Record<string,unknown>={})=>({
  matricula_id:911,cycleId:800,editionSha256:scope.editionSha256,
  totalRequiredLessons:34,verifiedLessons:34,
  officialStageCount:8,officialStagesPassed:8,
  reason:'READY_FOR_TERMINAL_PREFLIGHT',readyForAtomicTerminalPreflight:true,
  completionSupported:false,completion_supported:false,...changes,
});
const terminal=(changes:Record<string,unknown>={})=>({
  matricula_id:911,status:'CONCLUIDO',
  qualification_outcome:'qualification_created',
  certificate_state:'REQUIRES_VERIFICATION',...changes,
});
const click=()=>fireEvent.click(screen.getByTestId('player3-request-finalization'));

describe('Player3 terminal: advisory readiness is not a certificate',()=>{
  beforeEach(()=>request.mockReset());
  it('makes GET followed by a bodyless terminal POST and never claims a PDF',async()=>{
    request.mockResolvedValueOnce(ok(readiness()))
      .mockResolvedValueOnce(ok(terminal()));
    render(<Player3FinalizationControls scope={scope}/>);
    click();
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Certificado pendente de verificação/);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe(
      '/api/lms/native/matriculas/911/etapas/prontidao');
    expect(request.mock.calls[1][0]).toBe(
      '/api/lms/native/matriculas/911/etapas/concluir');
    expect(request.mock.calls[1][1]?.method).toBe('POST');
    expect(request.mock.calls[1][1]?.body).toBeUndefined();
    expect(screen.getByTestId('player3-request-finalization')).toBeDisabled();
    expect(screen.queryByText(/certificado emitido|PDF disponível/i)).toBeNull();
  });
  it('never POSTs when any lesson, stage, edition or cycle is incomplete',async()=>{
    for(const patch of [
      {verifiedLessons:33},{officialStagesPassed:7},
      {cycleId:801},{editionSha256:'b'.repeat(64)},
      {reason:'CONTENT_NOT_FINISHED',readyForAtomicTerminalPreflight:false},
    ]){
      request.mockReset().mockResolvedValueOnce(ok(readiness(patch)));
      const {unmount}=render(<Player3FinalizationControls scope={scope}/>);
      click();
      expect(await screen.findByRole('status')).toHaveTextContent(
        /pendentes|Não foi possível/);
      expect(request).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
  it('refuses a forged completion receipt or premature certificate success',async()=>{
    for(const patch of [
      {matricula_id:912},{status:'EM_ANDAMENTO'},
      {qualification_outcome:'qualification_failed'},
      {certificate_state:'ISSUED'},
    ]){
      request.mockReset().mockResolvedValueOnce(ok(readiness()))
        .mockResolvedValueOnce(ok(terminal(patch)));
      const {unmount}=render(<Player3FinalizationControls scope={scope}/>);
      click();
      expect(await screen.findByRole('status')).toHaveTextContent(
        /Reabra o treinamento/);
      expect(screen.getByTestId('player3-request-finalization')).toBeDisabled();
      expect(request).toHaveBeenCalledTimes(2);
      unmount();
    }
  });
  it('does not resend an ambiguous terminal request after network loss',async()=>{
    request.mockResolvedValueOnce(ok(readiness()))
      .mockRejectedValueOnce(new Error('timeout after D1 COMMIT'));
    render(<Player3FinalizationControls scope={scope}/>);
    click();
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Reabra o treinamento/);
    click();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('will not expose completion in review mode or with mismatched content edition',async()=>{
    const host={
      title:'Doutrinamento',contentUrl:'https://html5-qa.example/course/index.html',
      contentOrigin:'https://html5-qa.example',editionSha256:scope.editionSha256,
      terminalScope:scope,
    };
    const {rerender}=render(<Player3Html5Host {...host} reviewOnly/>);
    expect(screen.queryByTestId('player3-request-finalization')).toBeNull();
    rerender(<Player3Html5Host {...host} reviewOnly={false}/>);
    expect(screen.getByTestId('player3-request-finalization')).toBeInTheDocument();
    rerender(<Player3Html5Host {...host} reviewOnly={false}
      terminalScope={{...scope,editionSha256:'b'.repeat(64)}}/>);
    expect(screen.queryByTestId('player3-request-finalization')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/edição diferente/);
    await waitFor(()=>expect(request).not.toHaveBeenCalled());
  });
  it('never exposes a write button on invalid terminal scope',()=>{
    render(<Player3FinalizationControls scope={{...scope,cycleId:0}}/>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('player3-request-finalization')).toBeNull();
  });
});
