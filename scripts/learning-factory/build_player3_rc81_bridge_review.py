#!/usr/bin/env python3
"""Doutrinamento RC8.1 original-HTML5 adapter prototype, NEVER deploy.

Pins the original authored JS and substitutes only local learning authority:
- zero SCORM status/completion/score writes;
- no correctness or explanations in content JS;
- explicit same-origin parent messages; server verdict required before advancing.
The parent/backend bridge is owned by Player3 Front B and is NOT implemented here.
"""
import hashlib
import json
import re
from urllib.parse import urlsplit

SOURCE_APP_SHA256 = '2e71dbb557e295bfaa995859add714cff9abf9e7c79f5c4a697baa87ffaaa0a8'
SOURCE_ZIP_SHA256 = 'a0a9e955368a8e7f4dd3072b7bd98eb8e5d7cab47d31cbd9335f4282dbba18a2'

class RC81Unsupported(ValueError):
    pass

def _replace_line(lines, name, replacement):
    prefix = 'function ' + name + '('
    found = [i for i, v in enumerate(lines) if v.startswith(prefix)]
    if len(found) != 1:
        raise RC81Unsupported('RC81_PATCH_FUNCTION_MISSING_' + name)
    # Verified source is minified by function, one function per line.
    lines[found[0]] = replacement

def _host_origin(value):
    url = urlsplit(value)
    if (url.scheme != 'https' or not url.netloc or url.path or url.query or url.fragment
            or url.username or url.password or url.hostname in ('localhost','127.0.0.1')):
        raise RC81Unsupported('RC81_PARENT_ORIGIN_INVALID')
    return value

def adapt_rc81_app(original_js: bytes, source_zip_sha256: str, parent_origin: str,
                   edition_sha256: str, learner_stages: list[dict]) -> bytes:
    if source_zip_sha256 != SOURCE_ZIP_SHA256 or hashlib.sha256(original_js).hexdigest() != SOURCE_APP_SHA256:
        raise RC81Unsupported('RC81_SOURCE_NOT_PINNED')
    if not re.fullmatch(r'[a-f0-9]{64}', edition_sha256):
        raise RC81Unsupported('RC81_EDITION_UNPINNED')
    parent_origin = _host_origin(parent_origin)
    questions = {}
    for stage in learner_stages:
        stage_id = stage.get('stageId')
        qs = stage.get('questions')
        if (not isinstance(stage_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', stage_id)
                or stage_id in questions or not isinstance(qs, list) or not qs):
            raise RC81Unsupported('RC81_INVALID_PUBLIC_STAGE')
        ids = [q.get('id') for q in qs]
        if any(not isinstance(x, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', x) for x in ids):
            raise RC81Unsupported('RC81_INVALID_PUBLIC_QUESTION')
        questions[stage_id] = ids
    if len(questions) != 8 or sum(map(len, questions.values())) != 80:
        raise RC81Unsupported('RC81_STAGE_POLICY_MISMATCH')
    lines = original_js.decode('utf-8-sig').splitlines()
    # Render functions keep ORIGINAL DOM skeleton, CSS names, images, and interactions.
    render = next((x for x in lines if x.startswith('function renderAssessment(')), None)
    if render is None:
        raise RC81Unsupported('RC81_RENDER_MISSING')
    substitutions = [
        ("correct=a.answers.reduce((n,x,i)=>n+(x!==null&&x===s.questions[i].answer?1:0),0)",
         "correct='—'"),
        ("if(i===item.answer)cls+=' review-correct';if(i===chosen&&chosen!==item.answer)cls+=' review-incorrect'",
         "if(i===chosen)cls+=' selected'"),
        ("feedback=chosen===item.answer?`<span class=\"result-pass\">Questão correta.</span> ${esc(item.explain)}`:`<span class=\"result-fail\">Questão incorreta.</span> ${esc(item.explain)}`",
         "feedback=a.passed?'<span class=\"result-pass\">Avaliação aprovada e registrada pelo AirTrust.</span>':'<span class=\"result-fail\">Avaliação registrada pelo AirTrust. Revise o conteúdo.</span>'"),
        ("const hit=a.answers[i]===qq.answer", "const hit=a.answers[i]!==null"),
        ("${hit?'correta':'incorreta'}", "${hit?'respondida':'não respondida'}"),
        ("${hit?'✓':'×'}", "${hit?'•':'–'}"),
        ("${a.evaluated?(chosen===item.answer?'Correta':'Incorreta'):(chosen===null?'Não respondida':'Respondida')}",
         "${a.evaluated?'Registrada pelo AirTrust':(chosen===null?'Não respondida':'Respondida')}"),
        ("${a.evaluated?correct:'—'}", "${correct}"),
    ]
    for old, new in substitutions:
        if render.count(old) != 1:
            raise RC81Unsupported('RC81_RENDER_TEMPLATE_DRIFT')
        render = render.replace(old, new)
    _replace_line(lines, 'renderAssessment', render)
    # Scenario is a decision prompt; correctness and feedback must stay on Worker.
    scenario = next(x for x in lines if x.startswith('function renderScenario('))
    scenario = scenario.replace("fb=`<strong>${op[1]?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op[2])}</span>`",
                                "fb='<strong>Decisão registrada.</strong><span>A devolutiva será fornecida pelo AirTrust.</span>'")
    scenario = scenario.replace("(o[1]?'selected correct':'selected incorrect')", "'selected'")
    if 'op[1]' in scenario or 'op[2]' in scenario:
        raise RC81Unsupported('RC81_SCENARIO_KEY_REMAINING')
    _replace_line(lines, 'renderScenario', scenario)
    bind = next(x for x in lines if x.startswith('function bindScreen('))
    old = "fb.innerHTML=`<strong>${op[1]?'Resposta adequada':'Revise a decisão'}</strong><span>${esc(op[2])}</span>`"
    if bind.count(old) != 1:
        raise RC81Unsupported('RC81_SCENARIO_BIND_DRIFT')
    bind = bind.replace(old, "fb.innerHTML='<strong>Decisão registrada.</strong><span>O AirTrust controlará o feedback.</span>'")
    bind = bind.replace("b.classList.add('selected',op[1]?'correct':'incorrect')", "b.classList.add('selected')")
    _replace_line(lines, 'bindScreen', bind)
    _replace_line(lines, 'safeGet', "function safeGet(){return ''}")
    _replace_line(lines, 'safeSet', 'function safeSet(){return false}')
    _replace_line(lines, 'commit', 'function commit(){return false}')
    _replace_line(lines, 'restore', "function restore(){active=0;view=0;mode='journey';courseCompleted=false;AS.forEach(s=>assState(s,false))}")
    _replace_line(lines, 'persist',
        "function persist(){if(mode==='preview')return true;window.AIRTRUST_PLAYER3_RC81?.hint(slide().id);return true}")
    _replace_line(lines, 'emitDiag', 'function emitDiag(){/* No SCORM grade/completion diagnostic from content */}')
    _replace_line(lines, 'completeCourse',
        "function completeCourse(){window.AIRTRUST_PLAYER3_RC81?.contentEnd(slide().id);render(false);return false}")
    _replace_line(lines, 'finishSession', 'function finishSession(){return true}')
    _replace_line(lines, 'evaluate',
        "function evaluate(){const s=slide();if(s.kind!=='assessment'||mode!=='journey')return;"
        "const a=assState(s,false);if(a.evaluated||!a.answers.every(x=>x!==null))return;"
        "window.AIRTRUST_PLAYER3_RC81.submit(s.id,a.answers).then(v=>{"
        "a.evaluated=true;a.passed=v.stage_passed;a.score=v.score_pct;render(false)"
        "}).catch(()=>{const el=document.querySelector('#gateStatus');if(el)"
        "el.textContent='Resposta não confirmada pelo AirTrust. Reabra a sessão.'})}")
    # Never ship the old test-only force-completion interface into a learner runtime.
    init = next(x for x in lines if x.startswith('function init('))
    marker = ';window.__AIRTRUST_PLAYER_TEST__='
    if marker not in init:
        raise RC81Unsupported('RC81_DEBUG_INTERFACE_DRIFT')
    init = init.split(marker,1)[0] + '}'
    _replace_line(lines, 'init', init)
    bridge = r'''const __P3_RC81 = (() => {
      const origin = __ORIGIN__, edition = __EDITION__, qid = __QUESTIONS__;
      let pending = null;
      const goodId = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(x);
      function post(data){if(window.parent !== window)window.parent.postMessage(data,origin)}
      window.addEventListener('message', e => {
        if(e.source !== window.parent || e.origin !== origin || !pending) return;
        const d=e.data;
        if(!d || d.type !== 'AIRTRUST_PLAYER3_STAGE_VERDICT_V1' || d.editionSha256 !== edition ||
          d.requestId !== pending.id || d.stageId !== pending.stage ||
          typeof d.stage_passed !== 'boolean' || !Number.isInteger(d.score_pct) ||
          d.score_pct < 0 || d.score_pct > 100 || d.persisted !== true) return;
        const settle=pending;pending=null;
        settle.resolve({stage_passed:d.stage_passed,score_pct:d.score_pct});
      });
      return {
        hint(unitId){if(goodId(unitId))post({type:'AIRTRUST_PLAYER3_NAV_HINT_V1',unitId,editionSha256:edition})},
        contentEnd(unitId){if(goodId(unitId))post({type:'AIRTRUST_PLAYER3_CONTENT_END_HINT_V1',unitId,editionSha256:edition})},
        submit(stageId,selections){
          if(pending) return Promise.reject(new Error('PLAYER3_ATTEMPT_PENDING'));
          const ids=qid[stageId];
          if(!goodId(stageId) || !Array.isArray(ids) || !Array.isArray(selections) ||
             ids.length!==selections.length || !selections.every(x=>Number.isInteger(x) && x>=0 && x<=9))
            return Promise.reject(new Error('PLAYER3_INVALID_PUBLIC_SELECTION'));
          if(window.parent === window || !crypto?.randomUUID)
            return Promise.reject(new Error('PLAYER3_PARENT_UNAVAILABLE'));
          const requestId=crypto.randomUUID();
          return new Promise((resolve,reject) => {
            pending={id:requestId,stage:stageId,resolve,reject};
            post({type:'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',editionSha256:edition,stageId,
              requestId,answers:ids.map((questionId,i)=>({questionId,optionId:'o'+selections[i]}))});
            // A timeout NEVER creates an attempt or auto-passes the stage.
            setTimeout(()=>{if(pending?.id===requestId){pending=null;reject(new Error('PLAYER3_RECEIPT_TIMEOUT'))}},60000);
          });
        },
      };
    })();
    window.AIRTRUST_PLAYER3_RC81=__P3_RC81;
    '''
    bridge=bridge.replace('__ORIGIN__',json.dumps(parent_origin)).replace('__EDITION__',json.dumps(edition_sha256)).replace('__QUESTIONS__',json.dumps(questions,sort_keys=True))
    lines.insert(1, bridge)
    result = '\n'.join(lines) + '\n'
    # Fail closed: the authored runtime must contain no local exam grading code.
    if any(x in result for x in ('.answer?', 'item.answer', 'qq.answer', 'x===s.questions[i].answer', 'window.__AIRTRUST_PLAYER_TEST__', "Scorm?.finish?.()")):
        raise RC81Unsupported('RC81_CLIENT_GRADER_NOT_REMOVED')
    return result.encode('utf8')