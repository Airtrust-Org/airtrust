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
  qualification_outcome:'qualification_created'|'qualification_reused';
  certificate_state:'REQUIRES_VERIFICATION';
}>;
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
  async function finish(){
    if(inFlight.current||state==='RECORDED'||state==='UNCERTAIN')return;
    inFlight.current=true;
    setState('CHECKING');setMessage('');
    let postStarted=false;
    try{
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
      if(result.success!==true||!receipt||
         receipt.matricula_id!==scope.matriculaId||
         receipt.status!=='CONCLUIDO'||
         !['qualification_created','qualification_reused']
           .includes(receipt.qualification_outcome)||
         receipt.certificate_state!=='REQUIRES_VERIFICATION'){
        throw Error('PLAYER3_TERMINAL_RECEIPT_INVALID');
      }
      // The canonical D1 writer is already committed at this point. A PDF is
      // NOT asserted until a separate authenticated archive lookup succeeds.
      setState('RECORDED');
      setMessage('Conclusão registrada pelo AirTrust. Certificado pendente de verificação.');
    }catch{
      // If the POST was sent, a timeout is ambiguous. Never generate another
      // completion attempt without a fresh authenticated session.
      setState('UNCERTAIN');
      setMessage(postStarted
        ? 'Não foi possível confirmar a conclusão. Reabra o treinamento para consultar o histórico antes de tentar novamente.'
        : 'Não foi possível verificar os requisitos. Reabra o treinamento para atualizar a sessão.');
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
  </div>;
}
