/**
 * Staging-only, enrollment-bound entry for the original Player 3 HTML5 host.
 * A new Worker launch is required on every mount; no browser-configured URL
 * or review ZIP may upgrade to an official learner course.
 */
import {useEffect,useState} from 'react';
import {API_BASE_URL,fetchWithAuth} from '@/react-app/config/api';
import Player3Html5Host from './Player3Html5Host';
import type {P3LearnerQuestion} from './Player3AssessmentModal';
import NativeStagingCoursePreview from '../native/NativeStagingCoursePreview';

type Launch=Readonly<{
  empresa_id:number;matricula_id:number;curso_id:number;ciclo_id:number;
  edition_sha256:string;content_url:string;content_origin:string;
  assessment_presentation:'authored-html5';
  official_stages_passed:boolean;completion_supported:false;
  pending_assessment:null|Readonly<{
    stage_id:string;title:string;questions:readonly P3LearnerQuestion[];
  }>;
}>;
type ResponseBody={success?:boolean;data?:Launch};
type State={kind:'LOADING'|'BLOCKED'|'LEGACY_PREVIEW'}|
  {kind:'READY';launch:Launch};
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;

export function validatePlayer3Launch(
  data:Launch|undefined,scope:{matriculaId:number;empresaId:number;cursoId:number},
):data is Launch{
  if(!data||data.matricula_id!==scope.matriculaId||
     data.empresa_id!==scope.empresaId||data.curso_id!==scope.cursoId||
     !positive(data.ciclo_id)||!SHA.test(data.edition_sha256)||
     data.assessment_presentation!=='authored-html5'||
     data.completion_supported!==false||
     typeof data.official_stages_passed!=='boolean'||
     Boolean(data.pending_assessment)===data.official_stages_passed)return false;
  try{
    const origin=new URL(data.content_origin);
    const url=new URL(data.content_url);
    if(origin.protocol!=='https:'||origin.href!==origin.origin+'/'||
       url.origin!==origin.origin||url.search||url.hash||
       url.username||url.password||
       !/^\/player3\/[1-9][0-9]*\/[1-9][0-9]*\/[a-f0-9]{64}\/[a-f0-9]{64}\/index\.html$/.test(url.pathname)||
       !url.pathname.startsWith('/player3/'+scope.empresaId+'/'+scope.cursoId+'/'+data.edition_sha256+'/')){
      return false;
    }
  }catch{return false;}
  const assessment=data.pending_assessment;
  if(!assessment)return data.official_stages_passed;
  if(!ID.test(assessment.stage_id)||!assessment.title?.trim()||
     !Array.isArray(assessment.questions)||assessment.questions.length<1||
     assessment.questions.length>100)return false;
  const questions=new Set<string>();
  return assessment.questions.every(q=>{
    if(!q||!ID.test(q.id)||questions.has(q.id)||!q.prompt?.trim()||
       !Array.isArray(q.options)||q.options.length<2||q.options.length>12)return false;
    questions.add(q.id);
    const ids=new Set<string>();
    return q.options.every(o=>{
      if(!o||!ID.test(o.id)||ids.has(o.id)||!o.text?.trim()||
         'correctOptionId' in o||'feedbackCorrect' in o||'feedbackIncorrect' in o){
        return false;
      }
      ids.add(o.id);return true;
    });
  });
}

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
      setState({kind:'BLOCKED'});
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
