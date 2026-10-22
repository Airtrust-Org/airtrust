import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {fetchWithAuth} from '@/react-app/config/api';
import Player3Html5Host from '@/react-app/pages/lms/player3/Player3Html5Host';

vi.mock('@/react-app/config/api',()=>({
  API_BASE_URL:'/api',fetchWithAuth:vi.fn(),
}));
const authenticatedFetch=vi.mocked(fetchWithAuth);
const editionSha256='a'.repeat(64);
const props={
  title:'Doutrinamento',contentUrl:'https://qa-content.example/edicoes/sha/index.html',
  contentOrigin:'https://qa-content.example',editionSha256,reviewOnly:false,
};
const context={
  empresaId:6,matriculaId:911,cicloId:800,editionSha256,
  stageId:'stage-1',title:'Segurança',
  questions:[{id:'q1',prompt:'O que fazer?',options:[
    {id:'o0',text:'Aplicar procedimento'},{id:'o1',text:'Ignorar'},
  ]}],
};
const payload=(data:unknown,status=200)=>new Response(
  JSON.stringify({success:true,data}),{status,headers:{'content-type':'application/json'}},
);
const session=(passed:boolean,attempts:number)=>({
  editionSha256,cycleId:800,completionSupported:false,
  allOfficialStagesPassed:passed,
  stages:[{stageId:'stage-1',attempts,passed,
    lastScorePct:attempts?80:null,nextAttemptNumber:attempts+1}],
});
const official={
  state:'APPLIED',stage_id:'stage-1',attempt_number:1,
  edition_sha256:editionSha256,score_pct:80,
  stage_passed:true,completion_supported:false,
};
function emit(frame:HTMLIFrameElement,data:unknown){
  act(()=>window.dispatchEvent(new MessageEvent('message',{
    origin:props.contentOrigin,source:frame.contentWindow,data,
  })));
}
const selected=()=>{
  fireEvent.click(screen.getByRole('radio',{name:'Aplicar procedimento'}));
  fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
};

describe('Player3 HTML5 Host wiring to real authenticated attempt ledger',()=>{
  beforeEach(()=>authenticatedFetch.mockReset());
  it('forbids caller-injected grading; uses GET, POST and verified GET before unlocking',async()=>{
    const forged=vi.fn(async()=>({
      empresa_id:6,matricula_id:911,ciclo_id:800,edition_sha256:editionSha256,
      stage_id:'stage-1',attempt_number:1,score_pct:100,
      stage_passed:true,persisted:true as const,
    }));
    const passed=vi.fn();
    authenticatedFetch.mockResolvedValueOnce(payload(session(false,0)))
      .mockResolvedValueOnce(payload(official,201))
      .mockResolvedValueOnce(payload(session(true,1)));
    render(<Player3Html5Host {...props} pendingAssessment={{
      context,onVerifiedStagePassed:passed,onDismiss:vi.fn(),
      ...({submitOfficialAttempt:forged}),
    }}/>);
    selected();
    const proceed=await screen.findByRole('button',{
      name:'Prosseguir para o próximo módulo',
    });
    expect(forged).not.toHaveBeenCalled();
    expect(authenticatedFetch).toHaveBeenCalledTimes(3);
    const post=authenticatedFetch.mock.calls[1];
    expect(post[0]).toBe('/api/lms/native/matriculas/911/etapas/stage-1/tentativas');
    expect(post[1]?.method).toBe('POST');
    const body=JSON.parse(String(post[1]?.body));
    expect(body.answers).toEqual([{questionId:'q1',optionId:'o0'}]);
    expect(body.score_pct).toBeUndefined();
    expect(body.certificate).toBeUndefined();
    expect(passed).not.toHaveBeenCalled();
    fireEvent.click(proceed);
    expect(passed).toHaveBeenCalledWith(expect.objectContaining({
      stage_passed:true,score_pct:80,persisted:true,
    }));
  });
  it('waits for the last lesson checkpoint before sending an authored assessment',async()=>{
    const nav={
      matriculaId:911,empresaId:6,cicloId:800,editionSha256,
      nextUnitId:'lesson-final',checkpointUnitIds:['lesson-final'],
      lastVisitedUnitId:null,
    };
    const beforeNav={
      matricula_id:911,ciclo_id:800,edition_sha256:editionSha256,
      mode:'LEARN',next_sequence:1,seen_lesson_ids:[],
      last_visited_unit_id:null,
    };
    const afterNav={...beforeNav,next_sequence:2,
      seen_lesson_ids:['lesson-final'],last_visited_unit_id:'lesson-final'};
    const checkpoint={state:'APPLIED',committed_sequence:1,
      edition_sha256:editionSha256,completion_supported:false};
    authenticatedFetch
      .mockResolvedValueOnce(payload(beforeNav))
      .mockResolvedValueOnce(payload(checkpoint,201))
      .mockResolvedValueOnce(payload(afterNav))
      .mockResolvedValueOnce(payload(session(false,0)))
      .mockResolvedValueOnce(payload(official,201))
      .mockResolvedValueOnce(payload(session(true,1)));
    render(<Player3Html5Host {...props} navigation={nav}
      assessmentPresentation="authored-html5" pendingAssessment={{
        context,onVerifiedStagePassed:vi.fn(),onDismiss:vi.fn(),
      }}/>);
    const frame=screen.getByTitle('Conteúdo original — Doutrinamento') as HTMLIFrameElement;
    fireEvent.load(frame);
    emit(frame,{type:'AIRTRUST_PLAYER3_RESUME_ACK_V1',
      editionSha256,unitId:'lesson-final'});
    emit(frame,{type:'AIRTRUST_PLAYER3_NAV_HINT_V1',
      editionSha256,unitId:'stage-1'});
    emit(frame,{type:'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',
      editionSha256,stageId:'stage-1',
      requestId:'00000000-0000-4000-8000-000000000001',
      answers:[{questionId:'q1',optionId:'o0'}]});
    await waitFor(()=>expect(authenticatedFetch).toHaveBeenCalledTimes(6));
    expect(authenticatedFetch.mock.calls.map(call=>call[1]?.method))
      .toEqual(['GET','POST','GET','GET','POST','GET']);
    expect(authenticatedFetch.mock.calls[0][0])
      .toBe('/api/lms/native/matriculas/911/sessao');
    expect(authenticatedFetch.mock.calls[3][0])
      .toBe('/api/lms/native/matriculas/911/etapas/sessao');
  });
  it('refreshes official stage eligibility after verified checkpoint without rewinding live iframe',async()=>{
    const nav={
      matriculaId:911,empresaId:6,cicloId:800,editionSha256,
      nextUnitId:'lesson-final',checkpointUnitIds:['lesson-final'],
      lastVisitedUnitId:null,
    };
    const before={
      matricula_id:911,ciclo_id:800,edition_sha256:editionSha256,
      mode:'LEARN',next_sequence:1,seen_lesson_ids:[],
      last_visited_unit_id:null,
    };
    const after={...before,next_sequence:2,
      seen_lesson_ids:['lesson-final'],last_visited_unit_id:'lesson-final'};
    const checkpoint={state:'APPLIED',committed_sequence:1,
      edition_sha256:editionSha256,completion_supported:false};
    const onCheckpoint=vi.fn();
    authenticatedFetch
      .mockResolvedValueOnce(payload(before))
      .mockResolvedValueOnce(payload(checkpoint,201))
      .mockResolvedValueOnce(payload(after))
      .mockResolvedValue(payload(after));
    const view=render(<Player3Html5Host {...props} navigation={nav}
      onVerifiedLessonCheckpoint={onCheckpoint}
      assessmentPresentation="authored-html5" pendingAssessment={null}/>);
    const frame=screen.getByTitle('Conteúdo original — Doutrinamento') as HTMLIFrameElement;
    const post=vi.spyOn(frame.contentWindow!,'postMessage');
    fireEvent.load(frame);
    await waitFor(()=>expect(post.mock.calls.filter(([msg])=>
      (msg as {type?:string}).type==='AIRTRUST_PLAYER3_RESUME_CURSOR_V1')).toHaveLength(1));
    emit(frame,{type:'AIRTRUST_PLAYER3_RESUME_ACK_V1',
      editionSha256,unitId:'lesson-final'});
    emit(frame,{type:'AIRTRUST_PLAYER3_NAV_HINT_V1',
      editionSha256,unitId:'stage-1'});
    await waitFor(()=>expect(onCheckpoint).toHaveBeenCalledTimes(1));
    expect(authenticatedFetch.mock.calls.map(([,opts])=>opts?.method))
      .toEqual(['GET','POST','GET']);

    // A new launch projection arrives on the same mounted frame.
    view.rerender(<Player3Html5Host {...props} navigation={{...nav,
      nextUnitId:'stage-1',lastVisitedUnitId:'lesson-final'}}
      onVerifiedLessonCheckpoint={onCheckpoint}
      assessmentPresentation="authored-html5" pendingAssessment={null}/>);
    expect(post.mock.calls.filter(([msg])=>
      (msg as {type?:string}).type==='AIRTRUST_PLAYER3_RESUME_CURSOR_V1'))
      .toHaveLength(1);
    expect(screen.getByTitle('Conteúdo original — Doutrinamento')).toBe(frame);
    post.mockRestore();
  });
  it('keeps module blocked after a successful POST if Worker re-read disagrees',async()=>{
    authenticatedFetch.mockResolvedValueOnce(payload(session(false,0)))
      .mockResolvedValueOnce(payload(official,201))
      .mockResolvedValueOnce(payload(session(false,0)));
    const passed=vi.fn();
    render(<Player3Html5Host {...props} pendingAssessment={{
      context,onVerifiedStagePassed:passed,onDismiss:vi.fn(),
    }}/>);
    selected();
    expect(await screen.findByRole('status')).toHaveTextContent(/Reabra a sessão/);
    expect(screen.queryByRole('button',{name:'Prosseguir para o próximo módulo'}))
      .toBeNull();
    expect(passed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
    expect(authenticatedFetch).toHaveBeenCalledTimes(3);
  });
  it('preserves ambiguous-POST lock when the same assessment is dismissed and reopened',async()=>{
    authenticatedFetch.mockResolvedValueOnce(payload(session(false,0)))
      .mockRejectedValueOnce(new Error('response lost after Worker commit'));
    const pending=(ctx:typeof context)=>({
      context:ctx,onVerifiedStagePassed:vi.fn(),onDismiss:vi.fn(),
    });
    const {rerender}=render(<Player3Html5Host {...props}
      pendingAssessment={pending(context)}/>);
    selected();
    expect(await screen.findByRole('status')).toHaveTextContent(/Reabra a sessão/);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    // A legitimate parent refresh may remount the modal with a new context
    // object while the same enrollment/stage remains mounted in the host.
    rerender(<Player3Html5Host {...props} pendingAssessment={null}/>);
    rerender(<Player3Html5Host {...props} pendingAssessment={pending({
      ...context,questions:context.questions.map(q=>({
        ...q,options:q.options.map(o=>({...o})),
      })),
    })}/>);
    selected();
    expect(await screen.findByRole('status')).toHaveTextContent(/Reabra a sessão/);
    // No new GET/POST and, crucially, no second eventId/attempt.
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  });
  it('fails closed on a changed question policy for the same pinned stage',async()=>{
    authenticatedFetch.mockResolvedValueOnce(payload(session(false,0)))
      .mockRejectedValueOnce(new Error('response lost after Worker commit'));
    const pending=(ctx:typeof context)=>({
      context:ctx,onVerifiedStagePassed:vi.fn(),onDismiss:vi.fn(),
    });
    const {rerender}=render(<Player3Html5Host {...props}
      pendingAssessment={pending(context)}/>);
    selected();
    expect(await screen.findByRole('status')).toHaveTextContent(/Reabra a sessão/);
    rerender(<Player3Html5Host {...props} pendingAssessment={null}/>);
    rerender(<Player3Html5Host {...props} pendingAssessment={pending({
      ...context,questions:[{...context.questions[0],
        options:[{id:'o2',text:'Nova opção'},{id:'o3',text:'Outra opção'}],
      }],
    })}/>);
    fireEvent.click(screen.getByRole('radio',{name:'Nova opção'}));
    fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
    expect(await screen.findByRole('status')).toHaveTextContent(/Reabra a sessão/);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  });
  it('does not render mismatched edition even with a passed caller-supplied receipt',async()=>{
    render(<Player3Html5Host {...props} pendingAssessment={{
      context:{...context,editionSha256:'b'.repeat(64)},
      onVerifiedStagePassed:vi.fn(),onDismiss:vi.fn(),
    }}/>);
    expect(screen.getByRole('alert')).toHaveTextContent(/edição diferente/);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(()=>expect(authenticatedFetch).not.toHaveBeenCalled());
  });
});
