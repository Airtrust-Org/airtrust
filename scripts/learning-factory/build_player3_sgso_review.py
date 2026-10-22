#!/usr/bin/env python3
"""Strict SHA-pinned SGSO M10.4/M10.7 author HTML5 review adapters.

Source media remains untouched; official answers are removed from learner models.
The frame only makes proposals; authoritative grading and completion stay server-only.
No package generated here can be published before host bridge and staging E2E.
"""
from __future__ import annotations
import hashlib, io, json, re
from urllib.parse import urlsplit
from zipfile import ZipFile

SOURCES={
 '301f3dc1285461896620e6ccd29b6aef2b5a23c980859a73244415dbb8b68837': ('bd434a3a18a13831a3e3bc626729d480cb8c42af4995e1fc4dbe65c093ad0979','M10.4'),
 'f35ae32e01d99bd2fa78bbd1144758fba048c7bb36c8249fd1a731729e338d64': ('64fc0063287650d1db56bb28ac31a71c8b8fcebda628d66b48a7dc8bd0347c0e','M10.7'),
}
class SGSOUnsupported(ValueError):pass

def _fail(c):raise SGSOUnsupported('PLAYER3_SGSO_'+c)
def _sha(d):return hashlib.sha256(d).hexdigest()
def _rep(s,a,b,c):
    if s.count(a)!=1:_fail(c)
    return s.replace(a,b,1)
def _segment(s,a,b,replacement,c):
    if s.count(a)!=1 or s.count(b)!=1:_fail(c)
    i=s.index(a);j=s.index(b,i)
    return s[:i]+replacement+s[j:]

BRIDGE=r'''const __P3_SGSO=(()=>{
  const origin=__ORIGIN__,edition=__EDITION__,stages=__STAGES__;
  let pending=null;
  const valid=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(x);
  function post(data){if(window.parent!==window)window.parent.postMessage(data,origin)}
  window.addEventListener('message',e=>{
    if(e.source!==window.parent||e.origin!==origin||!pending)return;
    const d=e.data;
    if(!d||d.type!=='AIRTRUST_PLAYER3_STAGE_VERDICT_V1'||
      d.editionSha256!==edition||d.requestId!==pending.requestId||
      d.stageId!==pending.stageId||d.persisted!==true||
      typeof d.stage_passed!=='boolean'||!Number.isInteger(d.score_pct)||
      d.score_pct<0||d.score_pct>100)return;
    const p=pending;pending=null;p.resolve(d);
  });
  return {
    hint(unitId){if(valid(unitId))post({type:'AIRTRUST_PLAYER3_NAV_HINT_V1',unitId,editionSha256:edition})},
    contentEnd(unitId){if(valid(unitId))post({type:'AIRTRUST_PLAYER3_CONTENT_END_HINT_V1',unitId,editionSha256:edition})},
    submit(stageId,selections){
      if(pending)return Promise.reject(new Error('PLAYER3_ATTEMPT_PENDING'));
      const list=stages[stageId];
      if(!valid(stageId)||!Array.isArray(list)||!Array.isArray(selections)||
         list.length!==selections.length||!selections.every((x,i)=>
           Number.isSafeInteger(x)&&x>=0&&x<list[i].n))
        return Promise.reject(new Error('PLAYER3_INVALID_SELECTION'));
      if(window.parent===window||!crypto?.randomUUID)
        return Promise.reject(new Error('PLAYER3_PARENT_REQUIRED'));
      const requestId=crypto.randomUUID();
      return new Promise((resolve,reject)=>{
        pending={requestId,stageId,resolve,reject};
        post({type:'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',requestId,
          editionSha256:edition,stageId,
          answers:list.map((q,i)=>({questionId:q.id,optionId:'o'+selections[i]}))});
        setTimeout(()=>{if(pending?.requestId===requestId){pending=null;
          reject(new Error('PLAYER3_RECEIPT_TIMEOUT'))}},60000);
      });
    }
  };
})();
window.AIRTRUST_PLAYER3_SGSO=__P3_SGSO;
'''

SCORM_SHIM=(b"window.AirTrustSCORM=Object.freeze({state:{standalone:true,initialized:true,finished:false},"
 b"init:()=>true,get:()=>'',set:()=>false,commit:()=>false,finish:()=>false});\n")

def adapt_sgso_app(app:bytes,source_sha:str,parent_origin:str,edition_sha:str,public_stages:list[dict]):
    expected=SOURCES.get(source_sha)
    if not expected or _sha(app)!=expected[0]:_fail('SOURCE_NOT_PINNED')
    u=urlsplit(parent_origin)
    if (u.scheme!='https' or not u.netloc or u.path or u.query or u.fragment or
        u.username or u.password or u.hostname in ('localhost','127.0.0.1','::1')):_fail('PARENT_ORIGIN_INVALID')
    if not re.fullmatch('[a-f0-9]{64}',edition_sha):_fail('EDITION_INVALID')
    stages={}
    if len(public_stages)!=5:_fail('STAGE_COUNT_MISMATCH')
    for stage in public_stages:
        sid=stage.get('stageId')
        qs=stage.get('questions')
        if (not isinstance(sid,str) or not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]{0,79}',sid)
            or sid in stages or not isinstance(qs,list) or len(qs)!=4):_fail('STAGE_INVALID')
        out=[];seen=set()
        for q in qs:
            if not isinstance(q,dict):_fail('QUESTION_INVALID')
            qid=q.get('id');opts=q.get('options')
            if (not isinstance(qid,str) or not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]{0,79}',qid)
                or qid in seen or not isinstance(opts,list) or not 2<=len(opts)<=10
                or any(not isinstance(o,dict) or o.get('id')!='o'+str(i)
                       or not isinstance(o.get('text'),str) or not o['text'].strip()
                       for i,o in enumerate(opts))):_fail('QUESTION_OPTIONS_INVALID')
            seen.add(qid);out.append({'id':qid,'n':len(opts)})
        stages[sid]=out
    s=app.decode('utf-8-sig');variant=expected[1]
    # Player 3 does not have legacy SCORM enrollment scope. The isolated
    # authenticated parent must gate content delivery; standalone cannot grade.
    if variant=='M10.7':
        s=_segment(s,'function detectPreview(){','function currentScroller(',
                   'function detectPreview(){return false}', 'PREVIEW_ADMISSION_DRIFT')
    # Ban the old local grade path. The only local pass flag follows the parent verdict.
    if variant=='M10.4':
        grade='var correct=0,missed=[];st.answers.forEach(function(a,i){if(a===s.questions[i].correct)correct++;else missed.push(i)});st.score=Math.round(correct/n*100);st.passed=st.score>=pass;st.missed=missed;st.pos=0;st.answers=[];qstate[s.id]=st;score=calcScore();persist(\'suspend\');render(true)'
    else:
        grade='var correct=0,missed=[];st.answers.forEach(function(a,i){if(a===s.questions[i].correct)correct++;else missed.push(i)});st.score=Math.round(correct/s.questions.length*100);st.passed=st.score>=pass;st.missed=missed;qstate[s.id]=st;score=calcScore();persist(\'suspend\');render(true)'
    server=('window.AIRTRUST_PLAYER3_SGSO.submit(s.id,st.answers.slice()).then(function(v){'
       'st.score=v.score_pct;st.passed=v.stage_passed;st.missed=[];st.pos=0;st.answers=[];'
       'qstate[s.id]=st;score=calcScore();persist(\'suspend\');render(true)})'
       '.catch(function(){toast(\'Tentativa sem confirmação do AirTrust. Reabra a sessão antes de reenviar.\')})')
    s=_rep(s,grade,server,'LOCAL_EXAM_GRADER_DRIFT')
    # Restore/legacy fallback cannot retain stale local correctness either.
    s=_segment(s,'function scenarioRestored(i,choice){','function applyState(',
        "function scenarioRestored(i,choice){return {choice:choice,feedback:'Decisão registrada.'}}",'SCENARIO_RESTORE_DRIFT')
    s=_rep(s,"po.feedback||(pd?'Correto.':'Revise o critério e tente novamente.')","'Decisão registrada.'",'LEGACY_PRACTICE_DRIFT')
    s=_rep(s,"(done&&x.correct?' correct':'')","(done?' selected':'')",'PRACTICE_RENDER_DRIFT')
    # Scenario decisions remain interactive but lose correctness/explanations.
    if variant=='M10.4':
        s=_rep(s,"(i===s.scenarioCorrect?' correct':' wrong')", "' selected'",'SCENARIO_STYLE_DRIFT')
        s=_rep(s,"scstate[s.id]={choice:i,feedback:o.feedback||(i===s.scenarioCorrect?(s.best||'Conduta tecnicamente adequada.'):(s.feedback||'Revise a sequência técnica antes de prosseguir.'))}",
               "scstate[s.id]={choice:i,feedback:'Decisão registrada. O AirTrust controlará a devolutiva.'}",'SCENARIO_FEEDBACK_DRIFT')
        s=_rep(s,"var cls=done?(i===q.correct?' correct':(i===selected?' wrong':'')):''", "var cls=done&&i===selected?' selected':''", 'EXAM_COLOR_DRIFT')
        s=_rep(s,"selected===q.correct?(q.feedback||'Correto. Prossiga mantendo o critério técnico.'):(q.feedback||'Incorreto. Reveja o ponto correspondente no módulo.')",
               "'Resposta registrada. A nota é verificada pelo AirTrust.'",'EXAM_FEEDBACK_DRIFT')
    else:
        s=_rep(s,"(i===s.scenarioCorrect?'correct':'wrong')", "'selected'",'SCENARIO_STYLE_DRIFT')
        s=_rep(s,"st.choice===s.scenarioCorrect?'Resposta adequada':'Revise a decisão'", "true?'Decisão registrada':'Decisão registrada'", 'SCENARIO_FEEDBACK_DRIFT')
        s=_rep(s,"esc(st.feedback||o.feedback||'')", "esc('O AirTrust controlará a devolutiva.')", 'SCENARIO_DETAILS_DRIFT')
        # Scenario feedback is not a certification gate.
        old="var i=Number(b.dataset.scenario),o=s.scenarioOptions[i]||{},fb=o.feedback||(i===s.scenarioCorrect?(s.best||'Conduta tecnicamente adequada.'):(s.feedback||'Revise a sequência técnica antes de prosseguir.'));scstate[s.id]={choice:i,feedback:fb}"
        s=_rep(s,old,"var i=Number(b.dataset.scenario),fb='Decisão registrada.';scstate[s.id]={choice:i,feedback:fb}",'SCENARIO_BIND_DRIFT')
        # Reveal local choice, never the model's correct answer.
        s=s.replace("xi===i&&i===s.scenarioCorrect",'xi===i')
        s=_rep(s,"x.classList.toggle('correct',xi===i);x.classList.toggle('wrong',xi===i&&i!==s.scenarioCorrect)","x.classList.toggle('correct',false);x.classList.toggle('wrong',false)",'SCENARIO_CLASS_DRIFT')
        s=_rep(s,"i===s.scenarioCorrect?'Resposta adequada':'Revise a decisão'","'Decisão registrada'",'SCENARIO_MESSAGE_DRIFT')
    # Practice decisions are formative navigation only; do not invent an official pass.
    if variant=='M10.4':
        s=_rep(s,"var o=(s.practiceOptions||[])[i]||{},ok=!!o.correct;segstate[s.id]={choice:i,done:ok,feedback:o.feedback||(ok?'Correto.':'Revise o critério e tente novamente.')}",
           "var ok=true;segstate[s.id]={choice:i,done:true,feedback:'Decisão registrada. Devolutiva controlada pelo AirTrust.'}",'PRACTICE_DRIFT')
    s=_segment(s,'function persist(exitMode){','function toast(',
        "function persist(exitMode){if(!previewMode)window.AIRTRUST_PLAYER3_SGSO?.hint(M.slides[current].id);return true}\n",'PERSIST_DRIFT')
    s=_segment(s,'function emitDiag(){','function persist(',"function emitDiag(){return false}\n",'DIAG_DRIFT')
    s=_segment(s,'function restore(){','function progress(',"function restore(){current=0;visited=new Set();qstate={};scstate={};ckstate={};seqstate={};segstate={};complete=false;score=0}\n",'RESTORE_DRIFT')
    s=_segment(s,'async function completeCourse(){','async function safeExit(){',
       "async function completeCourse(){window.AIRTRUST_PLAYER3_SGSO?.contentEnd(M.slides[current].id);return false}\n", 'TERMINAL_DRIFT')
    s=_segment(s,'async function safeExit(){','function terminateSession(){',
       "async function safeExit(){persist('suspend');return true}\n",'EXIT_DRIFT')
    s=_segment(s,'function terminateSession(){','previewMode=detectPreview();',
       "function terminateSession(){return true}\n",'TERMINATE_DRIFT')
    bridge=(BRIDGE.replace('__ORIGIN__',json.dumps(parent_origin)).replace('__EDITION__',json.dumps(edition_sha)).replace('__STAGES__',json.dumps(stages,sort_keys=True)))
    s=_rep(s,"(function(){'use strict';","(function(){'use strict';\n"+bridge,'FRAME_WRAPPER_DRIFT')
    forbidden=['s.questions[i].correct','q.correct','q.feedback','o.correct','o.feedback','s.scenarioCorrect',
               "S.set(","S.finish(","S.commit(","window.__AIRTRUST_COMPLETION_DIAGNOSTICS__",
               "AIRTRUST_COMPLETION_DIAGNOSTICS_V1"]
    if any(t in s for t in forbidden):_fail('UNMAPPED_CLIENT_AUTHORITY')
    return s.encode('utf8')

def compile_sgso_review(raw:bytes,parent_origin:str,edition_sha:str):
    source=_sha(raw)
    if source not in SOURCES:_fail('SOURCE_ZIP_NOT_PINNED')
    from prepare_player3_learner_review import compile_review,fixed_zip
    with ZipFile(io.BytesIO(raw)) as original:js=original.read('app.js')
    prepared,meta,projection,bank,receipt=compile_review(raw,'SGSO_'+SOURCES[source][1]+'.zip')
    if meta['stage_count']!=5 or meta['question_count']!=20:_fail('AUTHORING_STAGE_MISMATCH')
    with ZipFile(io.BytesIO(prepared)) as z:
        files={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
    files['app.js']=adapt_sgso_app(js,source,parent_origin,edition_sha,projection['stages'])
    files['airtrust-scorm.js']=SCORM_SHIM
    receipt.update({'adapter':'AIRTRUST_PLAYER3_SGSO_REVIEW_V1',
       'status':'REVIEW_ONLY_NOT_PUBLISHABLE','intentionallyModifiedRuntimeFiles':['app.js','airtrust-scorm.js'],
       'byteIdenticalNonModelFiles':False,'legacyScormApiDisabled':True,
       'adapterHostBridgeImplemented':False,'adapterServerReceiptRequired':True,
       'stageContractApproved':False,'publishable':False})
    files['player3-review-manifest.json']=(json.dumps(receipt,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf8')
    return fixed_zip(files),meta,projection,bank,receipt