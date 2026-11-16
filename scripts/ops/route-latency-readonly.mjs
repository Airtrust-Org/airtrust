#!/usr/bin/env node
// Leitura somente. Workers Observability telemetry (calculations) agrupado por rota normalizada.
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const service = process.env.WORKER_SERVICE || 'airtrust-api-production';
const hours = Math.min(48, Math.max(1, Number(process.env.HOURS || 24)));
if (!token || !account) { console.log('RESULT=MISSING_CREDENTIALS'); process.exit(1); }

const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry`;
const to = Date.now();
const timeframe = { from: to - hours * 3_600_000, to };
const svcFilter = { key: '$metadata.service', operation: 'eq', type: 'string', value: service };

async function call(path, body) {
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text: text.slice(0, 300) };
}

const keys = await call('keys', { timeframe, filters: [svcFilter], limit: 2000 });
console.log(`## telemetry/keys HTTP ${keys.status}`);
if (keys.status !== 200 || !keys.json?.success) {
  console.log(`RESULT=TOKEN_PERMISSION_INSUFFICIENT_OR_API_ERROR ${keys.text.replace(/[\w-]{30,}/g, '***')}`);
  process.exit(1);
}
const names = (keys.json.result || []).map((k) => k.key || k.name || '').filter(Boolean);
const interesting = names.filter((n) => /path|wall|duration|outcome|status|method|colo/i.test(n)).slice(0, 60);
console.log('keys:', JSON.stringify(interesting));

const pick = (re) => names.find((n) => re.test(n));
const pathKey = pick(/request\.path$/) || pick(/request\.url$/) || pick(/path/i);
const wallKey = pick(/wallTime/i) || pick(/duration/i);
const outcomeKey = pick(/outcome/i);
console.log(`pathKey=${pathKey} wallKey=${wallKey} outcomeKey=${outcomeKey}`);
if (!pathKey) { console.log('RESULT=NO_PATH_KEY'); process.exit(1); }

const norm = (p) => String(p || '').split('?')[0]
  .replace(/https?:\/\/[^/]+/, '')
  .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:uuid')
  .replace(/\/\d+/g, '/:id')
  .replace(/\/[A-Za-z0-9_-]{24,}/g, '/:tok');

async function grouped(extraFilters, calcs, label) {
  const r = await call('query', {
    queryId: `route-${label}`, timeframe, view: 'calculations', limit: 200,
    parameters: {
      filters: [svcFilter, ...extraFilters],
      calculations: calcs,
      groupBys: [{ type: 'string', value: pathKey }],
      orderBy: { value: 'count', order: 'desc' },
    },
  });
  if (r.status !== 200 || !r.json?.success) { console.log(`query ${label} HTTP ${r.status} ${r.text}`); return []; }
  return r.json.result?.calculations?.[0]?.series ?? r.json.result?.calculations ?? [];
}

const calcs = [{ operator: 'count', alias: 'count' }];
if (wallKey) {
  calcs.push({ operator: 'median', key: wallKey, keyType: 'number', alias: 'p50' });
  calcs.push({ operator: 'p95', key: wallKey, keyType: 'number', alias: 'p95' });
  calcs.push({ operator: 'p99', key: wallKey, keyType: 'number', alias: 'p99' });
}
const all = await grouped([], calcs, 'all');
console.log(`\n## Rotas por volume (${hours}h) — bruto da API (primeiras 40 linhas)`);
const merged = new Map();
for (const row of all.slice ? all : []) {
  const g = row.groups ?? row.group ?? [];
  const rawPath = (Array.isArray(g) ? g[0]?.value ?? g[0] : g) ?? row.key ?? '';
  const p = norm(rawPath);
  const prev = merged.get(p) || { count: 0, rows: [] };
  prev.count += Number(row.count ?? row.value ?? 0);
  prev.rows.push(row);
  merged.set(p, prev);
}
console.log(JSON.stringify([...merged.entries()].slice(0, 5).map(([k, v]) => [k, v.rows[0]])).slice(0, 1500));
console.log('\n| rota | n |');
console.log('|---|---:|');
for (const [p, v] of [...merged.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 40)) console.log(`| ${p} | ${v.count} |`);

if (outcomeKey) {
  const canceled = await grouped([{ key: outcomeKey, operation: 'eq', type: 'string', value: 'canceled' }], [{ operator: 'count', alias: 'count' }], 'canceled');
  console.log('\n## Desconexoes (outcome=canceled) por rota');
  console.log(JSON.stringify(canceled).slice(0, 2500));
}
console.log('\nRESULT=OK');
