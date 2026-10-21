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

type GateResult='LEGACY'|'PLAYER3'|'PLAYER3_SCORM'|'BLOCKED';
type GateState={scope:string;result:GateResult};
type ScormAdmissionResponse={success?:boolean;code?:string;data?:{
  mode?:string;matricula_id?:number;curso_id?:number;
  package_sha256?:string;package_version?:string;
  completion_authorized?:boolean;exam_authorized?:boolean;certificate_authorized?:boolean;
}};
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
        // A Native 404 only excludes Native. It does NOT certify this course
        // as ordinary legacy SCORM: the Worker must check its pinned package.
        const scorm=await fetchWithAuth(
          API_BASE_URL+'/lms/matriculas/'+id+'/player3-scorm-admissao',
          {method:'GET',cache:'no-store',signal:controller.signal},
        );
        const scormBody=await scorm.json() as ScormAdmissionResponse;
        if(scorm.status===404&&
           scormBody?.code==='SCORM_PLAYER3_NOT_APPLICABLE'){
          if(!controller.signal.aborted)setState({scope,result:'LEGACY'});
          return;
        }
        const data=scormBody?.data;
        const validStudy=scorm.ok&&scorm.status===200&&
          scormBody.success===true&&data?.mode==='SCORM_STUDY'&&
          data.matricula_id===id&&validId(data.curso_id)&&
          typeof data.package_sha256==='string'&&
          /^[a-f0-9]{64}$/.test(data.package_sha256)&&
          typeof data.package_version==='string'&&data.package_version.length>0&&
          data.completion_authorized===false&&
          data.exam_authorized===false&&data.certificate_authorized===false;
        if(!controller.signal.aborted)setState({
          scope,result:validStudy?'PLAYER3_SCORM':'BLOCKED',
        });
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
  if(state.result==='PLAYER3_SCORM')return <LmsPlayer scormStudyOnly/>;
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
