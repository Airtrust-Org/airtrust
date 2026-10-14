/**
 * Staging-only, enrollment-bound entry for the original Player 3 HTML5 host.
 * A new Worker launch is required on every mount; no browser-configured URL
 * or review ZIP may upgrade to an official learner course.
 */
import {useEffect,useState} from 'react';
import {API_BASE_URL,fetchWithAuth} from '@/react-app/config/api';
import Player3Html5Host from './Player3Html5Host';
import {validatePlayer3Launch, type Launch} from './Player3AuthoredLaunchValidation';
import NativeStagingCoursePreview from '../native/NativeStagingCoursePreview';

type ResponseBody={success?:boolean;data?:Launch};
type State={kind:'LOADING'|'BLOCKED'|'LEGACY_PREVIEW'}|
  {kind:'READY';launch:Launch};
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;

export default function Player3AuthenticatedStagingEntry({
  matriculaId,empresaId,cursoId,title,active,
}:{
  matriculaId:number;empresaId:number;cursoId:number;title:string;active:boolean;
}){
  const [state,setState]=useState<State>({kind:'LOADING'});
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setState({kind:'LOADING'});
    if(!active||![matriculaId,empresaId,cursoId].every(positive)){
      setState({kind:'LEGACY_PREVIEW'});
      return ()=>controller.abort();
    }
    void (async()=>{
      const res=await fetchWithAuth(
        API_BASE_URL+'/lms/native/matriculas/'+matriculaId+'/etapas/lancamento',
        {method:'GET',cache:'no-store',signal:controller.signal});
      // Feature flag absent is not an error for the existing Native pilot.
      if(res.status===404){
        if(!controller.signal.aborted)setState({kind:'LEGACY_PREVIEW'});
        return;
      }
      if(!res.ok)throw Error('PLAYER3_LAUNCH_NOT_APPROVED');
      const payload=await res.json() as ResponseBody;
      if(payload.success!==true||!validatePlayer3Launch(payload.data,{
        matriculaId,empresaId,cursoId,
      }))throw Error('PLAYER3_LAUNCH_SCOPE_INVALID');
      if(!controller.signal.aborted)setState({kind:'READY',launch:payload.data!});
    })().catch(()=>{
      if(!controller.signal.aborted)setState({kind:'BLOCKED'});
    });
    return ()=>controller.abort();
  },[matriculaId,empresaId,cursoId,active,refresh]);

  if(state.kind==='LOADING')return (
    <p role="status">Verificando edição aprovada do Player 3…</p>
  );
  if(state.kind==='LEGACY_PREVIEW')return (
    <NativeStagingCoursePreview matriculaId={matriculaId}/>
  );
  if(state.kind==='BLOCKED')return (
    <p role="alert">Player 3 indisponível: lançamento ainda não autorizado.
      Nenhum progresso, nota ou certificado foi alterado.</p>
  );
  const launch=state.launch;
  const stage=launch.pending_assessment;
  return <Player3Html5Host
    key={[matriculaId,launch.ciclo_id,launch.edition_sha256].join(':')}
    title={title}
    contentUrl={launch.content_url}
    contentOrigin={launch.content_origin}
    editionSha256={launch.edition_sha256}
    reviewOnly={false}
    assessmentPresentation="authored-html5"
    pendingAssessment={stage?{
      context:{
        empresaId,matriculaId,cicloId:launch.ciclo_id,
        editionSha256:launch.edition_sha256,
        stageId:stage.stage_id,title:stage.title,
        questions:stage.questions,
      },
      onVerifiedStagePassed:()=>setRefresh(n=>n+1),
      onDismiss:()=>undefined,
    }:null}
    terminalScope={launch.official_stages_passed?{
      matriculaId,cycleId:launch.ciclo_id,editionSha256:launch.edition_sha256,
    }:null}
  />;
}
