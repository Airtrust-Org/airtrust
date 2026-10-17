/**
 * Staging-only, enrollment-bound entry for the original Player 3 HTML5 host.
 * A new Worker launch is required on every mount; no browser-configured URL
 * or review ZIP may upgrade to an official learner course.
 */
import {useEffect,useRef,useState} from 'react';
import {API_BASE_URL,fetchWithAuth} from '@/react-app/config/api';
import Player3Html5Host from './Player3Html5Host';
import {validatePlayer3Launch, type Launch} from './Player3AuthoredLaunchValidation';
import NativeStagingCoursePreview from '../native/NativeStagingCoursePreview';

type ResponseBody={success?:boolean;data?:Launch};
type State={kind:'LOADING'|'BLOCKED'|'LEGACY_PREVIEW'}|
  {kind:'READY';launch:Launch};
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
// A stage refresh may retain the authored frame ONLY within the identical
// authorized enrollment. Tenant/learner changes must synchronously hide it.
const launchMatches=(launch:Launch,empresaId:number,cursoId:number,
  matriculaId:number)=>launch.empresa_id===empresaId &&
  launch.curso_id===cursoId && launch.matricula_id===matriculaId;

export default function Player3AuthenticatedStagingEntry({
  matriculaId,empresaId,cursoId,title,active,allowLegacyNativePreview=false,
  completed=false,
}:{
  matriculaId:number;empresaId:number;cursoId:number;title:string;active:boolean;
  /** Only the physical Native V1 pilot may use its earlier assessment UI. */
  allowLegacyNativePreview?:boolean;
  /** Completed enrollment is read-only: never issue a new start. */
  completed?:boolean;
}){
  const [state,setState]=useState<State>({kind:'LOADING'});
  const [refresh,setRefresh]=useState(0);
  // A fresh enrollment uses the verified Native start receipt before launch.
  // A scoped latch cannot be reused for a different tenant, course or enrollment.
  const [verifiedStartScope,setVerifiedStartScope]=useState('');
  const [activatedStartState,setActivatedStartState]=useState<'IDLE'|'STARTING'|'BLOCKED'|'RECHECKING'>('IDLE');
  const activatedStartIssued=useRef(false);
  const scopeKey=[empresaId,cursoId,matriculaId].join(':');
  // A previously verified start cannot keep an authored learner iframe alive
  // after the enrollment becomes completed in another tab or refresh.
  const learnerStarted=!completed&&(active||verifiedStartScope===scopeKey);
  const readyForScope=state.kind==='READY' && learnerStarted &&
    launchMatches(state.launch,empresaId,cursoId,matriculaId);
  useEffect(()=>{
    const controller=new AbortController();
    // Do not unmount the authored iframe while delivering a persisted stage
    // verdict: postMessage delivery is asynchronous. Keep its exact pinned
    // frame mounted while refreshing the next Worker-authenticated projection.
    setState(previous=>previous.kind==='READY' && learnerStarted &&
      launchMatches(previous.launch,empresaId,cursoId,matriculaId)
      ?previous:{kind:'LOADING'});
    if(!learnerStarted||![matriculaId,empresaId,cursoId].every(positive)){
      setState({kind:allowLegacyNativePreview?'LEGACY_PREVIEW':'BLOCKED'});
      return ()=>controller.abort();
    }
    void (async()=>{
      const res=await fetchWithAuth(
        API_BASE_URL+'/lms/native/matriculas/'+matriculaId+'/etapas/lancamento',
        {method:'GET',cache:'no-store',signal:controller.signal});
      // A 404 is NOT a license to fall back to another completion engine.
      // Only physical Native V1 may retain its own pilot when explicitly OFF.
      if(res.status===404){
        const unavailable=await res.json() as {code?:string};
        if(!controller.signal.aborted)setState({
          kind:allowLegacyNativePreview &&
            unavailable?.code==='PLAYER3_AUTHORED_LAUNCH_NOT_ENABLED'
            ?'LEGACY_PREVIEW':'BLOCKED',
        });
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
  },[matriculaId,empresaId,cursoId,learnerStarted,refresh,allowLegacyNativePreview]);

  // An activated SCORM-backed course must never use the old Native pilot
  // as its start button. Perform one explicit, Worker-owned Native start and
  // re-read the durable edition/cycle before requesting authored HTML5.
  async function startActivatedScorm(){
    if(allowLegacyNativePreview||completed||learnerStarted||
       activatedStartIssued.current||
       ![empresaId,cursoId,matriculaId].every(positive))return;
    activatedStartIssued.current=true;
    setActivatedStartState('STARTING');
    const base=API_BASE_URL+'/lms/native/matriculas/'+matriculaId;
    try{
      const response=await fetchWithAuth(base+'/iniciar',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:'{}',
      });
      if(!response.ok)throw Error('PLAYER3_START_NOT_CONFIRMED');
      const body=await response.json() as {success?:boolean;data?:{
        state?:string;ciclo_id?:number;edition_sha256?:string;
        completion_supported?:boolean;
      }};
      const receipt=body?.data;
      if(body.success!==true||!receipt||!positive(receipt.ciclo_id!)||
         !/^[a-f0-9]{64}$/.test(receipt.edition_sha256??'')||
         receipt.completion_supported!==false||
         !['STARTED','ALREADY_STARTED'].includes(receipt.state??'')){
        throw Error('PLAYER3_START_SCOPE_INVALID');
      }
      const verify=await fetchWithAuth(base+'/sessao',{
        method:'GET',cache:'no-store',
      });
      if(!verify.ok)throw Error('PLAYER3_START_RECHECK_UNAVAILABLE');
      const snapshot=await verify.json() as {success?:boolean;data?:{
        matricula_id?:number;ciclo_id?:number;edition_sha256?:string;
        mode?:string;next_sequence?:number;
      }};
      if(snapshot.success!==true||
         snapshot.data?.matricula_id!==matriculaId||
         snapshot.data?.ciclo_id!==receipt.ciclo_id||
         snapshot.data?.edition_sha256!==receipt.edition_sha256||
         snapshot.data?.mode!=='LEARN'||
         !positive(snapshot.data.next_sequence!)){
        throw Error('PLAYER3_START_RECHECK_CONFLICT');
      }
      setVerifiedStartScope(scopeKey);
    }catch{
      // A lost HTTP reply may hide a committed D1 start. No automatic
      // duplicate POST; a fresh session can resume via authenticated GET.
      setActivatedStartState('BLOCKED');
    }
  }

  // Lost POST responses are ambiguous: the transactional start may have
  // committed despite an HTTP error. Never replay the write. Recovery is a
  // separate, explicitly requested read-only check of the authoritative LMS
  // enrollment AND Native edition/cycle, followed by the normal authenticated
  // authored-launch admission. A session snapshot alone cannot prove STARTED:
  // an untouched NAO_INICIADO enrollment also has a LEARN-mode snapshot.
  async function verifyPersistedStartWithoutPost(){
    if(allowLegacyNativePreview||completed||learnerStarted||
       activatedStartState!=='BLOCKED'||!activatedStartIssued.current||
       ![empresaId,cursoId,matriculaId].every(positive))return;
    setActivatedStartState('RECHECKING');
    const base=API_BASE_URL+'/lms/native/matriculas/'+matriculaId;
    try{
      const enrollmentResponse=await fetchWithAuth(
        API_BASE_URL+'/lms/matriculas/'+matriculaId,
        {method:'GET',cache:'no-store'},
      );
      if(!enrollmentResponse.ok)throw Error('PLAYER3_START_STATUS_UNAVAILABLE');
      const enrollment=await enrollmentResponse.json() as {
        success?:boolean;data?:{
          id?:number;empresa_id?:number;curso_id?:number;
          tipo_conteudo?:string;status?:string;
        };
      };
      if(enrollment.success!==true||
         enrollment.data?.id!==matriculaId||
         enrollment.data?.empresa_id!==empresaId||
         enrollment.data?.curso_id!==cursoId||
         enrollment.data?.tipo_conteudo!=='scorm'||
         enrollment.data?.status!=='EM_ANDAMENTO'){
        throw Error('PLAYER3_START_NOT_PERSISTED');
      }
      const sessionResponse=await fetchWithAuth(base+'/sessao',{
        method:'GET',cache:'no-store',
      });
      if(!sessionResponse.ok)throw Error('PLAYER3_START_SESSION_UNAVAILABLE');
      const session=await sessionResponse.json() as {success?:boolean;data?:{
        matricula_id?:number;ciclo_id?:number;
        edition_sha256?:string;mode?:string;next_sequence?:number;
      }};
      if(session.success!==true||
         session.data?.matricula_id!==matriculaId||
         !positive(session.data?.ciclo_id??0)||
         !/^[a-f0-9]{64}$/.test(session.data?.edition_sha256??'')||
         session.data?.mode!=='LEARN'||
         !positive(session.data?.next_sequence??0)){
        throw Error('PLAYER3_START_SESSION_SCOPE_MISMATCH');
      }
      setVerifiedStartScope(scopeKey);
    }catch{
      // Read-only verification can be repeated; the original POST cannot.
      setActivatedStartState('BLOCKED');
    }
  }

  if(!learnerStarted&&!allowLegacyNativePreview){
    if(completed)return <p role="status">
      Treinamento concluído. Consulte o histórico de qualificações e certificados.
    </p>;
    return <section aria-label="Iniciar Player 3" className="px-4 py-3">
      <button type="button" onClick={()=>void startActivatedScorm()}
        disabled={activatedStartState!=='IDLE'}
        className="rounded border px-4 py-2 disabled:opacity-50">
        {activatedStartState==='STARTING'?'Confirmando início…':
         'Iniciar treinamento no Player 3'}
      </button>
      {activatedStartState==='RECHECKING'&&<p role="status">
        Conferindo matrícula e sessão no servidor, sem repetir o início…
      </p>}
      {activatedStartState==='BLOCKED'&&<>
        <p role="alert">O início ainda não foi confirmado. Nenhuma nova
          tentativa de gravação será enviada automaticamente.
          Reabra o treinamento se a conferência não confirmar o início.</p>
        <button type="button" onClick={()=>void verifyPersistedStartWithoutPost()}
          className="mt-2 rounded border px-4 py-2">
          Conferir início registrado
        </button>
      </>}
    </section>;
  }

  if(state.kind==='LOADING')return (
    <p role="status">Verificando edição aprovada do Player 3…</p>
  );
  if(state.kind==='LEGACY_PREVIEW')return (
    <NativeStagingCoursePreview key={scopeKey} matriculaId={matriculaId}
      onVerifiedStarted={()=>setVerifiedStartScope(scopeKey)}/>
  );
  if(state.kind==='BLOCKED')return (
    <p role="alert">Player 3 indisponível: lançamento ainda não autorizado.
      Nenhum progresso, nota ou certificado foi alterado.</p>
  );
  // React renders before effects run: never expose the preceding enrollment's
  // iframe or its protected assessment while new props await Worker admission.
  if(state.kind==='READY' && !readyForScope)return (
    <p role="status">Verificando edição aprovada do Player 3…</p>
  );
  if(state.kind!=='READY')return <p role="alert">Lançamento inválido.</p>;
  const launch=state.launch;
  const stage=launch.pending_assessment;
  return <Player3Html5Host
    key={[matriculaId,launch.ciclo_id,launch.edition_sha256].join(':')}
    title={title}
    contentUrl={launch.content_url}
    contentOrigin={launch.content_origin}
    editionSha256={launch.edition_sha256}
    reviewOnly={false}
    navigation={{
      empresaId,matriculaId,cicloId:launch.ciclo_id,
      editionSha256:launch.edition_sha256,
      nextUnitId:launch.resume_next_unit_id,
      checkpointUnitIds:launch.checkpoint_unit_ids,
      lastVisitedUnitId:launch.last_visited_unit_id,
    }}
    assessmentPresentation="authored-html5"
    // A newly earned checkpoint can unlock the official stage on a fresh
    // Worker projection. Preserve the same iframe; do not reload or rewind it.
    onVerifiedLessonCheckpoint={()=>setRefresh(n=>n+1)}
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
