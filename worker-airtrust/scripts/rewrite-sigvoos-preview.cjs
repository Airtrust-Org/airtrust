const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/services/controle-voos/sigvoos-real-preview.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "import type { Env } from '../../types';",
  "import type { Env } from '../../types';\nimport { SigvoosApiClient, resolveSigvoosEncryptionSecret, decryptSigvoosPassword, SigvoosClientError } from '../../lib/sigvoos/client';"
);

// Remove crypto methods
content = content.replace(/function decodeBase64[\s\S]*?async function decryptPassword[^\}]+\}/, '');

// Fix loadConfigFromDb
content = content.replace(/const secret = resolveEncryptionSecret\(env\);/, 'const secret = resolveSigvoosEncryptionSecret(env as any);');
content = content.replace(/password = await decryptPassword\(encrypted, secret\);/, 'password = await decryptSigvoosPassword(encrypted, secret);');

// Remove fetchJsonWithTimeout and authenticate
content = content.replace(/async function fetchJsonWithTimeout[\s\S]*?async function authenticate[^\}]+\}/, '');

// Update runSigvoosRealApiPreview and fetchRecords
content = content.replace(/async function fetchRecords[\s\S]*?export async function runSigvoosRealApiPreview[^\}]+\}/, `
async function fetchRecords(
  client: SigvoosApiClient,
  request: SigvoosRealPreviewRequest,
): Promise<SigvoosRecord[]> {
  const records: SigvoosRecord[] = [];
  for (let page = 1; page <= request.maxPages; page += 1) {
    let payload;
    try {
      payload = await client.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', {
        date_start: formatBrDate(request.from),
        date_finish: formatBrDate(request.to),
        page,
        page_size: request.pageSize,
        limit: request.pageSize,
      });
    } catch (err: unknown) {
      if (err instanceof SigvoosClientError) {
        if (err.code === 'SIGVOOS_UNAUTHORIZED') throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_TOKEN_MISSING', 502);
        if (err.code === 'SIGVOOS_TIMEOUT') throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_NETWORK_ERROR', 502);
        throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_UPSTREAM_ERROR', 502);
      }
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_NETWORK_ERROR', 502);
    }
    const pageRecords = extractRecords(payload);
    records.push(...pageRecords);
    if (pageRecords.length < request.pageSize) break;
  }
  return records;
}

export async function runSigvoosRealApiPreview(
  db: D1Database,
  empresaId: number,
  env: Env,
  request: SigvoosRealPreviewRequest,
  options: { fetchImpl?: FetchLike } = {},
) {
  const config = await loadReadOnlyConfig(db, empresaId, env);
  const client = new SigvoosApiClient({
    base_url: config.baseUrl,
    username: config.username,
    password: config.password,
    system: config.system,
  });
  
  const records = await fetchRecords(client, request);

  return {
    mode: 'real-preview' as const,
    enabled: true,
    tenantScoped: true,
    writesEnabled: false,
    realApiCalled: true,
    provider: 'SIGVOOS',
    empresaId,
    status: 'READY' as const,
    window: {
      from: request.from,
      to: request.to,
    },
    limits: {
      pageSize: request.pageSize,
      maxPages: request.maxPages,
      maxWindowDays: MAX_WINDOW_DAYS,
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
    summary: summarizeSigvoosRealPreview(records),
  };
}
`);

fs.writeFileSync(file, content);
