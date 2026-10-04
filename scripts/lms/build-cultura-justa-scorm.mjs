#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE_PATH = resolve(ROOT, 'training-content/cultura-justa-m8/course-source.json');
const DEFAULT_OUTPUT = resolve(ROOT, 'dist/scorm/cultura-justa-m8-2026.10-rc1.zip');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg ? resolve(ROOT, outputArg.slice('--output='.length)) : DEFAULT_OUTPUT;

const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const encoder = new TextEncoder();
const text = (value) => strToU8(value);
const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function resolveCommonsAsset(asset) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|sha1|extmetadata',
    titles: `File:${asset.commonsTitle}`,
    origin: '*',
  });
  const metadataUrl = `https://commons.wikimedia.org/w/api.php?${params}`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: { 'user-agent': 'AirTrust-SCORM-Builder/1.0 (training package build)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!metadataResponse.ok) throw new Error(`COMMONS_METADATA_HTTP_${metadataResponse.status}:${asset.id}`);
  const metadata = await metadataResponse.json();
  const page = metadata?.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url || !info?.sha1) throw new Error(`COMMONS_ASSET_NOT_RESOLVED:${asset.id}`);
  const ext = info.extmetadata ?? {};
  const licenseText = [
    ext.LicenseShortName?.value,
    ext.UsageTerms?.value,
    ext.Copyrighted?.value,
    asset.license,
  ].filter(Boolean).join(' ');
  if (!/public\s*domain|pd[-\s]?us/i.test(licenseText)) {
    throw new Error(`COMMONS_ASSET_LICENSE_NOT_PUBLIC_DOMAIN:${asset.id}:${licenseText}`);
  }

  const response = await fetch(info.url, {
    headers: { 'user-agent': 'AirTrust-SCORM-Builder/1.0 (training package build)' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`COMMONS_ASSET_HTTP_${response.status}:${asset.id}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualSha1 = createHash('sha1').update(bytes).digest('hex');
  if (actualSha1.toLowerCase() !== String(info.sha1).toLowerCase()) {
    throw new Error(`COMMONS_ASSET_SHA1_MISMATCH:${asset.id}`);
  }
  return {
    path: asset.path,
    bytes,
    provenance: {
      id: asset.id,
      commonsTitle: asset.commonsTitle,
      commonsPageId: page.pageid ?? null,
      sourceUrl: info.descriptionurl ?? metadataUrl,
      resolvedUrl: info.url,
      sha1: actualSha1,
      license: asset.license,
      alt: asset.alt,
    },
  };
}

const assets = [];
for (const asset of source.mediaAssets) assets.push(await resolveCommonsAsset(asset));

const slides = source.slides.map((slide) => ({ ...slide }));
const requiredSlides = slides.map((slide) => slide.id);
const requiredInteractions = slides.filter((slide) => slide.kind === 'assessment').map((slide) => slide.id);
const model = {
  schema: source.schema,
  courseId: source.courseId,
  packageVersion: source.packageVersion,
  title: source.title,
  subtitle: source.subtitle,
  language: source.language,
  navigationGate: source.navigationGate,
  masteryScore: source.masteryScore,
  auditClosure: source.auditClosure,
  source: source.source,
  slides,
};

const completionManifest = {
  schemaVersion: 1,
  diagnosticsVersion: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
  scormVersion: '1.2',
  courseId: source.courseId,
  packageVersion: source.packageVersion,
  content: { requiredSlides },
  assessment: {
    requiredInteractions,
    masteryScore: source.masteryScore,
    successStatus: 'passed',
    failureStatus: 'failed',
  },
  completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1' },
  diagnostics: {
    currentSlide: true,
    slides: true,
    assessment: true,
    packageStatus: true,
    updatedAt: true,
  },
};

const indexHtml = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeXml(source.title)}</title><link rel="stylesheet" href="styles.css"></head>
<body><main id="app" class="course-shell" aria-live="polite"></main>
<script src="course-model.js"></script><script src="app.js"></script></body></html>`;

const stylesCss = `:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102033;background:#eef2f6}*{box-sizing:border-box}body{margin:0;font-size:20px;line-height:1.55}.course-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px}.card{width:min(1160px,100%);background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(15,35,55,.13)}.hero{position:relative;min-height:300px;background:#162a3d;color:#fff}.hero img{width:100%;height:360px;object-fit:cover;display:block;opacity:.68}.hero-overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:34px;background:linear-gradient(0deg,rgba(6,20,35,.88),rgba(6,20,35,.06))}.eyebrow{font-size:20px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.hero h1{font-size:42px;line-height:1.1;margin:10px 0 0}.content{padding:32px}.content p,.content li,.question,.choice,.feedback,.progress-label{font-size:20px}.content ul{padding-left:26px}.question{font-weight:700;margin:26px 0 14px}.choices{display:grid;gap:12px}.choice{width:100%;text-align:left;border:2px solid #c7d1dc;background:#fff;border-radius:14px;padding:16px 18px;cursor:pointer}.choice:hover,.choice:focus{border-color:#375f86;outline:none}.choice[disabled]{cursor:default}.choice.correct{border-color:#18864b;background:#e8f7ef}.choice.incorrect{border-color:#c73737;background:#fdecec}.feedback{margin-top:16px;border-radius:12px;padding:14px 16px;font-weight:650}.feedback.correct{background:#e8f7ef;color:#145d36}.feedback.incorrect{background:#fdecec;color:#8a2222}.footer{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:22px 32px;border-top:1px solid #dfe6ed;background:#f8fafc}.nav{display:flex;gap:12px}.btn{font-size:20px;font-weight:700;border:0;border-radius:12px;padding:13px 20px;cursor:pointer}.btn.primary{background:#163f67;color:#fff}.btn.secondary{background:#e5ebf1;color:#17324c}.btn:disabled{opacity:.42;cursor:not-allowed}.progress{flex:1;max-width:420px}.progress-track{height:10px;background:#d9e1e9;border-radius:999px;overflow:hidden}.progress-bar{height:100%;background:#356a96}.result{padding:30px;border-radius:16px;background:#f2f6fa}.result.pass{border:2px solid #18864b}.result.fail{border:2px solid #c73737}@media(max-width:720px){body,.content p,.content li,.question,.choice,.feedback,.progress-label,.btn,.eyebrow{font-size:20px}.course-shell{padding:0}.card{border-radius:0}.hero img{height:300px}.hero h1{font-size:34px}.content,.footer,.hero-overlay{padding:22px}.footer{align-items:flex-start;flex-direction:column}.progress{max-width:none;width:100%}}`;

const appJs = `(() => {
  const model = window.AIRTRUST_COURSE_MODEL;
  const app = document.getElementById('app');
  const required = model.slides.map(s => s.id);
  const assessments = model.slides.filter(s => s.kind === 'assessment');
  let api = null;
  let current = 0;
  let state = { visited: [], answers: {}, attempts: 1 };

  function findApi() {
    let w = window;
    for (let i=0;i<10;i+=1) {
      try { if (w.API) return w.API; if (!w.parent || w.parent === w) break; w = w.parent; } catch { break; }
    }
    try { if (window.opener?.API) return window.opener.API; } catch {}
    return null;
  }
  function call(name, ...args) { try { return api && typeof api[name] === 'function' ? api[name](...args) : null; } catch { return null; } }
  function diag(stage) {
    const payload = {
      stage, currentSlide: model.slides[current]?.id ?? null, slides: [...state.visited],
      assessment: { answered: Object.keys(state.answers).length, score: score() }, packageStatus: call('LMSGetValue','cmi.core.lesson_status') || null,
      updatedAt: new Date().toISOString(), lastError: call('LMSGetLastError'), errorString: call('LMSGetErrorString','0'), diagnostic: call('LMSGetDiagnostic','0')
    };
    window.parent?.postMessage({ type: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1', payload }, '*');
  }
  function init() {
    api = findApi();
    if (api) {
      call('LMSInitialize','');
      const raw = call('LMSGetValue','cmi.suspend_data');
      if (raw) { try { const saved = JSON.parse(raw); if (saved && saved.courseId === model.courseId) state = saved.state || state; } catch {} }
      const loc = call('LMSGetValue','cmi.core.lesson_location');
      const idx = model.slides.findIndex(s => s.id === loc); if (idx >= 0) current = idx;
      const status = call('LMSGetValue','cmi.core.lesson_status');
      if (!status || status === 'not attempted') call('LMSSetValue','cmi.core.lesson_status','incomplete');
    }
    markVisited(); render(); diag('initialize');
  }
  function save() {
    if (!api) return;
    call('LMSSetValue','cmi.core.lesson_location',model.slides[current].id);
    call('LMSSetValue','cmi.suspend_data',JSON.stringify({ courseId:model.courseId, packageVersion:model.packageVersion, state }));
    call('LMSCommit',''); diag('commit');
  }
  function score() {
    if (!assessments.length) return 100;
    let correct = 0;
    for (const slide of assessments) if (state.answers[slide.id] === slide.correctIndex) correct += 1;
    return Math.round((correct / assessments.length) * 100);
  }
  function allRequiredVisited() { return required.every(id => state.visited.includes(id)); }
  function allAssessmentAnswered() { return assessments.every(s => Number.isInteger(state.answers[s.id])); }
  function markVisited() { const id=model.slides[current].id; if (!state.visited.includes(id)) state.visited.push(id); save(); }
  function answer(slide, index) {
    if (Number.isInteger(state.answers[slide.id])) return;
    state.answers[slide.id] = index; save(); render();
  }
  function canAdvance(slide) {
    if (slide.kind === 'scenario') return Number.isInteger(state.answers[slide.id]);
    return true;
  }
  function finishIfReady() {
    if (!allRequiredVisited() || !allAssessmentAnswered()) return false;
    const raw = score(); call('LMSSetValue','cmi.core.score.raw',String(raw)); call('LMSSetValue','cmi.core.score.max','100'); call('LMSSetValue','cmi.core.score.min','0');
    call('LMSSetValue','cmi.core.lesson_status',raw >= model.masteryScore ? 'passed' : 'failed');
    call('LMSCommit',''); diag(raw >= model.masteryScore ? 'passed' : 'failed'); return true;
  }
  function resetCourse() {
    state = { visited: [], answers: {}, attempts: (state.attempts || 1) + 1 }; current = 0;
    call('LMSSetValue','cmi.core.lesson_status','incomplete'); call('LMSSetValue','cmi.core.score.raw',''); markVisited(); render();
  }
  function renderChoices(slide) {
    if (!Array.isArray(slide.choices)) return '';
    const selected = state.answers[slide.id];
    return '<div class="question">'+escapeHtml(slide.question || '')+'</div><div class="choices">'+slide.choices.map((choice,i)=>{
      let cls='choice'; if (Number.isInteger(selected)) cls += i===slide.correctIndex?' correct':i===selected?' incorrect':'';
      return '<button class="'+cls+'" data-choice="'+i+'" '+(Number.isInteger(selected)?'disabled':'')+'>'+escapeHtml(choice)+'</button>';
    }).join('')+'</div>'+(Number.isInteger(selected)?'<div class="feedback '+(selected===slide.correctIndex?'correct':'incorrect')+'">'+escapeHtml(selected===slide.correctIndex?slide.feedback?.correct:slide.feedback?.incorrect)+'</div>':'');
  }
  function escapeHtml(value) { const d=document.createElement('div'); d.textContent=String(value ?? ''); return d.innerHTML; }
  function render() {
    const slide=model.slides[current]; const pct=Math.round(((current+1)/model.slides.length)*100);
    const isLast=current===model.slides.length-1; const finalReady=isLast && allAssessmentAnswered(); const raw=score();
    const body=(slide.body||[]).map(p=>'<p>'+escapeHtml(p)+'</p>').join('');
    app.innerHTML='<article class="card"><header class="hero"><img src="'+escapeHtml(slide.media?.[0]?.src || '')+'" alt="'+escapeHtml(slide.media?.[0]?.alt || '')+'"><div class="hero-overlay">'+(slide.eyebrow?'<div class="eyebrow">'+escapeHtml(slide.eyebrow)+'</div>':'')+'<h1>'+escapeHtml(slide.title)+'</h1></div></header><section class="content">'+body+renderChoices(slide)+(isLast&&finalReady?'<div class="result '+(raw>=model.masteryScore?'pass':'fail')+'"><strong>Resultado: '+raw+'%</strong><p>'+(raw>=model.masteryScore?'Avaliação concluída com aproveitamento mínimo de 70%.':'A fonte controlada exige nota mínima 7,0. Refaça o treinamento e a avaliação.')+'</p>'+(raw<model.masteryScore?'<button class="btn primary" id="retry">Refazer treinamento e avaliação</button>':'')+'</div>':'')+'</section><footer class="footer"><div class="progress"><div class="progress-label">'+(current+1)+' de '+model.slides.length+'</div><div class="progress-track"><div class="progress-bar" style="width:'+pct+'%"></div></div></div><div class="nav"><button class="btn secondary" id="prev" '+(current===0?'disabled':'')+'>Voltar</button>'+(isLast?'<button class="btn primary" id="finish" '+(!finalReady?'disabled':'')+'>Concluir</button>':'<button class="btn primary" id="next" '+(!canAdvance(slide)?'disabled':'')+'>Avançar</button>')+'</div></footer></article>';
    app.querySelectorAll('[data-choice]').forEach(btn=>btn.addEventListener('click',()=>answer(slide,Number(btn.dataset.choice))));
    app.querySelector('#prev')?.addEventListener('click',()=>{current=Math.max(0,current-1);markVisited();render();});
    app.querySelector('#next')?.addEventListener('click',()=>{if(!canAdvance(slide))return;current=Math.min(model.slides.length-1,current+1);markVisited();render();});
    app.querySelector('#finish')?.addEventListener('click',()=>{ if(finishIfReady()) render(); });
    app.querySelector('#retry')?.addEventListener('click',resetCourse);
  }
  window.addEventListener('beforeunload',()=>{save();call('LMSFinish','');diag('finish');});
  init();
})();`;

const assetFiles = assets.map((asset) => asset.path);
const allFiles = [
  'index.html', 'styles.css', 'app.js', 'course-model.js', 'airtrust-completion-manifest.json', 'media-provenance.json', ...assetFiles,
];
const imsManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(source.courseId)}_${escapeXml(source.packageVersion)}" version="1.0"
 xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
 xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
 <organizations default="ORG1"><organization identifier="ORG1"><title>${escapeXml(source.title)}</title><item identifier="ITEM1" identifierref="RES1"><title>${escapeXml(source.title)}</title></item></organization></organizations>
 <resources><resource identifier="RES1" type="webcontent" adlcp:scormtype="sco" href="index.html">${allFiles.map((file)=>`<file href="${escapeXml(file)}"/>`).join('')}</resource></resources>
</manifest>`;

const provenance = {
  generatedAt: new Date().toISOString(),
  sourceDocument: source.source,
  assets: assets.map((asset) => asset.provenance),
};
const entries = {
  'imsmanifest.xml': text(imsManifest),
  'index.html': text(indexHtml),
  'styles.css': text(stylesCss),
  'app.js': text(appJs),
  'course-model.js': text(`window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`),
  'airtrust-completion-manifest.json': text(JSON.stringify(completionManifest, null, 2)),
  'media-provenance.json': text(JSON.stringify(provenance, null, 2)),
};
for (const asset of assets) entries[asset.path] = asset.bytes;

const zip = zipSync(entries, { level: 7 });
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, zip);
const sha256 = createHash('sha256').update(zip).digest('hex');
console.log(JSON.stringify({ ok: true, output: outputPath, bytes: zip.byteLength, sha256, slides: requiredSlides.length, interactions: requiredInteractions.length, masteryScore: source.masteryScore }, null, 2));
