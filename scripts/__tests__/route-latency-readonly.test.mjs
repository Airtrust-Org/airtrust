import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRoute, parseAggregates, run } from '../ops/route-latency-readonly.mjs';

const keysBody = { success: true, result: [{ key: '$workers.event.request.path' }, { key: '$workers.wallTimeMs' }, { key: '$workers.outcome' }] };
const queryBody = (secret = '') => ({
  success: true,
  result: {
    calculations: [
      { alias: 'count', aggregates: [{ value: 7, groups: [{ key: 'p', value: `/api/x/123?secret=${secret}` }] }], series: [{ time: 'a', data: [] }] },
      { alias: 'p50', aggregates: [{ value: 410, groups: [{ key: 'p', value: `/api/x/123?secret=${secret}` }] }] },
      { alias: 'p99', aggregates: [{ value: 9100, groups: [{ key: 'p', value: `/api/x/123?secret=${secret}` }] }] },
    ],
  },
});
const mkFetch = (queryStatus, secret) => async (url) => {
  const isKeys = String(url).endsWith('/keys');
  const body = isKeys ? keysBody : queryBody(secret);
  return new Response(JSON.stringify(body), { status: isKeys ? 200 : queryStatus });
};
const env = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a', HOURS: '1' };

test('normalizeRoute remove query string e ids', () => {
  assert.equal(normalizeRoute('https://api.airtrust.online/api/x/123?secret=private-test'), '/api/x/:id');
});

test('parseAggregates preserva contagem e percentis por rota', () => {
  const routes = parseAggregates(queryBody().result);
  assert.deepEqual(routes.get('/api/x/:id'), { count: 7, p50: 410, p99: 9100 });
});

test('saida nunca contem valores brutos (secret na query)', async () => {
  const lines = [];
  const code = await run({ env, fetchImpl: mkFetch(200, 'private-test'), log: (l) => lines.push(l) });
  const out = lines.join('\n');
  assert.equal(code, 0);
  assert.ok(!out.includes('private-test'));
  assert.match(out, /\| \/api\/x\/:id \| 7 \| 410 \|/);
});

test('falha de query apos keys ok retorna exit != 0', async () => {
  const lines = [];
  const code = await run({ env, fetchImpl: mkFetch(403, ''), log: (l) => lines.push(l) });
  assert.equal(code, 1);
  assert.ok(!lines.join('\n').includes('RESULT=OK'));
});

test('parseAggregates le dados em series[].data (formato real)', () => {
  const g = [{ key: 'p', value: '/api/y/9?secret=private-test' }];
  const result = { calculations: [
    { alias: 'count', aggregates: [], series: [{ time: 't', data: [{ groups: g, value: 5 }] }] },
    { alias: 'p50', aggregates: [], series: [{ time: 't', data: [{ groups: g, aggregates: [{ value: 300 }] }] }] },
  ] };
  assert.deepEqual(parseAggregates(result).get('/api/y/:id'), { count: 5, p50: 300 });
});
