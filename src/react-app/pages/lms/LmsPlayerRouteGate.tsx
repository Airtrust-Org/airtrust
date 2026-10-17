/**
 * Single legacy/Player3 decision point for the ordinary LMS launch route.
 *
 * Most courses remain legacy SCORM. Only a Worker-authenticated, tenant- and
 * learner-scoped Native admission may divert the physical SCORM record into
 * Player3. The browser never infers the marker from `tipo_conteudo`.
 *
 * An unavailable/ambiguous admission must not fall back to legacy SCORM:
 * a governed Player3 edition could otherwise be completed by the old engine.
 */
import {useEffect,useState} from 'react';
import {Navigate,useParams} from 'react-router-dom';
import {useAuth} from '@/react-app/hooks/useAuth';
import {API_BASE_URL,fetchWithAuth} from '@/react-app/config/api';
import LmsPlayer from './LmsPlayer';

type GateResult='LEGACY'|'PLAYER3'|'BLOCKED';
type GateState={scope:string;result:GateResult};
type AdmissionResponse={
  success?:boolean;
  code?:string;
  data?:{
    matricula_id?:number;curso_id?:number;
    mode?:string;native_package?:string;
  };
};
const allowedLegacyCodes=new Set([
  'NATIVE_PLAYER_NOT_ENABLED',
  'NATIVE_COURSE_NOT_AVAILABLE',
]);
const validId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;

/**
 * This component owns the admission result for exactly one mounted identity.
 * The outer gate unmounts it on logout or account/tenant change, so a previously
 * approved SCORM or Player3 route cannot reappear during re-authentication.
 */
function ScopedPlayerLaunch({id,scope}:{id:number;scope:string}){
  const [state,setState]=useState<GateState|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    void(async()=>{
      const response=await fetchWithAuth(
        API_BASE_URL+'/lms/native/matriculas/'+id+'/admissao',
        {method:'GET',cache:'no-store',signal:controller.signal},
      );
      const body=await response.json() as AdmissionResponse;
      if(response.status===404&&
         allowedLegacyCodes.has(body?.code??'')){
        if(!controller.signal.aborted)setState({scope,result:'LEGACY'});
        return;
      }
      const admitted=response.status===200&&response.ok&&
        body?.success===true&&body.data?.matricula_id===id&&
        validId(body.data.curso_id)&&
        (body.data.mode==='LEARN'||body.data.mode==='REVIEW')&&
        body.data.native_package==='NOT_YET_ENABLED';
      if(!controller.signal.aborted)setState({
        scope,result:admitted?'PLAYER3':'BLOCKED',
      });
    })().catch(()=>{
      if(!controller.signal.aborted)setState({scope,result:'BLOCKED'});
    });
    return()=>controller.abort();
  },[id,scope]);

  if(state?.scope!==scope){
    return <p role="status">Verificando o player autorizado para esta matrícula…</p>;
  }
  if(state.result==='LEGACY')return <LmsPlayer/>;
  if(state.result==='PLAYER3'){
    return <Navigate to={'/lms/player/native/'+id} replace/>;
  }
  return <p role="alert">Não foi possível confirmar o player desta matrícula.
    Nenhuma conclusão ou progresso foi enviado.</p>;
}

export default function LmsPlayerRouteGate(){
  const {matriculaId}=useParams<{matriculaId:string}>();
  const {user,empresaAtualId,isAuthenticated}=useAuth();
  const idValid=typeof matriculaId==='string'&&
    /^[1-9][0-9]{0,15}$/.test(matriculaId);
  const id=idValid?Number(matriculaId):0;
  const canCheck=idValid&&validId(id)&&isAuthenticated&&
    validId(user?.id)&&validId(empresaAtualId);
  if(!canCheck){
    return <p role="alert">Acesso à matrícula não autorizado.</p>;
  }
  const scope=[user.id,empresaAtualId,id].join(':');
  return <ScopedPlayerLaunch key={scope} id={id} scope={scope}/>;
}
