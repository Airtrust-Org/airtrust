import React from 'react';
import {act,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import Player3Html5Host from '@/react-app/pages/lms/player3/Player3Html5Host';
import {fetchWithAuth} from '@/react-app/config/api';

vi.mock('@/react-app/config/api',()=>({
  API_BASE_URL:'/api',fetchWithAuth:vi.fn(),
}));
const request=vi.mocked(fetchWithAuth);
const edition='a'.repeat(64);
const context={
  empresaId:6,matriculaId:911,cicloId:800,editionSha256:edition,
  stageId:'mod-1',title:'Módulo 1',
  questions:[{id:'q1',prompt:'Procedimento?',options:[
    {id:'o0',text:'A'},{id:'o1',text:'B'},
  ]}],
};
const props={
  title:'Doutrinamento',contentUrl:'https://qa-content.example/edition/index.html',
  contentOrigin:'https://qa-content.example',editionSha256:edition,
  assessmentPresentation:'authored-html5' as const,
  reviewOnly:false,pendingAssessment:{context,onVerifiedStagePassed:vi.fn(),onDismiss:vi.fn()},
};
const response=(data:unknown,status=200)=>new Response(
  JSON.stringify({success:true,data}),
  {status,headers:{'content-type':'application/json'}},
);
const session=(attempts:number,passed:boolean)=>({
  editionSha256:edition,cycleId:800,completionSupported:false,
  stages:[{stageId:'mod-1',attempts,lastScorePct:attempts?80:null,
    passed,nextAttemptNumber:attempts+1}],
});
const verifiedReceipt={
  state:'APPLIED',stage_id:'mod-1',attempt_number:1,
  edition_sha256:edition,score_pct:80,stage_passed:true,
  completion_supported:false,
};
const hint=(changes:Record<string,unknown>={})=>({
  type:'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',editionSha256:edition,
  stageId:'mod-1',requestId:'33333333-3333-4333-8333-333333333333',
  answers:[{questionId:'q1',optionId:'o0'}],...changes,
});
const frame=()=>screen.getByTitle(/Conteúdo original/) as HTMLIFrameElement;
const send=(data:unknown,origin=props.contentOrigin,source:MessageEventSource|null=frame().contentWindow)=>
  act(()=>window.dispatchEvent(new MessageEvent('message',{origin,source,data})));
const renderHost=()=>render(<Player3Html5Host {...props}/>);

describe('Player3 RC8.1 preserved HTML5 bridge to Worker immutable grade',()=>{
  beforeEach(()=>request.mockReset());
  it('accepts only the displayed frame, sends GET → POST → GET, returns Worker verdict to that frame',async()=>{
    request.mockResolvedValueOnce(response(session(0,false)))
      .mockResolvedValueOnce(response(verifiedReceipt,201))
      .mockResolvedValueOnce(response(session(1,true)));
    renderHost();
    const outbound=vi.spyOn(frame().contentWindow!,'postMessage').mockImplementation(()=>{});
    expect(screen.queryByRole('dialog')).toBeNull();
    send(hint());
    await waitFor(()=>expect(outbound).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledTimes(3);
    const [before,post,after]=request.mock.calls;
    expect(before[0]).toBe('/api/lms/native/matriculas/911/etapas/sessao');
    expect(post[0]).toBe('/api/lms/native/matriculas/911/etapas/mod-1/tentativas');
    expect(post[1]?.method).toBe('POST');
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({
      attemptNumber:1,answers:[{questionId:'q1',optionId:'o0'}],
    });
    expect(after[0]).toBe(before[0]);
    expect(outbound).toHaveBeenCalledWith({
      type:'AIRTRUST_PLAYER3_STAGE_VERDICT_V1',editionSha256:edition,
      stageId:'mod-1',requestId:hint().requestId,
      stage_passed:true,score_pct:80,persisted:true,
    },props.contentOrigin);
    expect(props.pendingAssessment.onVerifiedStagePassed).not.toHaveBeenCalled();
    // An iframe replay with the same request ID must not create a second attempt.
    send(hint());
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('never accepts forged same-origin sibling, wrong origin, wrong stage or forged grade',()=>{
    renderHost();
    const sibling=window.document.createElement('iframe');
    document.body.append(sibling);
    send(hint(),props.contentOrigin,sibling.contentWindow);
    send(hint(),'https://evil.example');
    send(hint({stageId:'mod-2'}));
    send(hint({editionSha256:'b'.repeat(64)}));
    send(hint({answers:[{questionId:'q1',optionId:'o9'}]}));
    send(hint({grade:100}));
    expect(request).not.toHaveBeenCalled();
    sibling.remove();
  });
  it('blocks all attempts while review-only or while no server-pinned assessment exists',()=>{
    const {rerender}=render(<Player3Html5Host {...props} reviewOnly/>);
    send(hint());expect(request).not.toHaveBeenCalled();
    rerender(<Player3Html5Host {...props} pendingAssessment={null}/>);
    send(hint());expect(request).not.toHaveBeenCalled();
    rerender(<Player3Html5Host {...props} pendingAssessment={{
      ...props.pendingAssessment,context:{...context,editionSha256:'b'.repeat(64)},
    }}/>);
    send(hint());expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/edição diferente/);
  });
  it('fails closed when Worker GET-after-POST disagrees; no forged pass or retry',async()=>{
    request.mockResolvedValueOnce(response(session(0,false)))
      .mockResolvedValueOnce(response(verifiedReceipt,201))
      .mockResolvedValueOnce(response(session(0,false)));
    renderHost();
    const outbound=vi.spyOn(frame().contentWindow!,'postMessage').mockImplementation(()=>{});
    send(hint());
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(3));
    await act(async()=>{await Promise.resolve();await Promise.resolve();});
    expect(outbound).not.toHaveBeenCalled();
    send(hint({requestId:'44444444-4444-4444-8444-444444444444'}));
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('never authorizes a completed training or certificate from iframe messages',()=>{
    renderHost();
    const outbound=vi.spyOn(frame().contentWindow!,'postMessage').mockImplementation(()=>{});
    send({type:'AIRTRUST_PLAYER3_STAGE_VERDICT_V1',
      editionSha256:edition,stageId:'mod-1',stage_passed:true,score_pct:100,
      persisted:true,certificate:'issued'});
    send({type:'AIRTRUST_PLAYER3_CONTENT_END_HINT_V1',
      editionSha256:edition,unitId:'end',status:'CONCLUIDO'});
    expect(request).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });
});
