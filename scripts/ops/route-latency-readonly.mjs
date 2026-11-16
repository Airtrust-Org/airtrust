#!/usr/bin/env node
// Leitura somente. Workers Observability telemetry (calculations) agrupado por rota normalizada.
// Saida: apenas rota normalizada + numeros. Nunca serializa linhas/valores brutos da API.
import { pathToFileURL } from 'node:url';

export function normalizeRoute(raw) {
  return String(raw ?? '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[A-Za-z0-9_-]{24,}/g, '/:tok')
    .slice(0, 120) || '(vazio)';
}

// Le result.calculations[i].aggregates[]: {value, groups:[{key,value}]}; associa por alias.
export function parseAggregates(result) {
  const routes = new Map();
  for (const calc of result?.calculations ?? []) {
    const alias = calc.alias || calc.calculation;
    for (const agg of calc.aggregates ?? []) {
      const groupValue = (agg.groups ?? [])[0]?.value;
      const route = normalizeRoute(groupValue);
      const entry = routes.get(route) ?? {};
      const num = Number(agg.value ?? agg.count);
      entry[alias] = (entry[alias] ?? 0) + (alias === 'count' ? (Number.isFinite(num) ? num : 0) : 0);
      if (alias !== 'count') entry[alias] = Number.isFinite(num) ? Math.max(entry[alias] ?? 0, num) : entry[alias];
      routes.set(route, entry);
    }
  }
  return routes;
}

export function renderTable(routes, columns, limit = 40) {
  const rows = [...routes.entries()].sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0)).slice(0, limit);
  const fmt = (v) => (v === undefined ? '' : String(Math.round(v)));
  const out = [`| rota | ${columns.join(' | ')} |`, `|---|${columns.map(() => '---:').join('|')}|`];
  for (const [route, e] of rows) out.push(`| ${route} | ${columns.map((c) => fmt(e[c])).join(' | ')} |`);
  return out.join('\n');
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const service = env.WORKER_SERVICE || 'airtrust-api-production';
  const hours = Math.min(48, Math.max(1, Number(env.HOURS || 24)));
  if (!token || !account) { log('RESULT=MISSING_CREDENTIALS'); return 1; }

  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry`;
  const to = Date.now();
  const timeframe = { from: to - hours * 3_600_000, to };
  const svcFilter = { key: '$metadata.service', operation: 'eq', type: 'string', value: service };

  async function call(path, body) {
    const res = await fetchImpl(`${base}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* ignore */ }
    return { ok: res.status === 200 && json?.success === true, status: res.status, json };
  }

  const keys = await call('keys', { timeframe, filters: [svcFilter], limit: 2000 });
  log(`telemetry/keys HTTP ${keys.status}`);
  if (!keys.ok) { log('RESULT=TOKEN_PERMISSION_INSUFFICIENT_OR_API_ERROR'); return 1; }
  const names = (keys.json.result || []).map((k) => k.key || k.name || '').filter(Boolean);
  const pick = (re) => names.find((n) => re.test(n));
  const pathKey = pick(/request\.path$/) || pick(/request\.url$/) || pick(/path/i);
  const wallKey = pick(/wallTime/i) || pick(/duration/i);
  const outcomeKey = pick(/outcome/i);
  log(`pathKey=${pathKey ?? 'NONE'} wallKey=${wallKey ?? 'NONE'} outcomeKey=${outcomeKey ?? 'NONE'}`);
  if (!pathKey) { log('RESULT=NO_PATH_KEY'); return 1; }

  async function grouped(extraFilters, calculations, label) {
    const r = await call('query', {
      queryId: `route-${label}`, timeframe, view: 'calculations', limit: 200,
      parameters: {
        filters: [svcFilter, ...extraFilters],
        calculations,
        groupBys: [{ type: 'string', value: pathKey }],
        orderBy: { value: 'count', order: 'desc' },
      },
    });
    log(`query ${label} HTTP ${r.status}`);
    if (!r.ok) throw new Error(`QUERY_FAILED_${label}_HTTP_${r.status}`);
    return parseAggregates(r.json.result);
  }

  try {
    const calcs = [{ operator: 'count', alias: 'count' }];
    if (wallKey) {
      calcs.push({ operator: 'median', key: wallKey, keyType: 'number', alias: 'p50' });
      calcs.push({ operator: 'p95', key: wallKey, keyType: 'number', alias: 'p95' });
      calcs.push({ operator: 'p99', key: wallKey, keyType: 'number', alias: 'p99' });
    }
    const all = await grouped([], calcs, 'all');
    log(`\n## Rotas por volume (${hours}h)`);
    log(renderTable(all, wallKey ? ['count', 'p50', 'p95', 'p99'] : ['count']));
    if (outcomeKey) {
      const canceled = await grouped([{ key: outcomeKey, operation: 'eq', type: 'string', value: 'canceled' }], [{ operator: 'count', alias: 'count' }], 'canceled');
      log('\n## Desconexoes (outcome=canceled) por rota');
      log(renderTable(canceled, ['count']));
    }
  } catch (error) {
    log(`RESULT=${String(error.message).replace(/[^A-Za-z0-9_=.-]/g, '')}`);
    return 1;
  }
  log('\nRESULT=OK');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(await run());
}
