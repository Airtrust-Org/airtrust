#!/usr/bin/env python3
"""Source-pinned Gerenciamento de Resíduos RC4.1 bridge. PRIVATE REVIEW ONLY.

Runs author HTML and unchanged visuals with a correlated parent/server verdict.
It does not establish persisted learning evidence, a certificate, or publication.
"""
from __future__ import annotations
import hashlib
import io
import json
import re
from urllib.parse import urlsplit
from zipfile import ZipFile

SOURCE_ZIP='1d18d4a2c023780a8e6e008552597b235d258d3fc3be7fc8f4557f80cbde2d85'
SOURCE_APP='ac23210d3646a496d17c4d8c15e3426a4d70b9dffc3912e5f1ed687de78e8f22'

class ResiduosUnsupported(ValueError): pass

def _sha(raw): return hashlib.sha256(raw).hexdigest()
def _fail(msg): raise ResiduosUnsupported('PLAYER3_RESIDUOS_'+msg)
def _replace_once(s,old,new,reason='RUNTIME_DRIFT'):
    if s.count(old)!=1: _fail(reason)
    return s.replace(old,new,1)
def _replace_function(s,name,body):
    pattern=r'^function '+re.escape(name)+r'\([^\n]*\)\{[\s\S]*?^\}'
    matches=list(re.finditer(pattern,s,re.M))
    if len(matches)!=1:_fail('FUNCTION_DRIFT_'+name)
    m=matches[0]
    return s[:m.start()]+body+s[m.end():]

def adapt_residuos_app(raw_app:bytes,source_digest:str,parent_origin:str,
                       edition_sha256:str,stages:list[dict])->bytes:
    if source_digest!=SOURCE_ZIP or _sha(raw_app)!=SOURCE_APP: _fail('SOURCE_SHA_MISMATCH')
    u=urlsplit(parent_origin)
    if (u.scheme!='https' or not u.netloc or u.path or u.query or u.fragment or
        u.username or u.password or u.hostname in ('localhost','127.0.0.1','::1')):
        _fail('ORIGIN_INVALID')
    if not re.fullmatch('[a-f0-9]{64}',edition_sha256):_fail('EDITION_INVALID')
    if len(stages)!=1 or stages[0].get('stageId')!='s18':_fail('STAGES_UNAPPROVED')
    questions=stages[0].get('questions')
    if not isinstance(questions,list) or len(questions)!=10:_fail('QUESTIONS_MISMATCH')
    ids=[]
    for q in questions:
        if not isinstance(q,dict) or not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]{0,79}',str(q.get('id',''))):_fail('QUESTION_ID')
        opts=q.get('options')
        if not isinstance(opts,list) or len(opts)!=4 or any(not isinstance(o,dict) or o.get('id')!='o'+str(i) or not isinstance(o.get('text'),str) or not o['text'].strip() for i,o in enumerate(opts)):_fail('OPTION_ID')
        ids.append(q['id'])
    if len(set(ids))!=len(ids):_fail('QUESTION_DUPLICATE')
    s=raw_app.decode('utf-8-sig')
    s=_replace_function(s,'init', '''function init(){
  state={v:4,p:M.version,a:0,c:[],d:{},g:{},q:{},best:0,lastScore:null,attempts:0,assessmentEvaluated:false,failed:false,passed:false};
  mode='journey';displayed=0;renderMenu();render();
}''')
    s=_replace_function(s,'persist', '''function persist(reason="progress"){
  if(mode==='journey')window.AIRTRUST_PLAYER3_RESIDUOS?.hint(M.slides[displayed].id);
  return true;
}''')
    s=_replace_function(s,'emitDiagnostics','function emitDiagnostics(reason="render"){return false;}')
    # Scenario stays visually interactive, but never reveals author correctness.
    s=_replace_once(s,"fb=`<strong>${op.ok?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op.f)}</span>`", "fb='<strong>Decisão registrada.</strong><span>A devolutiva será apresentada pelo AirTrust.</span>'", 'SCENARIO_FEEDBACK')
    s=_replace_once(s,"'selected '+(o.ok?'correct':'incorrect')", "'selected'", 'SCENARIO_STYLE')
    s=_replace_function(s,'chooseScenario', '''function chooseScenario(s,i){
  if(!Number.isSafeInteger(i)||i<0||i>=s.choices.length)return;
  if(isPreview()||mode==='review'){renderDecisionInline(s,i);return;}
  state.d[s.id]=i;dirty=true;renderDecisionInline(s,i);next.disabled=false;
  statusEl.textContent='Decisão registrada — avanço liberado';persist('decision');
}''')
    line=next((line for line in s.splitlines() if line.startswith('function renderDecisionInline(')),None)
    if line is None:_fail('DECISION_RENDER_DRIFT')
    s=_replace_once(s,line,"function renderDecisionInline(s,i){$$('.option').forEach((b,j)=>{b.classList.remove('selected','correct','incorrect');if(j===i)b.classList.add('selected')});const f=$('#feedback');if(f)f.textContent='Decisão registrada. O AirTrust controlará a devolutiva.'}")
    s=_replace_once(s, 'const questionCorrect=showResult&&selected===q.correct;', 'const questionCorrect=false;','GRADE_RENDER_1')
    start='''    if(showResult){
      if(i===q.correct){cls+=(cls?' ':'')+'answer-correct';mark='<em class="answer-mark correct-mark">Resposta correta</em>'}
      if(i===selected&&i!==q.correct){cls+=(cls?' ':'')+'answer-wrong';mark='<em class="answer-mark wrong-mark">Sua resposta</em>'}
    }'''
    s=_replace_once(s,start,'''    if(showResult&&i===selected){mark='<em class="answer-mark">Sua resposta registrada</em>'}''','GRADE_RENDER_2')
    feedback_old='''  else if(showResult&&questionCorrect)feedback=`<span class="result-pass">Questão correta.</span> Sua resposta está destacada em verde.`;
  else if(showResult&&!questionCorrect)feedback=`<span class="result-fail">Questão incorreta.</span> Sua resposta está em vermelho e a alternativa correta aparece em verde.`;'''
    s=_replace_once(s,feedback_old,"  else if(showResult)feedback='Avaliação registrada pelo AirTrust. Nota e aprovação verificadas no servidor.';",'GRADE_FEEDBACK')
    s=_replace_once(s,"const ok=state.q[item.id]===item.correct;return `<button class=\"result-dot ${ok?'ok':'bad'} ${i===assessmentIndex?'current':''}\" data-qjump=\"${i}\" aria-label=\"Questão ${i+1}: ${ok?'correta':'incorreta'}\">${i+1}</button>`",
      "const answered=state.q[item.id]!==undefined;return `<button class=\"result-dot ${answered?'answered':''} ${i===assessmentIndex?'current':''}\" data-qjump=\"${i}\" aria-label=\"Questão ${i+1}: ${answered?'respondida':'não respondida'}\">${i+1}</button>`",'RESULT_MAP')
    s=_replace_once(s,"${showResult?(questionCorrect?'Acertou':'Errou'):(state.q[q.id]===undefined?'Não respondida':'Respondida')}","${state.q[q.id]===undefined?'Não respondida':'Respondida'}",'GRADE_LABEL')
    s=_replace_function(s,'submitAssessment', '''function submitAssessment(){
  if(mode!=='journey'||state.assessmentEvaluated||state.passed)return;
  const qs=M.assessment.questions;
  if(qs.some(q=>state.q[q.id]===undefined))return;
  const selections=qs.map(q=>state.q[q.id]);
  window.AIRTRUST_PLAYER3_RESIDUOS.submit('s18',selections).then(v=>{
    state.attempts+=1;state.lastScore=v.score_pct;
    state.best=Math.max(state.best||0,v.score_pct);
    state.assessmentEvaluated=true;state.passed=v.stage_passed;state.failed=!v.stage_passed;
    if(v.stage_passed){markComplete(M.slides[M.slides.length-1].id);state.a=M.slides.length-1;}
    emitDiagnostics('assessment');render();
  }).catch(()=>{statusEl.textContent='Resultado não confirmado pelo AirTrust. Reabra a sessão para reconciliar a tentativa.';});
}''')
    marker='"use strict";'
    bridge=r'''const __P3_RESIDUOS=(() => {
  const origin=__ORIGIN__,edition=__EDITION__,qid=__IDS__;
  let pending=null;
  function post(data){if(window.parent!==window)window.parent.postMessage(data,origin)}
  window.addEventListener('message',e=>{
    if(e.source!==window.parent||e.origin!==origin||!pending)return;
    const d=e.data;
    if(!d||d.type!=='AIRTRUST_PLAYER3_STAGE_VERDICT_V1'||
      d.editionSha256!==edition||d.requestId!==pending.id||d.stageId!=='s18'||
      d.persisted!==true||typeof d.stage_passed!=='boolean'||
      !Number.isInteger(d.score_pct)||d.score_pct<0||d.score_pct>100)return;
    const p=pending;pending=null;p.resolve(d);
  });
  return {
    hint(unitId){if(typeof unitId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(unitId))
      post({type:'AIRTRUST_PLAYER3_NAV_HINT_V1',editionSha256:edition,unitId})},
    submit(stageId,selections){
      if(pending)return Promise.reject(new Error('PLAYER3_PENDING'));
      if(stageId!=='s18'||!Array.isArray(selections)||selections.length!==qid.length||
        !selections.every(x=>Number.isSafeInteger(x)&&x>=0&&x<4))
        return Promise.reject(new Error('PLAYER3_BAD_SELECTION'));
      if(window.parent===window||!crypto?.randomUUID)
        return Promise.reject(new Error('PLAYER3_PARENT_REQUIRED'));
      const requestId=crypto.randomUUID();
      return new Promise((resolve,reject)=>{
        pending={id:requestId,resolve,reject};
        post({type:'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',requestId,
          editionSha256:edition,stageId,answers:qid.map((questionId,i)=>({questionId,optionId:'o'+selections[i]}))});
        setTimeout(()=>{if(pending?.id===requestId){pending=null;
          reject(new Error('PLAYER3_RECEIPT_TIMEOUT'))}},60000);
      });
    }
  };
})();
window.AIRTRUST_PLAYER3_RESIDUOS=__P3_RESIDUOS;'''
    bridge=bridge.replace('__ORIGIN__',json.dumps(parent_origin)).replace('__EDITION__',json.dumps(edition_sha256)).replace('__IDS__',json.dumps(ids))
    s=_replace_once(s,marker,marker+'\n'+bridge,'STRICT_WRAPPER')
    # Ban answer-dependent client code. Other nonexam microinteraction fields were stripped from model.
    if any(token in s for token in ('q.correct','item.correct','op.ok','op.f', 'LMSSetValue(','AIRTRUST_COMPLETION_DIAGNOSTICS_V1','cmi.core.lesson_status')):
        _fail('CLIENT_GRADE_REMAINING')
    return s.encode('utf8')

def compile_residuos_review(original_zip:bytes,parent_origin:str,edition_sha256:str):
    if _sha(original_zip)!=SOURCE_ZIP:_fail('SOURCE_ZIP_MISMATCH')
    from prepare_player3_learner_review import compile_review, fixed_zip, sha
    with ZipFile(io.BytesIO(original_zip)) as original:
        raw_app=original.read('app.js')
    candidate,meta,projection,private,receipt=compile_review(original_zip,'GERENCIAMENTO_RESIDUOS_COLETA_SELETIVA_SCORM12_RC4_1.zip')
    if meta['stage_count']!=1 or meta['question_count']!=10 or len(projection['stages'])!=1:_fail('PEDAGOGICAL_POLICY_UNVERIFIED')
    with ZipFile(io.BytesIO(candidate)) as z:
        files={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
    app=adapt_residuos_app(raw_app,_sha(original_zip),parent_origin,edition_sha256,projection['stages'])
    files['app.js']=app
    files['scorm.js']=(b'window.AirTrustSCORM=Object.freeze({initialize:()=>false,get:()=>\'\',set:()=>false,commit:()=>false,finish:()=>false,isFinished:()=>false});\n')
    receipt.update({'adapter':'AIRTRUST_PLAYER3_RESIDUOS_REVIEW_V1','status':'REVIEW_ONLY_NOT_PUBLISHABLE',
      'intentionallyModifiedRuntimeFiles':['app.js','scorm.js'],'legacyScormApiDisabled':True,
      'byteIdenticalNonModelFiles':False,'byteIdenticalNonModelNonAdapterOrScormShimFiles':True,
      'adapterHostBridgeImplemented':False,'adapterServerReceiptRequired':True,
      'stageContractApproved':False,'publishable':False})
    files['player3-review-manifest.json']=(json.dumps(receipt,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf8')
    return fixed_zip(files),meta,projection,private,receipt