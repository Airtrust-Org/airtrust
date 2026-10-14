#!/usr/bin/env python3
"""Pinned Player 3 legacy authored HTML5 adapters (Integration, NR20, LOSA).

REVIEW ONLY: never publish or infer certification from browser events.
"""
from __future__ import annotations
import hashlib, io, json, re
from zipfile import ZipFile
from build_player3_standard_journey_review import BRIDGE, JourneyUnsupported
from build_player3_rc81_bridge_review import _host_origin, _replace_line

SOURCES = {
 '5edde2c875e272e563f3f5849f766e185dfc2d61c3074657b52937dbf0319600': ('b4bac6f3e2b776c887a4752a02015cdb946ec601d2532f6bf15782f60075f38c', 1, 'integration'),
 '20788e75c81e95b9af09b946bf867cc2e1d3306a380369d5a58978850e0c8800': ('5a282ae8b38e17172729995da14dfcae94f5ef4f1f6ae888cc990770fb062117', 4, 'nr20'),
 '4c633d41985fb97d7985fedf2b27fd7078a9044f9c723f049c37cac5ebba3945': ('ac7815de863435d2dc27fc992d20493def9d75386af20ece38bccf102f952072', 7, 'losa'),
}
ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')


def _replace_exact(lines,name,replacement):
 try:_replace_line(lines,name,replacement)
 except Exception as error:raise JourneyUnsupported('LEGACY_FUNCTION_DRIFT_'+name) from error

def adapt_legacy_app(app:bytes,source_sha256:str,parent_origin:str,
                     edition_sha256:str,learner_stages:list[dict])->bytes:
 entry=SOURCES.get(source_sha256)
 if not entry or hashlib.sha256(app).hexdigest()!=entry[0]:raise JourneyUnsupported('LEGACY_UNPINNED_SOURCE')
 expected,profile=entry[1:]
 if not re.fullmatch(r'[a-f0-9]{64}',edition_sha256):raise JourneyUnsupported('LEGACY_EDITION_INVALID')
 try:origin=_host_origin(parent_origin)
 except ValueError as error:raise JourneyUnsupported('LEGACY_PARENT_ORIGIN_INVALID') from error
 stages={};seen=set()
 if not isinstance(learner_stages,list) or len(learner_stages)!=expected:
  raise JourneyUnsupported('LEGACY_STAGE_COUNT_DRIFT')
 for stage in learner_stages:
  if not isinstance(stage,dict) or not isinstance(stage.get('stageId'),str) or not ID.fullmatch(stage['stageId']):
   raise JourneyUnsupported('LEGACY_BAD_STAGE_ID')
  sid=stage['stageId'];qs=stage.get('questions')
  if sid in stages or not isinstance(qs,list) or len(qs)!=10:raise JourneyUnsupported('LEGACY_STAGE_QUESTIONS_DRIFT')
  public=[]
  for q in qs:
   if not isinstance(q,dict) or not isinstance(q.get('id'),str) or not ID.fullmatch(q['id']) or q['id'] in seen:
    raise JourneyUnsupported('LEGACY_BAD_PUBLIC_QUESTION')
   seen.add(q['id']);opts=q.get('options')
   if not isinstance(opts,list) or not 2<=len(opts)<=10 or any(
    not isinstance(o,dict) or o.get('id')!='o'+str(i) or not isinstance(o.get('text'),str) or not o['text'].strip()
    for i,o in enumerate(opts)
   ):raise JourneyUnsupported('LEGACY_BAD_PUBLIC_OPTIONS')
   public.append({'id':q['id'],'n':len(opts)})
  stages[sid]=public
 lines=app.decode('utf-8-sig').splitlines()
 def take(name):
  matches=[x for x in lines if x.startswith('function '+name+'(')]
  if len(matches)!=1:raise JourneyUnsupported('LEGACY_FN_DRIFT_'+name)
  return matches[0]
 def replace(text,old,new,issue):
  if text.count(old)!=1:raise JourneyUnsupported('LEGACY_'+issue+'_DRIFT')
  return text.replace(old,new)
 render=take('renderAssessment')
 if profile=='integration':
  render=replace(render,'correct=assessment.answers.reduce((n,a,i)=>n+(a!==null&&a===s.questions[i].answer?1:0),0)',"correct=null",'SCORE')
  render=replace(render,"assessment.evaluated&&assessment.answers[q]===i?(i===item.answer?'correct':'incorrect'):''","assessment.evaluated&&assessment.answers[q]===i?'recorded':''",'OPTION')
  start=render.find(';if(assessment.evaluated){const chosen=');end=render.find('return`<section',start)
  if start<0 or end<0:raise JourneyUnsupported('LEGACY_FEEDBACK_DRIFT')
  render=(render[:start]+";if(assessment.evaluated){feedback=assessment.passed?'Avaliação aprovada e registrada pelo AirTrust.':'Avaliação registrada pelo AirTrust. Revise o conteúdo.'}else if(assessment.answers[q]!=null){feedback='Resposta registrada.'}"+render[end:])
 else:
  render=replace(render,'correct=a.answers.reduce((n,x,i)=>n+(x!==null&&x===s.questions[i].answer?1:0),0)',"correct=null",'SCORE')
  render=replace(render,"if(i===item.answer)cls+=' review-correct';if(i===chosen&&chosen!==item.answer)cls+=' review-incorrect'", "if(i===chosen)cls+=' recorded'", 'OPTION')
  start=render.find(';if(a.evaluated){feedback=');end=render.find('const review=',start)
  if start<0 or end<0:raise JourneyUnsupported('LEGACY_FEEDBACK_DRIFT')
  render=(render[:start]+";if(a.evaluated){feedback=a.passed?'Avaliação aprovada e registrada pelo AirTrust.':'Avaliação registrada pelo AirTrust. Revise o conteúdo.'}else if(chosen!=null){feedback='Resposta registrada.'}"+render[end:])
  render=replace(render,'const hit=a.answers[i]===qq.answer', 'const hit=a.answers[i]!==null','REVIEW')
  for old,new in (("${hit?'correta':'incorreta'}","${hit?'respondida':'não respondida'}"),("${hit?'✓':'×'}","${hit?'•':'–'}"),
   ("${a.evaluated?(chosen===item.answer?'Correta':'Incorreta'):(chosen===null?'Não respondida':'Respondida')}","${a.evaluated?'Registrada':(chosen===null?'Não respondida':'Respondida')}")):
   render=replace(render,old,new,'REVIEW_TAG')
 # Always show server's aggregate score, not browser correctness counts.
 _replace_exact(lines,'renderAssessment',render)
 scenario=take('renderScenario')
 if profile=='integration':
  scenario=replace(scenario,"(o[1]?'correct':'incorrect')","'selected'",'SCENARIO_CSS')
  scenario=replace(scenario,"fb=`<strong>${o[1]?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(o[2])}</span>`","fb='Decisão registrada. Devolutiva pelo AirTrust.'",'SCENARIO_FEEDBACK')
 else:
  scenario=replace(scenario,"fb=`<strong>${op[1]?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op[2])}</span>`","fb='Decisão registrada. Devolutiva pelo AirTrust.'",'SCENARIO_FEEDBACK')
  scenario=replace(scenario,"(o[1]?'selected correct':'selected incorrect')","'selected'",'SCENARIO_CSS')
 _replace_exact(lines,'renderScenario',scenario)
 bind=take('bindScreen')
 bind=replace(bind,"fb.innerHTML=`<strong>${op[1]?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op[2])}</span>`",
              "fb.innerHTML='Decisão registrada. Devolutiva pelo AirTrust.'",'SCENARIO_PREVIEW_FEEDBACK')
 bind=replace(bind,"b.classList.add('selected',op[1]?'correct':'incorrect')",
              "b.classList.add('selected')",'SCENARIO_PREVIEW_CLASS')
 _replace_exact(lines,'bindScreen',bind)
 if profile=='integration':
  original=take('safeGet')
  if original.count('function safeSet(')!=1 or original.count('function commit(')!=1:
   raise JourneyUnsupported('LEGACY_COALESCED_SCORM_DRIFT')
  _replace_exact(lines,'safeGet',"function safeGet(){return ''} function safeSet(){return false} function commit(){return false}")
 else:
  _replace_exact(lines,'safeGet',"function safeGet(){return ''}")
  _replace_exact(lines,'safeSet','function safeSet(){return false}')
  _replace_exact(lines,'commit','function commit(){return false}')
 _replace_exact(lines,'emitDiag','function emitDiag(){}')
 _replace_exact(lines,'persist',"function persist(){if(mode==='preview')return true;window.AIRTRUST_PLAYER3_JOURNEY?.hint(slide().id);return true}")
 _replace_exact(lines,'finishSession','function finishSession(){return true}')
 if profile=='integration':
  _replace_exact(lines,'restore',"function restore(){active=view=0;mode='journey';done=new Set();scenario={};gateSeen=new Set();videoState={};assessment={answers:Array(QLEN).fill(null),evaluated:false,score:0,passed:false,q:0};courseCompleted=false}")
  _replace_exact(lines,'evaluate',"function evaluate(){const s=slide();if(s.kind!=='assessment'||!assessment.answers.every(x=>x!==null)||assessment.evaluated)return;window.AIRTRUST_PLAYER3_JOURNEY.submit(s.id,assessment.answers).then(v=>{assessment.evaluated=true;assessment.passed=v.stage_passed;assessment.score=v.score_pct;render(false)}).catch(()=>{const el=document.querySelector('#gateStatus');if(el)el.textContent='Tentativa não confirmada. Reabra a sessão.'})}")
 else:
  state='assState(s,false)' if profile=='nr20' else 'asmt(s.id)'
  reset="AS.forEach(s=>assState(s,false));" if profile=='nr20' else "assessmentSlides.forEach(s=>asmt(s.id));"
  _replace_exact(lines,'restore',"function restore(){active=view=0;mode='journey';done=new Set();scenario={};gateSeen=new Set();assessments={};courseCompleted=false;"+reset+"}")
  _replace_exact(lines,'evaluate',"function evaluate(){saveScroll();const s=slide();if(s.kind!=='assessment'||mode!=='journey')return;const a="+state+";if(a.evaluated||!a.answers.every(x=>x!==null))return;window.AIRTRUST_PLAYER3_JOURNEY.submit(s.id,a.answers).then(v=>{a.evaluated=true;a.passed=v.stage_passed;a.score=v.score_pct;render(false)}).catch(()=>{const el=document.querySelector('#gateStatus');if(el)el.textContent='Tentativa não confirmada. Reabra a sessão.'})}")
 if profile in ('integration','losa'):
  _replace_exact(lines,'completeCourse',"function completeCourse(){window.AIRTRUST_PLAYER3_JOURNEY?.contentEnd(slide().id);render(false);return false}")
 else:
  adv=take('advance');old="else{courseCompleted=true;mode='review';persist();if(completionReady()){finishRequested=true;emitDiag();try{window.Scorm?.finish?.()}catch(e){}}render(false)}"
  adv=replace(adv,old,"else{window.AIRTRUST_PLAYER3_JOURNEY?.contentEnd(slide().id);render(false)}",'TERMINAL')
  _replace_exact(lines,'advance',adv)
 init=take('init');marker=';window.__AIRTRUST_PLAYER_TEST__='
 if init.count(marker)!=1:raise JourneyUnsupported('LEGACY_DEBUG_DRIFT')
 _replace_exact(lines,'init',init.split(marker,1)[0]+'}')
 text='\n'.join(lines)+'\n'
 qa="const qa=new URLSearchParams(location.search).get('qa')==='1';"
 if text.count(qa)!=1:raise JourneyUnsupported('LEGACY_QA_DRIFT')
 text=text.replace(qa,'const qa=false;')
 bridge=BRIDGE.replace('__ORIGIN__',json.dumps(origin)).replace('__EDITION__',json.dumps(edition_sha256)).replace('__STAGES__',json.dumps(stages,sort_keys=True))
 lines=text.splitlines();lines.insert(1,bridge)
 result='\n'.join(lines)+'\n'
 for forbidden in ('item.answer','qq.answer','s.questions[i].answer','op[1]','op[2]','o[1]','o[2]',
   'window.__AIRTRUST_PLAYER_TEST__','window.Scorm?.set(', 'Scorm?.finish?.()',
   'AIRTRUST_COMPLETION_DIAGNOSTICS_V1','cmi.core.lesson_status'):
  if forbidden in result:raise JourneyUnsupported('LEGACY_LOCAL_GRADING_REMAINS:'+forbidden)
 return result.encode('utf8')


def compile_legacy_review(original_zip:bytes,original_basename:str,parent_origin:str,edition_sha256:str):
 digest=hashlib.sha256(original_zip).hexdigest()
 if digest not in SOURCES:raise JourneyUnsupported('LEGACY_UNPINNED_ARCHIVE')
 from prepare_player3_learner_review import compile_review, fixed_zip
 prepared,meta,projection,bank,receipt=compile_review(original_zip,original_basename)
 with ZipFile(io.BytesIO(original_zip)) as z:app=z.read('app.js')
 with ZipFile(io.BytesIO(prepared)) as z:files={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
 files['app.js']=adapt_legacy_app(app,digest,parent_origin,edition_sha256,projection['stages'])
 receipt.update({'status':'REVIEW_ONLY_NOT_PUBLISHABLE','adapter':'AIRTRUST_PLAYER3_LEGACY_JOURNEY_REVIEW_V1',
  'intentionallyModifiedRuntimeFiles':['app.js','scorm_api.js'],
  'adapterHostBridgeImplemented':False,'stageContractApproved':False,'publishable':False})
 files['player3-review-manifest.json']=(json.dumps(receipt,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf8')
 return fixed_zip(files),meta,projection,bank,receipt