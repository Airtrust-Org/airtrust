/**
 * GUARDRAIL (P01-08): IP de cliente em trilhas de auditoria.
 *
 * Em Cloudflare Workers o unico identificador de rede confiavel e
 * `CF-Connecting-IP`. `X-Forwarded-For` e `X-Real-IP` sao enviados pelo
 * cliente e podem ser forjados, entao nao podem ser lidos como fallback para
 * registros de auditoria, logs de aceite ou rate limit.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(__dirname, '../..');

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      listSourceFiles(full, acc);
    } else if (/\.(ts|mjs)$/.test(entry) && !/\.test\./.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('P01-08 - IP de cliente nao confia em cabecalhos forjaveis', () => {
  it('nenhum codigo de producao le X-Forwarded-For ou X-Real-IP como cabecalho de requisicao', () => {
    const offenders: string[] = [];
    const headerRead = /\.header\(\s*['"`](x-forwarded-for|x-real-ip)['"`]\s*\)/i;
    for (const file of listSourceFiles(SRC_DIR)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, idx) => {
        if (headerRead.test(line)) {
          offenders.push(`${path.relative(SRC_DIR, file)}:${idx + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('o contexto de auditoria usa somente CF-Connecting-IP', async () => {
    const { getAuditContextSnapshot } = await import('../../lib/audit/context');
    const headers: Record<string, string> = { 'x-forwarded-for': '198.51.100.77' };
    const forged = getAuditContextSnapshot({
      get: () => undefined,
      req: { header: (name: string) => headers[name.toLowerCase()] },
    } as never);
    expect(forged.ipAddress).toBeNull();

    headers['cf-connecting-ip'] = '203.0.113.9';
    const trusted = getAuditContextSnapshot({
      get: () => undefined,
      req: { header: (name: string) => headers[name.toLowerCase()] },
    } as never);
    expect(trusted.ipAddress).toBe('203.0.113.9');
  });
});
