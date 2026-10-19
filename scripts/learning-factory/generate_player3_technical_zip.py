#!/usr/bin/env python3
"""Offline-only Player 3 *synthetic* browser fixture. Never uploads or certifies.

Produces a deterministic ZIP of disposable HTML5 and an independent private QA
policy/profile fragment. Not a course, not an alternative to Schema V2 or
server-authorized enrollment and completion. No real training file is read.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZIP_STORED, ZipFile, ZipInfo

SHA = re.compile(r"^[a-f0-9]{64}$")
UNIT_COUNT = 5


class TechnicalFixtureError(ValueError):
    pass


def require(ok: bool, code: str) -> None:
    if not ok:
        raise TechnicalFixtureError(code)


def safe_origin(raw: str) -> str:
    value = urlparse(raw)
    require(
        value.scheme == "https" and bool(value.hostname)
        and value.hostname != "localhost" and not value.hostname.startswith("127.")
        and value.username is None and value.password is None
        and not value.path and not value.params and not value.query and not value.fragment
        and ("staging" in value.hostname or "stage" in value.hostname or "qa" in value.hostname)
        and not value.hostname.endswith("airtrust.online"),
        "TECHNICAL_QA_STAGING_ORIGIN_REQUIRED",
    )
    return raw


def units() -> list[dict]:
    sequence = []
    for n in range(1, UNIT_COUNT + 1):
        if n == 3:
            sequence.append({
                "id": "qa-stage-1", "kind": "assessment", "visualCue": "Technical assessment",
                "official": {"stageId": "qa-stage-1", "questions": [
                    {"question": f"Synthetic question {i}?", "wrong": "Option Alpha", "correct": "Option Beta"}
                    for i in range(1, 11)
                ]},
            })
        else:
            item = {"id": f"qa-unit-{n}", "kind": "lesson", "lessonId": f"qa-unit-{n}",
                    "visualCue": f"Synthetic technical unit {n}"}
            if n == 1:
                item["practice"] = {"question": "Synthetic formative interaction?",
                                    "wrong": "No", "correct": "Yes"}
            sequence.append(item)
    return sequence


def browser_files(origin: str, edition: str) -> dict[str, bytes]:
    public_units = []
    for unit in units():
        public = {"id": unit["id"], "kind": unit["kind"], "visualCue": unit["visualCue"]}
        if "practice" in unit:
            public["practice"] = {"question": unit["practice"]["question"],
                                   "options": ["No", "Yes"]}
        if "official" in unit:
            public["questions"] = [
                {"id": f"qa-stage-1-q{i}", "question": q["question"],
                 "options": [{"id": "o0", "label": q["wrong"]},
                             {"id": "o1", "label": q["correct"]}]}
                for i, q in enumerate(unit["official"]["questions"], start=1)
            ]
        public_units.append(public)
    config = json.dumps({"parentOrigin": origin, "editionSha256": edition,
                         "units": public_units}, sort_keys=True, separators=(",", ":"))
    html = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Player 3 — conteúdo sintético de teste</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:20px system-ui,sans-serif;margin:2rem;color:#18313b}button{font:inherit;margin:.4rem;padding:.6rem}button:disabled{opacity:.5}#viewport{min-height:12rem}#status{font-size:.85em}</style>
</head><body><main><h1>Player 3 — homologação técnica sintética</h1><p>Não é treinamento real e não emite certificado.</p>
<p id="count"></p><div id="viewport"></div><p id="status" aria-live="polite"></p>
<button id="qNext" hidden>Próxima questão</button><button id="next">Avançar</button></main><script src="app.js"></script></body></html>
"""
    js = r'''"use strict";
const CONFIG = __CONFIG__;
const U=CONFIG.units, ORIGIN=CONFIG.parentOrigin, EDITION=CONFIG.editionSha256;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
let at=0, question=0, answers=[], verdict=null, pending=null, resumed=false, practiced=false;
const screen=document.getElementById('viewport'), count=document.getElementById('count');
const next=document.getElementById('next'), qNext=document.getElementById('qNext');
const status=document.getElementById('status');
const say=data=>{if(window.parent!==window)window.parent.postMessage(data,ORIGIN)};
function hint(){say({type:'AIRTRUST_PLAYER3_NAV_HINT_V1',unitId:U[at].id,editionSha256:EDITION})}
function render(){
  const u=U[at];count.textContent=(at+1)+'/'+U.length;
  screen.replaceChildren();const node=document.createElement('section');
  node.className='screen';node.dataset.unit=u.id;
  const title=document.createElement('h2');title.textContent=u.visualCue;node.append(title);
  qNext.hidden=true;next.disabled=false;status.textContent='';
  if(u.kind==='assessment'){
    const box=document.createElement('div');box.className='assessment-page';
    const q=u.questions[question];const prompt=document.createElement('p');prompt.textContent=q.question;
    box.append(prompt);
    q.options.forEach(o=>{const b=document.createElement('button');
      b.dataset.answer=o.id;b.textContent=o.label;
      b.setAttribute('aria-pressed',String(answers[question]===o.id));
      b.onclick=()=>{if(verdict)return;answers[question]=o.id;render()};box.append(b)});
    node.append(box);
    if(verdict){next.textContent=verdict==='failed'?'Nova tentativa':at===U.length-1?'Concluir curso':'Continuar';
      status.textContent=verdict==='failed'?'Tentativa recusada pelo Worker':'Etapa validada pelo Worker';
    } else {next.textContent='Enviar avaliação';next.disabled=answers.length!==u.questions.length||answers.some(x=>!x)||!!pending;
      if(question<u.questions.length-1){qNext.hidden=false;qNext.disabled=!answers[question]}}
  } else {
    next.textContent=at===U.length-1?'Concluir conteúdo':'Próxima unidade';
    if(u.practice){const p=document.createElement('p');p.textContent=u.practice.question;node.append(p);
      const gate=document.createElement('button');gate.dataset.gate='1';gate.textContent='Interação';
      gate.onclick=()=>{gate.disabled=true};node.append(gate);
      u.practice.options.forEach((label,i)=>{const b=document.createElement('button');b.dataset.opt=String(i);
        b.textContent=label;b.onclick=()=>{if(i===1){practiced=true;next.disabled=false}else{status.textContent='Tente novamente'}};node.append(b)});
      next.disabled=!practiced;
    }
  }
  screen.append(node);
}
function advance(){if(at===U.length-1){say({type:'AIRTRUST_PLAYER3_CONTENT_END_HINT_V1',unitId:U[at].id,editionSha256:EDITION});return}
  at++;question=0;answers=[];verdict=null;practiced=false;render();hint()}
function submit(){const u=U[at];if(pending||answers.length!==u.questions.length||answers.some(x=>!x)||!crypto.randomUUID)return;
  const requestId=crypto.randomUUID();pending=requestId;
  say({type:'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',editionSha256:EDITION,stageId:u.id,requestId,
    answers:u.questions.map((q,i)=>({questionId:q.id,optionId:answers[i]}))});render()}
qNext.onclick=()=>{if(answers[question]&&question<U[at].questions.length-1){question++;render()}};
next.onclick=()=>{if(next.disabled)return;const u=U[at];if(u.kind!=='assessment')return advance();
  if(verdict==='failed'){verdict=null;question=0;answers=[];render();return}
  if(verdict==='passed')return advance();submit()};
window.addEventListener('message',event=>{
  if(event.origin!==ORIGIN||event.source!==window.parent||!event.data||typeof event.data!=='object')return;
  const d=event.data;
  if(d.type==='AIRTRUST_PLAYER3_RESUME_CURSOR_V1'){
    if(resumed||pending||d.editionSha256!==EDITION||!ID.test(d.nextUnitId)||
       Object.keys(d).sort().join(',')!=='editionSha256,nextUnitId,type')return;
    const index=U.findIndex(x=>x.id===d.nextUnitId);if(index<0)return;
    resumed=true;at=index;question=0;answers=[];verdict=null;practiced=false;render();
    say({type:'AIRTRUST_PLAYER3_RESUME_ACK_V1',editionSha256:EDITION,unitId:U[at].id});return;
  }
  if(d.type==='AIRTRUST_PLAYER3_STAGE_VERDICT_V1'&&pending&&d.requestId===pending&&
    d.stageId===U[at].id&&d.editionSha256===EDITION&&d.persisted===true&&
    typeof d.stage_passed==='boolean'&&Number.isInteger(d.score_pct)&&d.score_pct>=0&&d.score_pct<=100){
      pending=null;verdict=d.stage_passed?'passed':'failed';render();
  }
});
render();
'''.replace('__CONFIG__', config)
    return {"index.html": html.encode(), "app.js": js.encode()}


def build(out: Path, origin: str, edition: str) -> dict:
    require(SHA.fullmatch(edition) is not None, "TECHNICAL_QA_EDITION_SHA_REQUIRED")
    safe_origin(origin)
    require(not out.exists() and not out.is_symlink(), "TECHNICAL_QA_OUTPUT_ALREADY_EXISTS")
    names = browser_files(origin, edition)
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    archive = out / "player3-technical-only.zip"
    try:
        with ZipFile(archive, "w", compression=ZIP_STORED) as z:
            for name in sorted(names):
                meta = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
                meta.compress_type = ZIP_STORED
                meta.external_attr = 0o644 << 16
                z.writestr(meta, names[name])
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        unit_list = units()
        private = {"status": "TECHNICAL_TEST_ONLY_DO_NOT_DEPLOY_AS_REAL_COURSE",
                   "sourceZipSha256": digest, "editionSha256": edition,
                   "qaContentMode": "SYNTHETIC_TECHNICAL", "units": unit_list,
                   "requiredLessonIds": [u["lessonId"] for u in unit_list if "lessonId" in u],
                   "privateSyntheticAnswerKeys": {"qa-stage-1": {
                       f"qa-stage-1-q{i}": "o1" for i in range(1, 11)}}}
        secret = out / "PRIVATE-qa-profile-fragment.json"
        secret.write_text(json.dumps(private, sort_keys=True, indent=2) + "\n", encoding="utf8")
        os.chmod(secret, 0o600)
        manifest = {"status": "SYNTHETIC_TECHNICAL_NOT_AUTHORIZED_FOR_RELEASE",
                    "sourceZipSha256": digest, "editionSha256": edition,
                    "unitCount": len(unit_list), "stageCount": 1,
                    "contentSha256": hashlib.sha256(names["index.html"] + names["app.js"]).hexdigest(),
                    "remoteWrites": False}
        (out / "manifest.json").write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")
        return manifest
    except BaseException:
        import shutil
        shutil.rmtree(out)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--parent-origin", required=True)
    parser.add_argument("--edition-sha256", required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.out, args.parent_origin, args.edition_sha256), sort_keys=True))


if __name__ == "__main__":
    main()
