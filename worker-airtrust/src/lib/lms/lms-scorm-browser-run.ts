import puppeteer, { type Browser, type BrowserWorker, type HTTPRequest } from '@cloudflare/puppeteer';

import type { ScormRuntimeConformance } from './lms-scorm-quality-gate';

const RUNNER_VERSION = 'AIRTRUST_SCORM_BROWSER_RUN_V1';
const TIMEOUT_MS = 30_000;
const CANDIDATE_ORIGIN = 'https://scorm-candidate.invalid/';

type CandidateAsset = { path: string; data: Uint8Array };
type TraceItem = { method: string; key?: string; value?: string };
type ObservedTrace = { trace: TraceItem[]; values: Record<string, string>; initialized: boolean; finished: boolean; lastError: string };

function escapeScript(value: string) {
  return value.replace(/<\/script/gi, '<\\/script');
}

function instrumentation() {
  return `<script>(function(){
var trace=[], values={}, finished=false, initialized=false, lastError='0';
function add(method,key,value){ trace.push({method:method,key:key,value:value}); }
function fail(code){lastError=code; return 'false';}
window.API=Object.freeze({
 LMSInitialize:function(){add('LMSInitialize'); if(initialized||finished)return fail('101'); initialized=true; return 'true';},
 LMSGetValue:function(key){add('LMSGetValue',String(key)); return values[String(key)]||'';},
 LMSSetValue:function(key,value){add('LMSSetValue',String(key),String(value)); if(!initialized||finished)return fail('301'); values[String(key)]=String(value); return 'true';},
 LMSCommit:function(){add('LMSCommit'); if(!initialized||finished)return fail('301'); return 'true';},
 LMSFinish:function(){add('LMSFinish'); if(!initialized||finished)return fail('301'); finished=true; return 'true';},
 LMSGetLastError:function(){add('LMSGetLastError'); return lastError;},
 LMSGetErrorString:function(code){add('LMSGetErrorString',String(code)); return String(code)==='0'?'No error':'SCORM error';},
 LMSGetDiagnostic:function(code){add('LMSGetDiagnostic',String(code)); return String(code||lastError);}
});
Object.defineProperty(window,'__AIRTRUST_SCORM_TRACE',{value:function(){return {trace:trace,values:values,initialized:initialized,finished:finished,lastError:lastError};},configurable:false});
})();</script>`;
}

function injectBeforePackageScripts(launchHtml: string) {
  const tag = instrumentation();
  if (/<head\b[^>]*>/i.test(launchHtml)) return launchHtml.replace(/<head\b[^>]*>/i, (head) => `${head}${tag}`);
  return `${tag}${launchHtml}`;
}

function analyzeTrace(candidateSha256: string, startedAt: string, trace: TraceItem[], values: Record<string, string>, initialized: boolean, finished: boolean, lastError: string): ScormRuntimeConformance {
  const hasCommit = trace.some((item) => item.method === 'LMSCommit');
  const callsAfterFinish = trace.findIndex((item) => item.method === 'LMSFinish') >= 0 && trace.slice(trace.findIndex((item) => item.method === 'LMSFinish') + 1).some((item) => ['LMSSetValue', 'LMSCommit', 'LMSFinish'].includes(item.method));
  const errors: string[] = [];
  if (!initialized) errors.push('LMSInitialize não observado');
  if (!hasCommit) errors.push('LMSCommit não observado');
  if (!finished) errors.push('LMSFinish não observado');
  if (callsAfterFinish) errors.push('Chamada SCORM após LMSFinish');
  if (lastError !== '0') errors.push(`API SCORM retornou erro ${lastError}`);
  const lessonStatus = values['cmi.core.lesson_status'] ?? null;
  return {
    status: errors.length ? 'FAIL' : 'PASS', candidateSha256, startedAt, finishedAt: new Date().toISOString(),
    initializeObserved: initialized, commitObserved: hasCommit, finishObserved: finished,
    completionReached: lessonStatus === 'completed' || lessonStatus === 'passed', lessonStatus,
    scoreRaw: values['cmi.core.score.raw'] ?? null, masteryScore: values['cmi.student_data.mastery_score'] ?? null,
    lessonLocation: values['cmi.core.lesson_location'] ?? null, trace, errors, runnerVersion: RUNNER_VERSION,
  };
}

export async function runScormBrowserConformance(params: {
  browserBinding: unknown; candidateSha256: string; launchFile: string; assets: CandidateAsset[];
}): Promise<ScormRuntimeConformance> {
  const startedAt = new Date().toISOString();
  if (!params.browserBinding) return { status: 'ERROR', candidateSha256: params.candidateSha256, startedAt, finishedAt: new Date().toISOString(), initializeObserved: false, commitObserved: false, finishObserved: false, completionReached: false, lessonStatus: null, scoreRaw: null, masteryScore: null, lessonLocation: null, trace: [], errors: ['SCORM_BROWSER não configurado'], runnerVersion: RUNNER_VERSION };
  const assets = new Map(params.assets.map((asset) => [asset.path, asset.data]));
  const launch = assets.get(params.launchFile);
  if (!launch) throw new Error('Launch file do candidato não encontrado');
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch(params.browserBinding as BrowserWorker);
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', async (request: HTTPRequest) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(CANDIDATE_ORIGIN).origin) return request.abort('blockedbyclient');
      const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const asset = assets.get(path);
      if (!asset) return request.respond({ status: 404, body: 'not found' });
      return request.respond({ status: 200, body: asset, headers: { 'Content-Type': path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : 'application/octet-stream' } });
    });
    await page.setContent(`<base href="${CANDIDATE_ORIGIN}">${injectBeforePackageScripts(new TextDecoder().decode(launch))}`, { waitUntil: 'networkidle0', timeout: TIMEOUT_MS });
    const observed = await page.evaluate('window.__AIRTRUST_SCORM_TRACE()') as ObservedTrace;
    return analyzeTrace(params.candidateSha256, startedAt, observed.trace, observed.values, observed.initialized, observed.finished, observed.lastError);
  } catch (error) {
    const timedOut = error instanceof Error && /timeout/i.test(error.message);
    return { status: timedOut ? 'TIMEOUT' : 'ERROR', candidateSha256: params.candidateSha256, startedAt, finishedAt: new Date().toISOString(), initializeObserved: false, commitObserved: false, finishObserved: false, completionReached: false, lessonStatus: null, scoreRaw: null, masteryScore: null, lessonLocation: null, trace: [], errors: [error instanceof Error ? error.message : 'Browser Run falhou'], runnerVersion: RUNNER_VERSION };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export { analyzeTrace };
