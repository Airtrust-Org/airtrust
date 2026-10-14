import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {fetchWithAuth} from '@/react-app/config/api';
import Player3Html5Host from '@/react-app/pages/lms/player3/Player3Html5Host';

vi.mock('@/react-app/config/api',()=>({API_BASE_URL:'/api',fetchWithAuth:vi.fn()}));
const request=vi.mocked(fetchWithAuth);
const editionSha256='a'.repeat(64);
const base={
  title:'Doutrinamento RC8.1',
  contentUrl:'https://isolated.example/player3/6/57/'+editionSha256+
    '/'+'b'.repeat(64)+'/index.html',
  contentOrigin:'https://isolated.example',
  editionSha256,reviewOnly:false,
  navigation:{
    matriculaId:911,empresaId:6,cicloId:333,editionSha256,
    nextUnitId:'unit22',checkpointUnitIds:['unit21','unit22','unit23'],
    lastVisitedUnitId:'unit21',
  },
};
const body=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:true,data,
}),{status,headers:{'content-type':'application/json'}});
const initial={
  matricula_id:911,ciclo_id:333,edition_sha256:editionSha256,
  mode:'LEARN',next_sequence:2,seen_lesson_ids:['unit21'],
  last_visited_unit_id:'unit21',
};
const done={...initial,next_sequence:3,
  seen_lesson_ids:['unit21','unit22'],last_visited_unit_id:'unit22'};
function emit(frame:HTMLIFrameElement,origin:string,data:unknown){
  window.dispatchEvent(new MessageEvent('message',{
    origin,source:frame.contentWindow,data,
  }));
}
describe('RC8.1 original iframe ← Worker-authoritative cursor',()=>{
  beforeEach(()=>request.mockReset());
  it('sends pinned resume on load; only correct frame ACK permits GET→POST→GET',async()=>{
    request.mockResolvedValueOnce(body(initial))
      .mockResolvedValueOnce(body({state:'APPLIED',committed_sequence:2,
        edition_sha256:editionSha256,completion_supported:false},201))
      .mockResolvedValueOnce(body(done));
    render(<Player3Html5Host {...base}/>);
    const frame=screen.getByTitle('Conteúdo original — Doutrinamento RC8.1') as HTMLIFrameElement;
    const send=vi.spyOn(frame.contentWindow!,'postMessage');
    fireEvent.load(frame);
    await waitFor(()=>expect(send).toHaveBeenCalledWith({
      type:'AIRTRUST_PLAYER3_RESUME_CURSOR_V1',
      editionSha256,nextUnitId:'unit22',
    },base.contentOrigin));
    emit(frame,base.contentOrigin,{type:'AIRTRUST_PLAYER3_NAV_HINT_V1',
      editionSha256,unitId:'unit21'});
    emit(frame,'https://evil.example',{type:'AIRTRUST_PLAYER3_RESUME_ACK_V1',
      editionSha256,unitId:'unit22'});
    expect(request).not.toHaveBeenCalled();
    emit(frame,base.contentOrigin,{type:'AIRTRUST_PLAYER3_RESUME_ACK_V1',
      editionSha256,unitId:'unit22'});
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls.map(x=>x[1]?.method)).toEqual(['GET','POST','GET']);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('rejects wrong cursor and never creates progress from a forged ACK',async()=>{
    render(<Player3Html5Host {...base}/>);
    const frame=screen.getByTitle('Conteúdo original — Doutrinamento RC8.1') as HTMLIFrameElement;
    fireEvent.load(frame);
    emit(frame,base.contentOrigin,{type:'AIRTRUST_PLAYER3_RESUME_ACK_V1',
      editionSha256,unitId:'unit42'});
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps review-only entirely read-only, even with an accepted frame',async()=>{
    render(<Player3Html5Host {...base} reviewOnly/>);
    const frame=screen.getByTitle('Conteúdo original — Doutrinamento RC8.1') as HTMLIFrameElement;
    const send=vi.spyOn(frame.contentWindow!,'postMessage');
    fireEvent.load(frame);
    emit(frame,base.contentOrigin,{type:'AIRTRUST_PLAYER3_RESUME_ACK_V1',
      editionSha256,unitId:'unit22'});
    expect(send).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
