#!/usr/bin/env python3
"""Deterministically derive the Factory V3 RC6 CANDIDATE core from the pinned RC5 core.

The RC5 core is minified into very long lines, so a line diff is unreadable. The
RC6 delta is therefore expressed here as an ordered list of anchored
replacements (each anchor must occur EXACTLY once in RC5). The list below is the
reviewable diff; ``--check`` proves the committed RC6 file is exactly its output.

Nothing here activates a package, touches published ZIPs, D1, R2 or workflows.

Changes versus RC5 (see docs/ops/FACTORY_V3_RC6_CORE_PROPOSAL.md):
  T1  LMSFinish only when the course is completed. Leaving/hiding the page only
      persists + commits (RC5 called Finish on beforeunload/pagehide/unload, after
      which scorm_api.js silently drops every write).
  A2  A scenario advances only with the correct option. Wrong options are
      recorded as interactions, shown with feedback, disabled, and never stored
      as the accepted answer in ``scenario`` (suspend_data stays RC5-compatible).
  A3  cmi.interactions.n.* (choice) reported per attempt, capped at MAXI (80..140, 4 per scenario + 2 per exam question).
  A4  Dedicated aria-live region (#liveMsg, created by the core when absent) and
      lang="en" marking (opt-in with COURSE_DATA.enLangMarking === true).
"""
import argparse
import hashlib
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RC5 = HERE / "cores" / "AIRTRUST_FORMATIVE_V3_RECOVERY_CANDIDATE.app.js.txt"
RC6 = HERE / "cores" / "AIRTRUST_FORMATIVE_V3_RC6_CANDIDATE.app.js.txt"
RC5_SHA = "abf5b151561ca6f362f98b6c12faf98ec9893de56455be8c112a064c5e8a995f"

# (label, anchor present exactly once in RC5, replacement)
REPLACEMENTS = [
    ("helpers+state vars (lang marking, interaction cap, per-session attempt memory)",
     r"""let view=0,active=0,mode='journey',done=new Set(),scenario={},""",
     r"""const EN_MARK=C.enLangMarking===true,MAXI=Math.min(140,Math.max(80,S.filter(x=>x.kind==='scenario').length*4+QLEN*2)),enH=s=>EN_MARK?`<span lang="en">${esc(s)}</span>`:esc(s),quoteEn=s=>EN_MARK?esc(s).replace(/“([^”]+)”/g,(m,a)=>'“<span lang="en">'+a+'</span>”'):esc(s),optHtml=(s,i)=>EN_MARK&&Array.isArray(s.enOpts)&&s.enOpts.includes(i)?enH(s.options[i][0]):quoteEn(s.options[i][0]),colItem=(c,x)=>EN_MARK&&c.title==='Leitura em inglês'?(/^Termos: /.test(x)?'Termos: '+enH(x.slice(8)):enH(x)):esc(x),bodyItem=x=>EN_MARK&&/^EN — /.test(x)?'<span>EN — '+enH(x.slice(5))+'</span>':esc(x),noteHtml=x=>{const m=EN_MARK?String(x).match(/^(Exemplo de leitura: )(.+?) — (.+)$/):null;return m?esc(m[1])+enH(m[2])+' — '+esc(m[3]):esc(x)};
let view=0,active=0,mode='journey',done=new Set(),scenario={},ix=0,wrong={},lastPick={},"""),

    ("live region + interaction reporting helpers",
     r"""function commit(){try{return ok(window.Scorm?.commit())}catch(e){return false}}""",
     r"""function commit(){try{return ok(window.Scorm?.commit())}catch(e){return false}}
function liveEl(){let e=document.querySelector('#liveMsg');if(!e){e=document.createElement('div');e.id='liveMsg';e.setAttribute('role','status');e.setAttribute('aria-live','polite');e.setAttribute('aria-atomic','true');e.style.cssText='position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';document.body.appendChild(e)}return e}
let liveTimer=0;function announce(t){try{const e=liveEl();e.textContent='';clearTimeout(liveTimer);liveTimer=setTimeout(()=>{e.textContent=t},60)}catch(_e){}}
const LET='abcdefghijklmnopqrstuvwxyz',lt=i=>LET[i]||'',correctPat=o=>o.map((x,i)=>x[1]===true?lt(i):'').filter(Boolean).join(',');
function recordInteraction(id,resp,result,pattern){if(qa||invalidEditionState||ix>=MAXI)return;const n=ix++,p='cmi.interactions.'+n+'.',t=new Date(),pad=v=>String(v).padStart(2,'0');safeSet(p+'id',String(id).replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,200));safeSet(p+'type','choice');safeSet(p+'time',pad(t.getHours())+':'+pad(t.getMinutes())+':'+pad(t.getSeconds()));if(pattern)safeSet(p+'correct_responses.0.pattern',pattern);safeSet(p+'student_response',resp);safeSet(p+'result',result)}"""),

    ("suspend_data carries the interaction counter (optional key, RC5 readers ignore it)",
     r"""q:assessment,c:courseCompleted})}""",
     r"""q:assessment,c:courseCompleted,x:ix})}"""),

    ("restore interaction counter",
     r"""assessment=o.q&&Array.isArray(o.q.answers)?o.q:assessment;""",
     r"""assessment=o.q&&Array.isArray(o.q.answers)?o.q:assessment;ix=Number.isInteger(o.x)&&o.x>=0?Math.min(o.x,MAXI):0;"""),

    ("restore: an RC5-era wrong answer on the active scenario is not an accepted answer",
     r"""if(courseCompleted){for(let i=0;i<T;i++)done.add(i);active=T-1}""",
     r"""if(courseCompleted){for(let i=0;i<T;i++)done.add(i);active=T-1}
 if(!courseCompleted){const cs=S[active];if(cs?.kind==='scenario'&&scenario[cs.id]!=null&&cs.options[scenario[cs.id]]?.[1]!==true){wrong[cs.id]=[scenario[cs.id]];delete scenario[cs.id]}}"""),

    ("A2/A3: wrong option = interaction + feedback + disabled, never accepted; correct = accepted",
     r"""function chooseScenario(opt){const s=slide(),repair=s.kind==='scenario'&&!courseCompleted&&!invalidEditionState&&mode==='review'&&view<active&&done.has(view)&&scenario[s.id]==null;if(mode==='journey'||repair){const prior=scenario[s.id];scenario[s.id]=opt;if(!persist(repair)){if(prior==null)delete scenario[s.id];else scenario[s.id]=prior;render(false);return}if(repair){view=active;mode='journey'}}render(false)}""",
     r"""function scenarioOk(s){const v=scenario[s.id];return v!=null&&s.options[v]?.[1]===true}
function chooseScenario(opt){const s=slide(),repair=s.kind==='scenario'&&!courseCompleted&&!invalidEditionState&&mode==='review'&&view<active&&done.has(view)&&scenario[s.id]==null,o=s.options[opt];if(!o)return;if(mode==='journey'||repair){if(scenarioOk(s)||(wrong[s.id]||[]).includes(opt))return;const good=o[1]===true;lastPick[s.id]=opt;recordInteraction(s.id,lt(opt),good?'correct':'wrong',correctPat(s.options));if(!good){(wrong[s.id]=wrong[s.id]||[]).push(opt);persist(repair);render(false);announce('Revise a decisão. '+o[2]+' Escolha outra alternativa para continuar.');return}const prior=scenario[s.id];scenario[s.id]=opt;if(!persist(repair)){if(prior==null)delete scenario[s.id];else scenario[s.id]=prior;render(false);return}if(repair){view=active;mode='journey'}render(false);announce('Resposta adequada. '+o[2]);return}render(false)}"""),

    ("A4: lang=\"en\" in columns/body",
     r"""c.items.map(x=>`<li>${esc(x)}</li>`).join('')""",
     r"""c.items.map(x=>`<li>${colItem(c,x)}</li>`).join('')"""),
    ("A4: lang=\"en\" in body items",
     r"""s.body.map(x=>`<div class="body-item">${esc(x)}</div>`).join('')""",
     r"""s.body.map(x=>`<div class="body-item">${bodyItem(x)}</div>`).join('')"""),
    ("A4: lang=\"en\" in notes",
     r"""(s.note?'<p>'+esc(s.note)+'</p>':'')""",
     r"""(s.note?'<p>'+noteHtml(s.note)+'</p>':'')"""),

    ("A2/A4: scenario markup (tried options disabled, lang=en options/question)",
     r"""const selected=mode==='preview'?null:scenario[s.id],opts=s.options.map((o,i)=>`<button class="option ${selected===i?'selected '+(o[1]?'correct':'incorrect'):''}" data-opt="${i}"><span class="letter">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]}</span><b>${esc(o[0])}</b></button>`).join('');""",
     r"""const tried=wrong[s.id]||[],selected=mode==='preview'?null:(lastPick[s.id]??scenario[s.id]),lock=mode==='journey'&&scenarioOk(s),opts=s.options.map((o,i)=>`<button class="option ${selected===i?'selected '+(o[1]?'correct':'incorrect'):(tried.includes(i)?'incorrect':'')}" data-opt="${i}" ${mode!=='preview'&&(lock||tried.includes(i))?'disabled':''}><span class="letter">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]}</span><b>${optHtml(s,i)}</b></button>`).join('');"""),
    ("A4: question with quoted English",
     r"""<div class="decision"><h2>${esc(s.question)}</h2>""",
     r"""<div class="decision"><h2>${s.ptQuote?esc(s.question):quoteEn(s.question)}</h2>"""),

    ("A4: announce screen change",
     r"""bindScreen();$('#count').textContent=""",
     r"""bindScreen();if(reset)announce(`Tela ${view+1} de ${T}: ${s.title}${mode==='preview'?' — pré-visualização':''}`);$('#count').textContent="""),

    ("A4: announce preview feedback",
     r"""b.classList.add('selected',op[1]?'correct':'incorrect');return}chooseScenario(i)""",
     r"""b.classList.add('selected',op[1]?'correct':'incorrect');announce((op[1]?'Resposta adequada. ':'Revise a decisão. ')+op[2]);return}chooseScenario(i)"""),

    ("A2: footer hint after a wrong attempt",
     r"""if(g.required)el.textContent=g.complete?""",
     r"""if(s.kind==='scenario'&&(wrong[s.id]||[]).length&&!scenarioOk(s)){el.textContent='Revise a decisão — escolha outra alternativa';return}if(g.required)el.textContent=g.complete?"""),

    ("A2: canAdvance requires the correct option for scenarios",
     r"""if(s.kind==='scenario')return scenario[s.id]!=null;""",
     r"""if(s.kind==='scenario')return scenarioOk(s);"""),

    ("A2: next button label while no correct option is accepted",
     r"""if(s.kind==='scenario'&&scenario[s.id]==null){n.textContent='Responda ao cenário';""",
     r"""if(s.kind==='scenario'&&!scenarioOk(s)){n.textContent=(wrong[s.id]||[]).length?'Escolha a alternativa adequada':'Responda ao cenário';"""),

    ("A3: scored assessment reports one interaction per question per evaluation",
     r"""assessment.passed=assessment.score>=PASS;persist();render(false)}""",
     r"""assessment.passed=assessment.score>=PASS;s.questions.forEach((q,i)=>recordInteraction(s.id+'_q'+(i+1),lt(assessment.answers[i]),assessment.answers[i]===q.answer?'correct':'wrong',lt(q.answer)));persist();render(false)}"""),

    ("T1: leaving/hiding only persists; Finish only in terminal (completed) state",
     r"""function finishSession(){if(qa)return true;try{if(window.Scorm?.isFinished?.())return true}catch(e){}const saved=persist();if(!saved)return false;finishRequested=true;emitDiag();try{return ok(window.Scorm?.finish?.())}catch(e){return false}}""",
     r"""function saveOnLeave(terminate){if(qa)return true;try{if(window.Scorm?.isFinished?.())return true}catch(e){}const saved=persist();if(!saved)return false;if(!terminate||!courseCompleted)return true;finishRequested=true;emitDiag();try{return ok(window.Scorm?.finish?.())}catch(e){return false}}"""),

    ("A4: drop aria-live from #viewport, create dedicated region before first render",
     r"""render();window.__AIRTRUST_PLAYER_TEST__={""",
     r"""try{$('#viewport').removeAttribute('aria-live');liveEl()}catch(e){}render();window.__AIRTRUST_PLAYER_TEST__={"""),

    ("test hook: expose interaction counter",
     r"""courseCompleted,completionReady:completionReady(),snapshotLength:state().length})""",
     r"""courseCompleted,completionReady:completionReady(),snapshotLength:state().length,interactionCount:ix})"""),

    ("test hook: finishSession is now terminal-only, saveOnLeave exposed",
     r"""persist,finishSession,resetAssessment}}""",
     r"""persist,finishSession:()=>saveOnLeave(true),saveOnLeave,resetAssessment}}"""),

    ("T1: unload handlers (no Finish for incomplete courses; no deprecated unload)",
     r"""window.addEventListener('beforeunload',finishSession);window.addEventListener('pagehide',finishSession);window.addEventListener('unload',finishSession);""",
     r"""window.addEventListener('beforeunload',()=>saveOnLeave(true));window.addEventListener('pagehide',()=>saveOnLeave(true));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveOnLeave(false)});"""),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build() -> bytes:
    source = RC5.read_bytes()
    if sha(source) != RC5_SHA:
        raise SystemExit("RC5_CORE_SHA_MISMATCH")
    text = source.decode("utf-8")
    for label, old, new in REPLACEMENTS:
        count = text.count(old)
        if count != 1:
            raise SystemExit(f"ANCHOR_NOT_UNIQUE({count}): {label}")
        text = text.replace(old, new)
    return text.encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify the committed RC6 file equals the build output")
    parser.add_argument("--write", action="store_true", help="write the RC6 candidate core")
    args = parser.parse_args()
    built = build()
    if args.write:
        RC6.write_bytes(built)
    if args.check and (not RC6.is_file() or RC6.read_bytes() != built):
        print("RC6_CORE_NOT_REPRODUCIBLE", file=sys.stderr)
        return 1
    print(sha(built))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
