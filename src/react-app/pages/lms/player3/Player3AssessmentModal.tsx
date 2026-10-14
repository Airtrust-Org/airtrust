/**
 * AirTrust Player 3 assessment panel: rendered over (not inside) original
 * author HTML5. This component never accesses exam keys or computes grades.
 * An authenticated Worker receipt must be verified against the entire scope.
 * It never directly marks a course completed or issues a certificate.
 */
import {useState} from 'react';

export type P3LearnerQuestion=Readonly<{
  id:string;prompt:string;options:readonly Readonly<{id:string;text:string}>[];
}>;
export type P3ExamContext=Readonly<{
  empresaId:number;matriculaId:number;cicloId:number;
  editionSha256:string;stageId:string;title:string;
  questions:readonly P3LearnerQuestion[];
}>;
export type P3ExamAnswer=Readonly<{questionId:string;optionId:string}>;
export type P3ExamReceipt=Readonly<{
  empresa_id:number;matricula_id:number;ciclo_id:number;
  edition_sha256:string;stage_id:string;attempt_number:number;
  stage_passed:boolean;score_pct:number;persisted:true;
}>;
export type P3ExamProps=Readonly<{
  context:P3ExamContext;
  submitOfficialAttempt:(answers:readonly P3ExamAnswer[])=>Promise<P3ExamReceipt>;
  onVerifiedStagePassed:(receipt:P3ExamReceipt)=>void;
  onDismiss:()=>void;
}>;
const sha=/^[0-9a-f]{64}$/;
const id=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
function validCourse(c:P3ExamContext) {
  const seen=new Set<string>();
  return [c.empresaId,c.matriculaId,c.cicloId].every(
    n=>Number.isSafeInteger(n)&&n>0) &&
    sha.test(c.editionSha256)&&id.test(c.stageId)&&
    typeof c.title==='string'&&c.title.trim().length>0 &&
    Array.isArray(c.questions)&&c.questions.length>0&&c.questions.length<=100 &&
    c.questions.every(q=>{
      if(!q||!id.test(q.id)||seen.has(q.id)||
        !q.prompt?.trim()||!Array.isArray(q.options)||
        q.options.length<2||q.options.length>12)return false;
      seen.add(q.id);
      const options=new Set<string>();
      return q.options.every(o=>{
        if(!o||!id.test(o.id)||options.has(o.id)||!o.text?.trim())return false;
        options.add(o.id);return true;
      });
    });
}
function Player3AssessmentSession({
  context,submitOfficialAttempt,onVerifiedStagePassed,onDismiss,
}:P3ExamProps) {
  const [choices,setChoices]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [receipt,setReceipt]=useState<P3ExamReceipt|null>(null);
  const valid=validCourse(context);
  const complete=valid&&context.questions.every(
    q=>q.options.some(o=>o.id===choices[q.id]));
  const passed=receipt?.persisted===true&&receipt.stage_passed===true;

  async function submit() {
    if(!complete||busy||passed||uncertain)return;
    setBusy(true);setMessage(null);
    try {
      const result=await submitOfficialAttempt(context.questions.map(q=>({
        questionId:q.id,optionId:choices[q.id],
      })));
      if(!result||result.empresa_id!==context.empresaId||
        result.matricula_id!==context.matriculaId||
        result.ciclo_id!==context.cicloId||
        result.edition_sha256!==context.editionSha256||
        result.stage_id!==context.stageId||
        !Number.isSafeInteger(result.attempt_number)||result.attempt_number<1||
        !Number.isFinite(result.score_pct)||result.score_pct<0||result.score_pct>100||
        typeof result.stage_passed!=='boolean'||result.persisted!==true)
        throw new Error('PLAYER3_INVALID_SERVER_RECEIPT');
      setReceipt(result);
      setMessage(result.stage_passed
        ? 'Avaliação registrada e aprovada pelo AirTrust. Próximo módulo liberado.'
        : 'Avaliação registrada. Revise o conteúdo e tente novamente.');
    }catch{
      // Ambiguous writes must be re-read, never retried with an invented attempt.
      setUncertain(true);
      setMessage('Resposta não confirmada pelo servidor. Reabra a sessão antes de reenviar.');
    }finally{setBusy(false);}
  }
  if(!valid)return (
    <p role="alert">Avaliação indisponível: contrato inválido. Nenhum progresso alterado.</p>
  );
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4"
      data-testid="player3-assessment-overlay">
      <section role="dialog" aria-modal="true"
        aria-label={'Avaliação AirTrust — '+context.title}
        className="max-h-[92vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
            AirTrust · Avaliação oficial
          </p>
          <h2 className="text-xl font-bold text-slate-900">{context.title}</h2>
          <p className="text-sm text-slate-600">
            A avaliação e a liberação são verificadas no servidor, sem alterar
            o conteúdo visual do treinamento. Esta janela não emite certificados.
          </p>
        </header>
        {context.questions.map((q,i)=>(
          <fieldset key={q.id} disabled={busy||passed}
            className="space-y-3 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 font-semibold text-slate-900">{i+1}. {q.prompt}</legend>
            {q.options.map(o=>(
              <label key={o.id}
                className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-slate-100">
                <input type="radio" name={'p3-'+context.stageId+'-'+q.id}
                  value={o.id} checked={choices[q.id]===o.id}
                  onChange={()=>setChoices(c=>({...c,[q.id]:o.id}))}
                  className="mt-1"/>
                <span className="text-sm text-slate-800">{o.text}</span>
              </label>
            ))}
          </fieldset>
        ))}
        {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
        <footer className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={busy} onClick={onDismiss}
            className="rounded-lg border px-4 py-2 text-sm font-medium">
            Voltar ao treinamento
          </button>
          {passed?(
            <button type="button"
              onClick={()=>{if(receipt)onVerifiedStagePassed(receipt);}}
              className="rounded-lg bg-blue-900 px-5 py-2 font-semibold text-white">
              Prosseguir para o próximo módulo
            </button>
          ):(
            <button type="button" disabled={!complete||busy||uncertain}
              onClick={()=>void submit()}
              className="rounded-lg bg-blue-900 px-5 py-2 font-semibold text-white disabled:opacity-50">
              {busy?'Registrando…':'Enviar avaliação ao AirTrust'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export default function Player3AssessmentModal(props:P3ExamProps) {
  // Reuse must never carry a passed receipt, answer or ambiguous attempt lock
  // across tenant/enrollment/cycle/edition/stage changes.
  const s=props.context;
  const identity=[s.empresaId,s.matriculaId,s.cicloId,s.editionSha256,s.stageId].join(':');
  return <Player3AssessmentSession key={identity} {...props}/>;
}
