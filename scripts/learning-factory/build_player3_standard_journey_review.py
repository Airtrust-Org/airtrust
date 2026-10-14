#!/usr/bin/env python3
"""SHA-pinned NR/PPSP/Cultura/FOD HTML5 review adapters. NEVER deploy.

The authored HTML/CSS/media and interaction structure remain unchanged.
Only a server-controlled module verdict can unlock a local assessment; no local
SCORM score/completion or browser-issued certification is possible.
This factory is NOT a parent auth bridge, approved policy or production build.
"""
from __future__ import annotations
import hashlib
import io
import json
import re
from urllib.parse import urlsplit
from zipfile import ZipFile

from build_player3_rc81_bridge_review import _replace_line, _host_origin, RC81Unsupported

# Exact original ZIP/app pair; reject drift instead of heuristically patching JS.
# SHA values originate in the verified 22-edition source inventory.
SOURCES = {
    '17dc02353c30db05ca92d187191f59ee2e98993183a169bf67c213ef1fcec4a3': '169b7e9f5d1d84f828fc67a5807263cbae63a3039c08ab75344950cea8fe582b',
    '402f1c40b4e79b344cd2c1a60b81b932828f0bf7da6b5e04d0228d20ad5d0560': '608d5304566698ad5250e29e54a4b93300406b0fabb07b3d5adda7c83e16159a',
    '9ecf7a13cff4cc70c77869072a25a02527f1816b66cdd20cb88550a1ad18c793': '527612ee676d63e8aba1d23902d025528c110037de1e4b6bddf000a84b1c3070',
    '8145d6c28f3f1b1e1029e38ce3feb69f1dde2833f9f3ec7be98321bd782181bf': '4b7104b9a06f52df8003fda335448c67c80dbd9a412ea01ab4995d168e1c28c6',
    '33ce7f1a473b2c6280bf3ba3a5413ebd6b56e47ac61140838b9840ec0fa55909': '96bb814bc0edd332ca2e6739804d7b1345a4edd5946f1b94173e3e24ba1b3ca9',
    '67e1e768c65dc5ad140da4b0ec5bb61739c80f8f5131a367be22f8e2760f5481': '96bb814bc0edd332ca2e6739804d7b1345a4edd5946f1b94173e3e24ba1b3ca9',
    '9d0e96a77fd0585875a632c0bc4fd0437ad9d3da2e0da1c4232e791672b3fb5e': 'b25b154327ecf0c9584b386ac3642dcd88ee52de2bfa300c0216205b5ea88dc0',
    '28721abb6f6ae45d69e60adde1db05a67eac22538ea3eba75a5654b0710f807c': 'f00e472f4bf531c84a2b929dedf2597e4a8b61fab13e377a874a32fbef716225',
}

class JourneyUnsupported(RC81Unsupported):
    pass

# Two-message review protocol; same types as RC8.1, but separate family runtime.
# The parent is required to authenticate and persist the POST itself, then re-read
# the official attempt before emitting the correlated verdict. The child can never
# prove completion to the parent, even if a learner edits this JS in DevTools.
BRIDGE = r'''const __P3_JOURNEY=(() => {
  const origin=__ORIGIN__, edition=__EDITION__, stages=__STAGES__;
  let pending=null;
  const valid=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(x);
  function hint(unitId){if(valid(unitId)&&window.parent!==window)
    window.parent.postMessage({type:'AIRTRUST_PLAYER3_NAV_HINT_V1',unitId,editionSha256:edition},origin)}
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
    hint,
    contentEnd(unitId){if(valid(unitId)&&window.parent!==window)
      window.parent.postMessage({type:'AIRTRUST_PLAYER3_CONTENT_END_HINT_V1',unitId,editionSha256:edition},origin)},
    submit(stageId,choices){
      if(pending)return Promise.reject(new Error('PLAYER3_PENDING_ATTEMPT'));
      const stage=stages[stageId];
      if(!valid(stageId)||!Array.isArray(stage)||!Array.isArray(choices)||
         stage.length!==choices.length||!choices.every((x,i)=>
           Number.isSafeInteger(x)&&x>=0&&x<stage[i].n))
        return Promise.reject(new Error('PLAYER3_INVALID_SELECTION'));
      if(window.parent===window||!crypto?.randomUUID)
        return Promise.reject(new Error('PLAYER3_PARENT_REQUIRED'));
      const requestId=crypto.randomUUID();
      return new Promise((resolve,reject)=>{
        pending={requestId,stageId,resolve,reject};
        window.parent.postMessage({type:'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',
          requestId,editionSha256:edition,stageId,
          answers:stage.map((q,i)=>({questionId:q.id,optionId:'o'+choices[i]}))},origin);
        setTimeout(()=>{if(pending?.requestId===requestId){pending=null;
          reject(new Error('PLAYER3_VERDICT_TIMEOUT'))}},60000);
      });
    }
  };
})();
window.AIRTRUST_PLAYER3_JOURNEY=__P3_JOURNEY;
'''

def adapt_standard_app(original_app: bytes, original_zip_sha256: str,
                       parent_origin: str, edition_sha256: str,
                       public_stages: list[dict]) -> bytes:
    if (original_zip_sha256 not in SOURCES or
        hashlib.sha256(original_app).hexdigest()!=SOURCES[original_zip_sha256]):
        raise JourneyUnsupported('JOURNEY_PINNED_SOURCE_REQUIRED')
    if not re.fullmatch('[a-f0-9]{64}', edition_sha256):
        raise JourneyUnsupported('JOURNEY_EDITION_SHA_REQUIRED')
    origin=_host_origin(parent_origin)
    stages={}
    for stage in public_stages:
        sid=stage.get('stageId')
        qs=stage.get('questions')
        if (not isinstance(sid,str) or not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]{0,79}',sid)
            or sid in stages or not isinstance(qs,list) or not qs or len(qs)>100):
            raise JourneyUnsupported('JOURNEY_INVALID_PUBLIC_STAGE')
        parsed=[]
        seen_questions=set()
        for q in qs:
            if not isinstance(q,dict):
                raise JourneyUnsupported('JOURNEY_INVALID_PUBLIC_QUESTION')
            opts=q.get('options')
            qid=q.get('id')
            if (not isinstance(qid,str) or
                not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]{0,79}',qid) or
                qid in seen_questions or not isinstance(opts,list) or
                not 2<=len(opts)<=10 or
                any(not isinstance(o,dict) or
                    o.get('id')!='o'+str(i) or
                    not isinstance(o.get('text'),str) or not o['text'].strip()
                    for i,o in enumerate(opts))):
                raise JourneyUnsupported('JOURNEY_INVALID_OPTIONS')
            seen_questions.add(qid)
            parsed.append({'id':qid,'n':len(opts)})
        stages[sid]=parsed
    if len(stages)!=1 or sum(len(qs) for qs in stages.values())!=10:
        raise JourneyUnsupported('JOURNEY_STAGE_COUNT_NOT_VERIFIED')
    source=original_app.decode('utf-8-sig')
    lines=source.splitlines()
    def take(name):
        matches=[v for v in lines if v.startswith('function '+name+'(')]
        if len(matches)!=1:raise JourneyUnsupported('JOURNEY_FUNCTION_MISSING_'+name)
        return matches[0]
    render=take('renderAssessment')
    substitutions=[
       ('correct=assessment.answers.reduce((n,a,i)=>n+(a!==null&&a===s.questions[i].answer?1:0),0)',"correct='—'"),
       ("if(i===item.answer)cls+=' review-correct';if(i===chosen&&chosen!==item.answer)cls+=' review-incorrect'", "if(i===chosen)cls+=' selected'"),
       ('feedback=chosen===item.answer?`<span class="result-pass">Questão correta.</span> ${esc(item.explain)}`:`<span class="result-fail">Questão incorreta.</span> ${esc(item.explain)}`',
       "feedback=assessment.passed?'<span class=\"result-pass\">Avaliação aprovada e registrada pelo AirTrust.</span>':'<span class=\"result-fail\">Avaliação registrada. Revise o conteúdo.</span>'"),
       ('const hit=assessment.answers[i]===qq.answer','const hit=assessment.answers[i]!==null'),
       ("${hit?'correta':'incorreta'}","${hit?'respondida':'não respondida'}"),
       ("${hit?'✓':'×'}","${hit?'•':'–'}"),
       ("${assessment.evaluated?(chosen===item.answer?'Correta':'Incorreta'):(chosen===null?'Não respondida':'Respondida')}",
        "${assessment.evaluated?'Registrada pelo AirTrust':(chosen===null?'Não respondida':'Respondida')}"),
       ("${assessment.evaluated?correct:'—'}", "${correct}"),
    ]
    for old,new in substitutions:
        if render.count(old)!=1:raise JourneyUnsupported('JOURNEY_RENDER_DRIFT')
        render=render.replace(old,new)
    _replace_line(lines,'renderAssessment',render)
    sc=take('renderScenario')
    for old,new in [
        ("fb=`<strong>${op[1]?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op[2])}</span>`",
         "fb='<strong>Decisão registrada.</strong><span>O AirTrust controlará a devolutiva.</span>'"),
        ("(o[1]?'selected correct':'selected incorrect')", "'selected'"),
    ]:
        if sc.count(old)!=1:raise JourneyUnsupported('JOURNEY_SCENARIO_DRIFT')
        sc=sc.replace(old,new)
    _replace_line(lines,'renderScenario',sc)
    bind=take('bindScreen')
    for old,new in [
        ("fb.innerHTML=`<strong>${op[1]?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op[2])}</span>`",
         "fb.innerHTML='<strong>Decisão registrada.</strong><span>O AirTrust controlará a devolutiva.</span>'"),
        ("b.classList.add('selected',op[1]?'correct':'incorrect')","b.classList.add('selected')"),
    ]:
        if bind.count(old)!=1:raise JourneyUnsupported('JOURNEY_SCENARIO_BIND_DRIFT')
        bind=bind.replace(old,new)
    _replace_line(lines,'bindScreen',bind)
    _replace_line(lines,'safeGet',"function safeGet(){return ''}")
    _replace_line(lines,'safeSet','function safeSet(){return false}')
    _replace_line(lines,'commit','function commit(){return false}')
    _replace_line(lines,'restore',"function restore(){active=0;view=0;mode='journey';courseCompleted=false;assessment={answers:Array(10).fill(null),evaluated:false,score:0,passed:false,q:0}}")
    _replace_line(lines,'persist',"function persist(){if(mode==='preview')return true;window.AIRTRUST_PLAYER3_JOURNEY?.hint(slide().id);return true}")
    _replace_line(lines,'emitDiag','function emitDiag(){}')
    _replace_line(lines,'completeCourse',"function completeCourse(){window.AIRTRUST_PLAYER3_JOURNEY?.contentEnd(slide().id);render(false);return false}")
    _replace_line(lines,'finishSession','function finishSession(){return true}')
    scroll = "saveScroll();" if any(line.startswith("function saveScroll(") for line in lines) else ""
    _replace_line(lines,'evaluate',
      "function evaluate(){"+scroll+"const s=slide();if(s.kind!=='assessment'||mode!=='journey')return;"
      "if(assessment.evaluated||!assessment.answers.every(x=>x!==null))return;"
      "window.AIRTRUST_PLAYER3_JOURNEY.submit(s.id,assessment.answers).then(v=>{"
      "assessment.evaluated=true;assessment.passed=v.stage_passed;assessment.score=v.score_pct;render(false)"
      "}).catch(()=>{const el=document.querySelector('#gateStatus');if(el)"
      "el.textContent='Sem confirmação do AirTrust. Reabra a sessão antes de reenviar.'})}")
    init=take('init')
    marker=';window.__AIRTRUST_PLAYER_TEST__='
    if init.count(marker)!=1:raise JourneyUnsupported('JOURNEY_DEBUG_INTERFACE_DRIFT')
    init=init.split(marker,1)[0]+'}'
    _replace_line(lines,'init',init)
    if source.count("const qa=new URLSearchParams(location.search).get('qa')==='1';")!=1:
        raise JourneyUnsupported('JOURNEY_QA_MODE_DRIFT')
    lines=[v.replace("const qa=new URLSearchParams(location.search).get('qa')==='1';","const qa=false;")
           for v in lines]
    bridge=(BRIDGE.replace('__ORIGIN__',json.dumps(origin))
                  .replace('__EDITION__',json.dumps(edition_sha256))
                  .replace('__STAGES__',json.dumps(stages,sort_keys=True)))
    lines.insert(1,bridge)
    result='\n'.join(lines)+'\n'
    forbidden=['item.answer','qq.answer','s.questions[i].answer','op[1]','op[2]',
               'window.__AIRTRUST_PLAYER_TEST__','Scorm?.finish?.()',
               'AIRTRUST_COMPLETION_DIAGNOSTICS_V1','cmi.core.lesson_status',
               'window.Scorm?.set(', 'window.Scorm?.commit(', 'window.Scorm?.finish(']
    if any(s in result for s in forbidden):
        raise JourneyUnsupported('JOURNEY_LOCAL_GRADER_OR_LEGACY_RUNTIME_REMAINING')
    return result.encode('utf8')


def compile_standard_review(original_zip: bytes, source_basename: str,
                            parent_origin: str, edition_sha256: str):
    digest=hashlib.sha256(original_zip).hexdigest()
    if digest not in SOURCES:raise JourneyUnsupported('JOURNEY_ZIP_NOT_PINNED')
    from prepare_player3_learner_review import compile_review, fixed_zip, sha
    with ZipFile(io.BytesIO(original_zip)) as src:
        raw_app=src.read('app.js')
    prepared,meta,projection,private,receipt=compile_review(original_zip,source_basename)
    with ZipFile(io.BytesIO(prepared)) as z:
        files={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
    files['app.js']=adapt_standard_app(raw_app,digest,parent_origin,edition_sha256,
                                      projection['stages'])
    files['scorm_api.js']=(
        b"window.Scorm=Object.freeze({init:()=>'false',get:()=>'',"
        b"set:()=>'false',commit:()=>'false',finish:()=>'false',"
        b"isInitialized:()=>false,isFinished:()=>false});\n")
    receipt.update({'status':'REVIEW_ONLY_NOT_PUBLISHABLE',
         'adapter':'AIRTRUST_PLAYER3_STANDARD_JOURNEY_REVIEW_V1',
         'adapterHostBridgeImplemented':False,'adapterServerReceiptRequired':True,
         'adapterBrowserQaRequired':True,'intentionallyModifiedRuntimeFiles':['app.js','scorm_api.js'],
         'byteIdenticalNonModelFiles':False,'stageContractApproved':False,'publishable':False})
    files['player3-review-manifest.json']=(json.dumps(receipt,sort_keys=True,indent=2,
                                                ensure_ascii=False)+'\n').encode('utf8')
    return fixed_zip(files),meta,projection,private,receipt