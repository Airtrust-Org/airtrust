import React from 'react';
import {describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import Player3AssessmentModal, {
  type P3ExamContext,type P3ExamReceipt,
} from '@/react-app/pages/lms/player3/Player3AssessmentModal';

const context:P3ExamContext={
  empresaId:6,matriculaId:911,cicloId:800,editionSha256:'a'.repeat(64),
  stageId:'modulo-1-prova',title:'Doutrinamento — Módulo 1',
  questions:[
    {id:'q1',prompt:'Qual é a ação correta?',options:[
      {id:'a',text:'Proceder com segurança'},
      {id:'b',text:'Ignorar o procedimento'},
    ]},
    {id:'q2',prompt:'Quando reportar?',options:[
      {id:'a',text:'Imediatamente'},
      {id:'b',text:'Nunca'},
    ]},
  ],
};
const receipt:P3ExamReceipt={
  empresa_id:6,matricula_id:911,ciclo_id:800,edition_sha256:'a'.repeat(64),
  stage_id:'modulo-1-prova',attempt_number:1,
  stage_passed:true,score_pct:100,persisted:true,
};
function selectAnswers(){
  fireEvent.click(screen.getByRole('radio',{name:'Proceder com segurança'}));
  fireEvent.click(screen.getByRole('radio',{name:'Imediatamente'}));
}
function mount(submit=vi.fn(async()=>receipt)){
  const onVerifiedStagePassed=vi.fn(),onDismiss=vi.fn();
  render(<Player3AssessmentModal context={context}
    submitOfficialAttempt={submit}
    onVerifiedStagePassed={onVerifiedStagePassed} onDismiss={onDismiss}/>);
  return {submit,onVerifiedStagePassed,onDismiss};
}

describe('Player 3 — módulo avaliado na janela nativa sem refazer HTML5',()=>{
  it('shows official questions as a separate dialog and never computes grade locally',()=>{
    const {submit}=mount();
    expect(screen.getByRole('dialog',{name:/Avaliação AirTrust/})).toBeInTheDocument();
    expect(screen.getByText(/Esta janela não emite certificados/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'})).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByText(/Treinamento concluído|Certificado emitido/)).not.toBeInTheDocument();
  });
  it('submits only learner option IDs and unlocks the next stage after pinned durable receipt',async()=>{
    const {submit,onVerifiedStagePassed}=mount();
    selectAnswers();
    fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
    await waitFor(()=>expect(submit).toHaveBeenCalledExactlyOnceWith([
      {questionId:'q1',optionId:'a'},{questionId:'q2',optionId:'a'},
    ]));
    const next=await screen.findByRole('button',{name:'Prosseguir para o próximo módulo'});
    expect(screen.getByRole('status')).toHaveTextContent(/aprovada pelo AirTrust/);
    expect(onVerifiedStagePassed).not.toHaveBeenCalled();
    fireEvent.click(next);
    expect(onVerifiedStagePassed).toHaveBeenCalledExactlyOnceWith(receipt);
    expect(screen.queryByRole('button',{name:'Enviar avaliação ao AirTrust'})).not.toBeInTheDocument();
  });
  it('reports a failed examination without unlocking or awarding completion',async()=>{
    const submit=vi.fn(async()=>({...receipt,stage_passed:false,score_pct:30}));
    const {onVerifiedStagePassed}=mount(submit);
    selectAnswers();
    fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
    await screen.findByRole('status');
    expect(screen.getByRole('status')).toHaveTextContent(/Revise o conteúdo/);
    expect(screen.queryByRole('button',{name:'Prosseguir para o próximo módulo'})).toBeNull();
    expect(onVerifiedStagePassed).not.toHaveBeenCalled();
  });
  it('rejects forged completion claims, wrong tenant/cycle, edition and unpersisted result',async()=>{
    for(const forged of [
      {...receipt,empresa_id:9},
      {...receipt,ciclo_id:801},
      {...receipt,edition_sha256:'b'.repeat(64)},
      {...receipt,stage_id:'other'},
      {...receipt,persisted:false},
    ]){
      const submit=vi.fn(async()=>forged as P3ExamReceipt);
      const {unmount}=render(<Player3AssessmentModal context={context}
        submitOfficialAttempt={submit}
        onVerifiedStagePassed={vi.fn()} onDismiss={vi.fn()}/>);
      selectAnswers();
      fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
      expect(await screen.findByRole('status')).toHaveTextContent(/Resposta não confirmada/);
      expect(screen.queryByRole('button',{name:'Prosseguir para o próximo módulo'})).toBeNull();
      expect(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'})).toBeDisabled();
      unmount();
    }
  });
  it('locks retries on ambiguous network failure to avoid duplicate certifying attempts',async()=>{
    const submit=vi.fn(async():Promise<P3ExamReceipt>=>{throw Error('timeout');});
    mount(submit);
    selectAnswers();
    fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
    expect(await screen.findByRole('status')).toHaveTextContent(/Reabra a sessão/);
    fireEvent.click(screen.getByRole('button',{name:'Enviar avaliação ao AirTrust'}));
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('fails closed on invalid stage and unreviewed question IDs',()=>{
    const {rerender}=render(<Player3AssessmentModal
      context={{...context,editionSha256:'not-a-hash'}}
      submitOfficialAttempt={vi.fn()} onVerifiedStagePassed={vi.fn()}
      onDismiss={vi.fn()}/>);
    expect(screen.getByRole('alert')).toHaveTextContent(/contrato inválido/);
    rerender(<Player3AssessmentModal context={{
      ...context,questions:[context.questions[0],context.questions[0]],
    }} submitOfficialAttempt={vi.fn()}
      onVerifiedStagePassed={vi.fn()} onDismiss={vi.fn()}/>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
