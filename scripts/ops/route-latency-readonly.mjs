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

// Extrai linhas {route, value} de aggregates[] e de series[].data[] (dados reais costumam vir em series).
function rowsOf(calc) {
  const rows = [];
  const push = (item) => {
    if (!item || typeof item !== 'object') return;
    const groups = item.groups ?? item.group ?? [];
    const first = Array.isArray(groups) ? groups[0] : groups;
    const groupValue = first && typeof first === 'object' ? first.value ?? first.key : first ?? item.key;
    const inner = Array.isArray(item.aggregates) ? item.aggregates[0] : undefined;
    const value = Number(item.value ?? item.count ?? inner?.value ?? inner?.count);
    if (groupValue !== undefined && Number.isFinite(value)) rows.push({ route: normalizeRoute(groupValue), value });
  };
  for (const agg of calc.aggregates ?? []) push(agg);
  if (rows.length > 0) return rows; // aggregates e series representam os mesmos eventos: nao somar ambos
  for (const s of calc.series ?? []) for (const d of s.data ?? []) push(d);
  return rows;
}

// Associa por alias. count soma; p50 = media entre intervalos (aprox. se >1 intervalo); p95/p99 = maximo.
export function parseAggregates(result) {
  const byAlias = new Map();
  for (const calc of result?.calculations ?? []) byAlias.set(calc.alias || calc.calculation, rowsOf(calc));
  const routes = new Map();
  for (const { route, value } of byAlias.get('count') ?? []) {
    const e = routes.get(route) ?? { count: 0 };
    e.count += value;
    routes.set(route, e);
  }
  for (const [alias, rows] of byAlias) {
    if (alias === 'count') continue;
    const acc = new Map();
    for (const { route, value } of rows) {
      const a = acc.get(route) ?? { max: 0, sum: 0, n: 0 };
      a.max = Math.max(a.max, value); a.sum += value; a.n += 1;
      acc.set(route, a);
    }
    for (const [route, a] of acc) {
      const e = routes.get(route) ?? { count: 0 };
      e[alias] = alias === 'p50' ? a.sum / a.n : a.max;
      routes.set(route, e);
    }
  }
  return routes;
}

export function describeShape(result) {
  const names = (o) => (o && typeof o === 'object' ? Object.keys(o).sort().join(',') : typeof o);
  const lines = [`result keys: ${names(result)}`];
  for (const [i, calc] of (result?.calculations ?? []).entries()) {
    const series = calc.series ?? [];
    const nonEmpty = series.find((s) => (s.data ?? []).length > 0);
    lines.push(`calc[${i}] alias=${calc.alias}; aggregates=${calc.aggregates?.length ?? 'n/a'}; series=${series.length}; nonEmptyBuckets=${series.filter((s) => (s.data ?? []).length > 0).length}`);
    if (nonEmpty) lines.push(`  data[0] keys: ${names(nonEmpty.data[0])}; groups[0] keys: ${names((nonEmpty.data[0].groups ?? [])[0])}; aggregates[0] keys: ${names((nonEmpty.data[0].aggregates ?? [])[0])}`);
  }
  return lines.join('\n');
}

// Soma numerica de uma calculation (aggregates + series[].data[]); nunca expõe valores brutos.
export function totalCount(result) {
  let total = 0;
  for (const calc of result?.calculations ?? []) {
    if ((calc.alias || calc.calculation) !== 'count') continue;
    for (const agg of calc.aggregates ?? []) total += Number(agg.value ?? agg.count) || 0;
    for (const s of calc.series ?? []) for (const d of s.data ?? []) total += Number(d.count ?? d.value) || 0;
  }
  return total;
}

export function numericStats(result) {
  const s = result?.statistics ?? {};
  return Object.entries(s).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${v}`).join(' ');
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

  async function probe(label, filters, groupBys) {
    const r = await call('query', {
      queryId: `probe-${label}`, timeframe, view: 'calculations', limit: 50,
      parameters: { filters, calculations: [{ operator: 'count', alias: 'count' }], groupBys, orderBy: { value: 'count', order: 'desc' } },
    });
    log(`probe ${label}: HTTP ${r.status} ok=${r.ok} total=${r.ok ? totalCount(r.json.result) : 'n/a'} ${r.ok ? numericStats(r.json.result) : ''}`);
  }
  log(`service-like keys: ${names.filter((n) => /metadata|service|script/i.test(n)).slice(0, 25).join(',')}`);
  await probe('A-sem-filtro', [], []);
  await probe('B-servico', [svcFilter], []);
  await probe('C-servico-por-rota', [svcFilter], [{ type: 'string', value: pathKey }]);
  await probe('D-por-rota-sem-servico', [], [{ type: 'string', value: pathKey }]);

  let failures = 0;
  async function grouped(extraFilters, calculations, label, groupKey = pathKey) {
    const r = await call('query', {
      queryId: `route-${label}`, timeframe, view: 'calculations', limit: 200,
      parameters: {
        filters: [svcFilter, ...extraFilters],
        calculations,
        groupBys: [{ type: 'string', value: groupKey }],
        orderBy: { value: 'count', order: 'desc' },
      },
    });
    log(`query ${label} HTTP ${r.status}`);
    if (!r.ok) throw new Error(`QUERY_FAILED_${label}_HTTP_${r.status}`);
    return parseAggregates(r.json.result);
  }

  try {
    const counts = await grouped([], [{ operator: 'count', alias: 'count' }], 'count');
    log(`\n## Rotas por volume (${hours}h)`);
    log(renderTable(counts, ['count']));

    // Cada metrica candidata e consultada isoladamente (uma calculation por query), pois combinar
    // calculations sobre chaves ausentes zera o resultado.
    const metricKeys = names.filter((n) => /wallTime|cpuTime|duration|latency/i.test(n)).slice(0, 6);
    log(`\nmetricas candidatas: ${metricKeys.join(', ')}`);
    for (const key of metricKeys) {
      const merged = new Map();
      for (const [op, alias] of [['median', 'p50'], ['p95', 'p95'], ['p99', 'p99']]) {
        try {
          const part = await grouped([], [{ operator: op, key, keyType: 'number', alias }], `${alias}-${key.slice(-24)}`);
          for (const [route, e] of part) merged.set(route, { ...(merged.get(route) ?? { count: counts.get(route)?.count ?? 0 }), ...e, count: counts.get(route)?.count ?? e.count ?? 0 });
        } catch (error) { failures += 1; log(`FAILED ${key} ${alias}: ${String(error.message).replace(/[^A-Za-z0-9_=.-]/g, '')}`); }
      }
      log(`\n## ${key} (ms ou unidade da chave) por rota — p50 aprox. se varios buckets; p95/p99 = maximo dos buckets`);
      log(merged.size ? renderTable(merged, ['count', 'p50', 'p95', 'p99']) : '(sem linhas)');
    }

    if (outcomeKey) {
      const outcomes = await grouped([], [{ operator: 'count', alias: 'count' }], 'outcomes', outcomeKey);
      log('\n## Distribuicao de outcome (valores enumerados)');
      log(renderTable(outcomes, ['count']));
      const canceled = await grouped([{ key: outcomeKey, operation: 'eq', type: 'string', value: 'canceled' }], [{ operator: 'count', alias: 'count' }], 'canceled');
      log('\n## Desconexoes (outcome=canceled) por rota');
      log(renderTable(canceled, ['count']));
    }
  } catch (error) {
    log(`RESULT=${String(error.message).replace(/[^A-Za-z0-9_=.-]/g, '')}`);
    return 1;
  }
  if (failures > 0) { log(`RESULT=PARTIAL_FAILURES_${failures}`); return 1; }
  log('\nRESULT=OK');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(await run());
}
