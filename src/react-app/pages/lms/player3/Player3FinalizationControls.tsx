/**
 * Player 3 finalization: one explicit learner action, checked entirely by the
 * authenticated Worker. Advisory readiness cannot certify a course. The
 * terminal POST accepts no client score, progress, identity or answers.
 */
import {useRef,useState} from 'react';
import {API_BASE_URL,fetchWithAuth} from '@/react-app/config/api';

export type Player3TerminalScope=Readonly<{
  matriculaId:number;cycleId:number;editionSha256:string;
}>;
type Readiness=Readonly<{
  matricula_id:number;cycleId:number;editionSha256:string;
  totalRequiredLessons:number;verifiedLessons:number;
  officialStageCount:number;officialStagesPassed:number;
  readyForAtomicTerminalPreflight:boolean;
  reason:string;
  completionSupported:false;completion_supported:false;
}>;
type Terminal=Readonly<{
  matricula_id:number;status:'CONCLUIDO';
  qualification_outcome:'qualification_created'|'qualification_reused'|'qualification_not_required';
  certificate_state:'REQUIRES_VERIFICATION'|'NOT_APPLICABLE';
}>;
/**
 * Read-only D1 + R2 reconciliation. Even PDF_HEADER_VERIFIED checks just
 * the archive's PDF prefix; only an authenticated full stream download in
 * the learner's history can prove an accessible complete certificate.
 */
type ArchiveState=
  | 'ENROLLMENT_NOT_COMPLETED' | 'NOT_APPLICABLE'
  | 'HISTORY_NOT_LINKED' | 'HISTORY_INVALID'
  | 'CERTIFICATE_NOT_ARCHIVED' | 'CERTIFICATE_OBJECT_MISSING'
  | 'CERTIFICATE_PDF_INVALID' | 'PDF_HEADER_VERIFIED';
type Archive=Readonly<{
  matricula_id:number;ciclo_id:number|null;matricula_status:string;
  historico_id:number|null;certificate_state:ArchiveState;
  documento_id:number|null;stream_path:string|null;stream_verified:false;
}>;
const VALID_STATES:readonly ArchiveState[]=[
  'ENROLLMENT_NOT_COMPLETED','NOT_APPLICABLE','HISTORY_NOT_LINKED',
  'HISTORY_INVALID','CERTIFICATE_NOT_ARCHIVED','CERTIFICATE_OBJECT_MISSING',
  'CERTIFICATE_PDF_INVALID','PDF_HEADER_VERIFIED',
];
const certificateMessage=(state:ArchiveState)=>
  state==='PDF_HEADER_VERIFIED'
    ? 'Conclusão registrada. O arquivo do certificado foi localizado. Confira sua abertura no histórico de qualificações.'
    : 'Conclusão registrada. Certificado ainda pendente de verificação no histórico.';
const validId=(n:number)=>Number.isSafeInteger(n)&&n>0;
const SHA=/^[a-f0-9]{64}$/;

export default function Player3FinalizationControls({
  scope,
}: {scope:Player3TerminalScope}){
  const [state,setState]=useState<'IDLE'|'CHECKING'|'NOT_READY'|'UNCERTAIN'|'RECORDED'>('IDLE');
  const [message,setMessage]=useState('');
  const inFlight=useRef(false);
  if(!validId(scope.matriculaId)||!validId(scope.cycleId)||
     !SHA.test(scope.editionSha256)){
    return <p role="alert">Conclusão indisponível: matrícula ou edição inválida.</p>;
  }
  const base=`${API_BASE_URL}/lms/native/matriculas/${scope.matriculaId}/etapas`;
  async function checkArchive():Promise<Archive>{
    const response=await fetchWithAuth(base+'/certificado',{
      method:'GET',cache:'no-store',
    });
    if(!response.ok)throw Error('PLAYER3_ARCHIVE_UNAVAILABLE');
    const outer=await response.json() as {success?:boolean;data?:Archive};
    const row=outer?.data;
    if(outer?.success!==true||!row||
       row.matricula_id!==scope.matriculaId||
       row.ciclo_id!==scope.cycleId||
       typeof row.matricula_status!=='string'||
       !VALID_STATES.includes(row.certificate_state)||
       row.stream_verified!==false||
       !(row.historico_id===null||validId(row.historico_id))){
      throw Error('PLAYER3_ARCHIVE_SCOPE_INVALID');
    }
    if(row.matricula_status==='CONCLUIDO'){
      if(row.certificate_state==='ENROLLMENT_NOT_COMPLETED'){
        throw Error('PLAYER3_ARCHIVE_CONFLICT');
      }
      const pdf=row.certificate_state==='PDF_HEADER_VERIFIED';
      if(pdf && (!validId(row.documento_id!)||
         row.stream_path!==
           '/api/pasta-virtual/stream/'+String(row.documento_id))){
        throw Error('PLAYER3_ARCHIVE_DOCUMENT_INVALID');
      }
      if(!pdf&&(row.documento_id!==null||row.stream_path!==null)){
        throw Error('PLAYER3_ARCHIVE_DOCUMENT_INVALID');
      }
    }else if(!['EM_ANDAMENTO','NAO_INICIADO'].includes(row.matricula_status)||
             row.certificate_state!=='ENROLLMENT_NOT_COMPLETED'||
             row.documento_id!==null||row.stream_path!==null){
      throw Error('PLAYER3_ARCHIVE_STATUS_INVALID');
    }
    return row;
  }

  /** Safe after a lost POST reply: never initiates a new terminal write. */
  async function reconcile(){
    if(inFlight.current)return;
    inFlight.current=true;
    setState('CHECKING');
    try{
      const row=await checkArchive();
      if(row.matricula_status==='CONCLUIDO'){
        setState('RECORDED');setMessage(certificateMessage(row.certificate_state));
      }else{
        setState('UNCERTAIN');
        setMessage('A matrícula ainda não consta como concluída. Reabra o treinamento para revisar a situação; nenhuma nova conclusão foi enviada.');
      }
    }catch{
      setState('UNCERTAIN');
      setMessage('Não foi possível consultar o histórico. Reabra o treinamento ou tente apenas consultar novamente; nenhuma nova conclusão foi enviada.');
    }finally{inFlight.current=false;}
  }

  async function finish(){
    if(inFlight.current||state==='RECORDED'||state==='UNCERTAIN')return;
    inFlight.current=true;
    setState('CHECKING');setMessage('');
    let postStarted=false;
    try{
      // First ask the canonical database whether an earlier terminal commit
      // already won. A stale UI must never create a second qualification.
      const existing=await checkArchive();
      if(existing.matricula_status==='CONCLUIDO'){
        setState('RECORDED');
        setMessage(certificateMessage(existing.certificate_state));
        return;
      }
      const pre=await fetchWithAuth(base+'/prontidao',{method:'GET',cache:'no-store'});
      if(!pre.ok)throw Error('PLAYER3_READINESS_UNAVAILABLE');
      const data=(await pre.json() as {success?:boolean;data?:Readiness});
      const r=data.data;
      if(data.success!==true||!r||r.matricula_id!==scope.matriculaId||
         r.cycleId!==scope.cycleId||r.editionSha256!==scope.editionSha256||
         r.completionSupported!==false||r.completion_supported!==false||
         !Number.isSafeInteger(r.totalRequiredLessons)||r.totalRequiredLessons<1||
         !Number.isSafeInteger(r.verifiedLessons)||r.verifiedLessons<0||
         r.verifiedLessons>r.totalRequiredLessons||
         !Number.isSafeInteger(r.officialStageCount)||r.officialStageCount<1||
         !Number.isSafeInteger(r.officialStagesPassed)||r.officialStagesPassed<0||
         r.officialStagesPassed>r.officialStageCount||
         typeof r.readyForAtomicTerminalPreflight!=='boolean'||
         typeof r.reason!=='string'){
        throw Error('PLAYER3_READINESS_SCOPE_INVALID');
      }
      if(!r.readyForAtomicTerminalPreflight||
         r.reason!=='READY_FOR_TERMINAL_PREFLIGHT'||
         r.verifiedLessons!==r.totalRequiredLessons||
         r.officialStagesPassed!==r.officialStageCount){
        setState('NOT_READY');
        setMessage('Ainda há unidades ou avaliações pendentes. Nenhuma conclusão foi solicitada.');
        return;
      }
      postStarted=true;
      const response=await fetchWithAuth(base+'/concluir',{
        method:'POST',cache:'no-store',
      });
      if(response.status!==200)throw Error('PLAYER3_TERMINAL_UNCONFIRMED');
      const result=await response.json() as {success?:boolean;data?:Terminal};
      const receipt=result.data;
      const validOutcome=receipt&&(
        ((receipt.qualification_outcome==='qualification_created'||
          receipt.qualification_outcome==='qualification_reused')&&
          receipt.certificate_state==='REQUIRES_VERIFICATION')||
        (receipt.qualification_outcome==='qualification_not_required'&&
          receipt.certificate_state==='NOT_APPLICABLE')
      );
      if(result.success!==true||!receipt||
         receipt.matricula_id!==scope.matriculaId||
         receipt.status!=='CONCLUIDO'||!validOutcome){
        throw Error('PLAYER3_TERMINAL_RECEIPT_INVALID');
      }
      // The canonical receipt is committed, but the post-commit certificate
      // archive is independent. An unavailable archive never triggers a POST
      // replay and never invalidates an already verified completion receipt.
      let certificateState:ArchiveState='CERTIFICATE_NOT_ARCHIVED';
      try{
        const archived=await checkArchive();
        if(archived.matricula_status==='CONCLUIDO'){
          certificateState=archived.certificate_state;
        }
      }catch{/* receipt alone still confirms the committed terminal */}
      setState('RECORDED');
      setMessage(certificateMessage(certificateState));
    }catch{
      // Even HTTP 409 or a disconnected POST can mean a concurrent completion
      // committed. Only a fresh authenticated GET may resolve the ambiguity.
      if(postStarted){
        try{
          const archived=await checkArchive();
          if(archived.matricula_status==='CONCLUIDO'){
            setState('RECORDED');
            setMessage(certificateMessage(archived.certificate_state));
            return;
          }
        }catch{/* leave ambiguous; never replay the terminal */}
      }
      setState('UNCERTAIN');
      setMessage(postStarted
        ? 'Não foi possível confirmar a conclusão. Consulte a situação da matrícula; nenhuma nova conclusão será enviada.'
        : 'Não foi possível verificar os requisitos. Consulte a situação ou reabra o treinamento.');
    }finally{inFlight.current=false;}
  }
  return <div className="border-t px-4 py-3" aria-label="Conclusão Player 3">
    <button type="button" data-testid="player3-request-finalization"
      className="rounded bg-blue-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
      disabled={state==='CHECKING'||state==='RECORDED'||state==='UNCERTAIN'}
      onClick={()=>void finish()}>
      {state==='CHECKING'?'Verificando requisitos…':'Solicitar conclusão ao AirTrust'}
    </button>
    {message&&<p role="status" className="mt-2 text-sm text-slate-700">{message}</p>}
    {(state==='RECORDED'||state==='UNCERTAIN')&&
      <button type="button" data-testid="player3-recheck-completion"
        className="mt-3 rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={inFlight.current}
        onClick={()=>void reconcile()}>
        Consultar situação da conclusão
      </button>}
  </div>;
}
