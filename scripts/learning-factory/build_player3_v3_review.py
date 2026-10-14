#!/usr/bin/env python3
"""Hash-pinned AirTrust V3.3 authored HTML5 runtime adapter, REVIEW ONLY.

Never serves answer keys, claims author certification, writes D1/R2 or restores
legacy progress. The isolated AirTrust parent and approved pedagogical policy
are absent, so generated ZIPs must never be published to learners.
"""
from __future__ import annotations
import hashlib
import io
import json
import re
from zipfile import ZipFile

from build_player3_standard_journey_review import BRIDGE, JourneyUnsupported
from build_player3_rc81_bridge_review import _host_origin, _replace_line

# Source ZIP and app.js SHA-256 pairs verified against the real 22-source inventory.
SOURCES = {
    'cd4b4cdbe51b750fa5f27ef74d602a197f44700cc040365993695aef8cfb689f': 'ee2fa798451a49bd298abc9431a16df8968342bc68cd6b97c36e1d2ac8fbd188',
    '01fe31d01690d3a25f350a6a831dd0fd27e3a8265ba81e7d4c8581858e0a3902': 'b45bd6f1fa0159ee2ce19fbf86151245e8092f30a36b960b493a101d748f2097',
    '96b63fcdc76a9dc8fe258dbfedbd6ee2bfea623e99b8312dfbcb0b0ddb15335b': '290b20e73b4be69ff2851b0426d66aea9b362e0eddc1f7431f7f164972d88087',
    'f6f5979a6e457ee05c6c6eff8d7941865957486ee74eb2a7615b731378fde1c4': 'ee417f4a9be898e282066bd1c94cb5e2d3ed8855daf9f1c80dec144a7e79f35f',
    'fbf9a3958963eb45ec22f0f529dc10bc832f546197c5b832b07bd1f200b5a5bf': 'f36aa10579c7d54cdf40b01bca22452abcd84a55d52ac3efd180d5ad8954c022',
    '002e6aa88a329fe37a44ca3ca93e7846453051b3cbb217261030576606f8a81e': 'ee2fa798451a49bd298abc9431a16df8968342bc68cd6b97c36e1d2ac8fbd188',
    '46b2d9eb2af870bd7bdd2ee156efc042aba659b74edfda95c29558f85d8117c8': 'ee2fa798451a49bd298abc9431a16df8968342bc68cd6b97c36e1d2ac8fbd188',
}

# The CRM course explicitly declares formative assessment. Never silently
# authorize it as module-certified based only on navigationGate in source.
FORMATIVE_ZIPS = frozenset({'fbf9a3958963eb45ec22f0f529dc10bc832f546197c5b832b07bd1f200b5a5bf'})
ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')


def _replace_function(lines: list[str], name: str, replacement: str) -> None:
    try:
        _replace_line(lines, name, replacement)
    except Exception as error:
        raise JourneyUnsupported('V33_MISSING_FUNCTION_'+name) from error


def adapt_v33_app(original: bytes, source_sha256: str,
                  parent_origin: str, edition_sha256: str,
                  learner_stages: list[dict]) -> bytes:
    if source_sha256 not in SOURCES or hashlib.sha256(original).hexdigest()!=SOURCES[source_sha256]:
        raise JourneyUnsupported('V33_UNPINNED_SOURCE')
    if not re.fullmatch(r'[a-f0-9]{64}',edition_sha256):
        raise JourneyUnsupported('V33_UNPINNED_EDITION')
    try: origin=_host_origin(parent_origin)
    except ValueError as error: raise JourneyUnsupported('V33_PARENT_ORIGIN_INVALID') from error
    stages={}
    seen_questions=set()
    for stage in learner_stages:
        if not isinstance(stage,dict) or not ID.fullmatch(stage.get('stageId','')):
            raise JourneyUnsupported('V33_BAD_STAGE_ID')
        sid=stage['stageId'];qs=stage.get('questions')
        if sid in stages or not isinstance(qs,list) or len(qs)!=10:
            raise JourneyUnsupported('V33_BAD_STAGE_QUESTIONS')
        public=[]
        for q in qs:
            if not isinstance(q,dict) or not isinstance(q.get('id'),str) or not ID.fullmatch(q['id']) or q['id'] in seen_questions:
                raise JourneyUnsupported('V33_BAD_PUBLIC_QID')
            seen_questions.add(q['id'])
            opts=q.get('options')
            if not isinstance(opts,list) or len(opts)<2 or len(opts)>10 or any(
              not isinstance(o,dict) or o.get('id')!='o'+str(i) or
              not isinstance(o.get('text'),str) or not o['text'].strip()
              for i,o in enumerate(opts)
            ):
                raise JourneyUnsupported('V33_BAD_PUBLIC_OPTIONS')
            public.append({'id':q['id'],'n':len(opts)})
        stages[sid]=public
    if not 1<=len(stages)<=8:
        raise JourneyUnsupported('V33_STAGE_COUNT_UNVERIFIED')
    original_text=original.decode('utf-8-sig')
    lines=original_text.splitlines()
    def take(name):
        matches=[x for x in lines if x.startswith('function '+name+'(')]
        if len(matches)!=1:raise JourneyUnsupported('V33_FUNCTION_DRIFT_'+name)
        return matches[0]

    render=take('renderAssessment')
    score=re.compile(r'correct=a\.legacy\?null:a\.a\.reduce\(\(n,x,i\)=>n\+\(x!==null&&x===s\.questions\[i\]\.answer\?1:0\),0\)')
    if len(score.findall(render))!=1:raise JourneyUnsupported('V33_RENDER_SCORE_DRIFT')
    render=score.sub('correct=null',render)
    correct_css="if(a.e&&i===item.answer)cls+=' correct';if(a.e&&a.a[q]===i&&i!==item.answer)cls+=' incorrect'"
    if render.count(correct_css)!=1:raise JourneyUnsupported('V33_RENDER_OPTIONS_DRIFT')
    render=render.replace(correct_css, "if(a.e)cls+=' recorded'")
    start=render.find(';if(a.legacy){fb=')
    end=render.find('const qmap=',start)
    if start<0 or end<0 or render.count('const qmap=')!=1:
        raise JourneyUnsupported('V33_RENDER_FEEDBACK_DRIFT')
    render=(render[:start]+";if(a.e){fb=a.p?'<span class=\"result-pass\">Avaliação registrada e aprovada pelo AirTrust.</span>':'<span class=\"result-fail\">Avaliação registrada. Revise o conteúdo.</span>'}else if(a.a[q]!=null){fb='Resposta registrada.'}"+render[end:])
    qmap="if(!a.legacy&&a.e)cls+=a.a[i]===qq.answer?' correct':' incorrect'"
    if render.count(qmap)!=1:raise JourneyUnsupported('V33_RENDER_QMAP_DRIFT')
    render=render.replace(qmap,"if(!a.legacy&&a.e)cls+=' recorded'")
    _replace_function(lines,'renderAssessment',render)

    scenario=take('renderScenario')
    a="fb=`<strong>${op.correct?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op.feedback)}</span>`"
    b="(o.correct?'selected correct':'selected incorrect')"
    if scenario.count(a)!=1 or scenario.count(b)!=1:
        raise JourneyUnsupported('V33_SCENARIO_DRIFT')
    scenario=scenario.replace(a,"fb='<strong>Decisão registrada.</strong><span>O AirTrust controlará a devolutiva.</span>'")
    scenario=scenario.replace(b,"'selected'")
    _replace_function(lines,'renderScenario',scenario)
    _replace_function(lines,'safeGet',"function safeGet(){return ''}")
    _replace_function(lines,'safeSet','function safeSet(){return false}')
    _replace_function(lines,'commit','function commit(){return false}')
    _replace_function(lines,'emitDiag','function emitDiag(){}')
    _replace_function(lines,'persist',"function persist(){if(mode==='preview')return true;window.AIRTRUST_PLAYER3_JOURNEY?.hint(slide().id);return true}")
    _replace_function(lines,'finishSession','function finishSession(){return true}')
    # V3 restore spans several lines. Exact source hash pins this operation;
    # only a top-level function (one per source) may be replaced, fail closed.
    text='\n'.join(lines)+'\n'
    restore=re.compile(r'(?m)^function restore\(\)\{\n.*?^\}\n',re.S)
    found=list(restore.finditer(text))
    if len(found)!=1:raise JourneyUnsupported('V33_RESTORE_DRIFT')
    text=restore.sub("function restore(){active=view=0;mode='journey';done=new Set();decisions={};gateSeen=new Set();assessments={};courseCompleted=false;finishRequested=false;sessionEnded=false;restoredMigration=false}\n",text)
    lines=text.splitlines()
    adv=take('advance')
    terminal='if(!finalCompletionReady())return;done.add(active);if(!completionReady()){render(false);requestAnimationFrame(()=>persist());return}courseCompleted=true;mode=\'review\';render(false);requestAnimationFrame(()=>{const saved=persist();if(saved&&completionReady())finishSession(true)})'
    if adv.count(terminal)!=1:raise JourneyUnsupported('V33_LOCAL_TERMINAL_DRIFT')
    adv=adv.replace(terminal,"if(!finalCompletionReady())return;window.AIRTRUST_PLAYER3_JOURNEY?.contentEnd(slide().id);render(false);return")
    _replace_function(lines,'advance',adv)
    _replace_function(lines,'evaluate',
       "function evaluate(){const s=slide(),a=assState(s);if(s.kind!=='assessment'||a.a.some(x=>x===null)||a.e)return;"
       "window.AIRTRUST_PLAYER3_JOURNEY.submit(s.id,a.a).then(v=>{a.legacy=false;a.s=v.score_pct;"
       "a.e=true;a.p=v.stage_passed;a.n=(a.n||0)+1;render(false)}).catch(()=>{"
       "const el=document.querySelector('#gateStatus');if(el)el.textContent='Sem confirmação do AirTrust. Reabra a sessão antes de reenviar.'})}")
    init=take('init')
    debug=';window.__AIRTRUST_PLAYER_TEST__='
    if init.count(debug)!=1:raise JourneyUnsupported('V33_DEBUG_DRIFT')
    init=init.split(debug,1)[0]+'}'
    _replace_function(lines,'init',init)
    text='\n'.join(lines)+'\n'
    qa="const qa=new URLSearchParams(location.search).get('qa')==='1';"
    if text.count(qa)!=1:raise JourneyUnsupported('V33_QA_DRIFT')
    text=text.replace(qa,'const qa=false;')
    bridge=(BRIDGE.replace('__ORIGIN__',json.dumps(origin))
                 .replace('__EDITION__',json.dumps(edition_sha256))
                 .replace('__STAGES__',json.dumps(stages,sort_keys=True)))
    # Inside the original IIFE, so call sites cannot inject authority.
    lines=text.splitlines();lines.insert(1,bridge)
    result='\n'.join(lines)+'\n'
    for forbidden in ('item.answer','qq.answer','s.questions[i].answer','op.correct','op.feedback',
                      'window.__AIRTRUST_PLAYER_TEST__','window.Scorm?.set(',
                      'AIRTRUST_COMPLETION_DIAGNOSTICS_V1','cmi.core.lesson_status'):
        if forbidden in result:raise JourneyUnsupported('V33_LOCAL_GRADING_OR_SCORM_REMAINING:'+forbidden)
    return result.encode('utf8')


def compile_v33_review(original_zip: bytes, source_basename: str,
                       parent_origin: str, edition_sha256: str):
    """Produce segregated review artifact, not approved curriculum."""
    digest=hashlib.sha256(original_zip).hexdigest()
    if digest not in SOURCES:raise JourneyUnsupported('V33_UNPINNED_ARCHIVE')
    from prepare_player3_learner_review import compile_review,fixed_zip,sha
    prepared,meta,projection,bank,receipt=compile_review(original_zip,source_basename)
    with ZipFile(io.BytesIO(original_zip)) as z: app=z.read('app.js')
    with ZipFile(io.BytesIO(prepared)) as z:files={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
    files['app.js']=adapt_v33_app(app,digest,parent_origin,edition_sha256,projection['stages'])
    receipt.update({'status':'REVIEW_ONLY_NOT_PUBLISHABLE',
        'adapter':'AIRTRUST_PLAYER3_V33_REVIEW_V1','adapterHostBridgeImplemented':False,
        'intentionallyModifiedRuntimeFiles':['app.js','scorm_api.js'],
        'formativePolicyReviewRequired':digest in FORMATIVE_ZIPS,
        'certificationApproved':False,'stageContractApproved':False,'publishable':False})
    files['player3-review-manifest.json']=(json.dumps(receipt,sort_keys=True,indent=2,
                                                     ensure_ascii=False)+'\n').encode('utf8')
    return fixed_zip(files),meta,projection,bank,receipt