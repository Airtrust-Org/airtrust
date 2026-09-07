import { describe, expect, it } from 'vitest';
import type { Env } from '../../types';
import validacaoCertificadosRoutes from '../../routes/certificados/validacao';
import { generateCertificateValidationHash } from '../../utils/certificate-validation-hash';

function makeEnv(rows: Array<Record<string, unknown>>, hasColumn = true) {
  const bucket = {
    head: async (key: string) => (key ? { key } : null),
  };
  const db = {
    prepare(sql: string) {
      const run = async (args: unknown[] = []) => {
        if (sql.includes('PRAGMA table_info')) {
          return { results: hasColumn ? [{ name: 'validacao_hash' }] : [] };
        }
        if (sql.includes('validacao_hash = ?')) {
          const hash = String(args[0]);
          return { results: rows.filter((row) => row.validacao_hash === hash) };
        }
        if (sql.includes('FROM qualificacoes_historico qh')) {
          const fallbackRows = hasColumn && sql.includes('validacao_hash IS NULL')
            ? rows.filter((row) => row.validacao_hash == null || String(row.validacao_hash).trim() === '')
            : rows;
          return { results: fallbackRows };
        }
        return { results: [] };
      };
      return {
        all: () => run(),
        bind(...args: unknown[]) {
          return { all: () => run(args) };
        },
      };
    },
  };
  return { DB: db, BUCKET: bucket, ENVIRONMENT: 'test' } as unknown as Env;
}

async function makeCertificateRow(validacaoHash?: string | null) {
  const hash = await generateCertificateValidationHash({
    funcionarioCpf: '123.456.789-01',
    qualificacaoCodigo: 'EAD-CRM',
    dataConclusao: '2026-08-25',
    numeroCertificado: 'CERT-001',
  });
  return {
    hash,
    row: {
      id: 11,
      r2_key: 'cert/CERT-001.pdf',
      created_at: '2026-08-25T12:00:00Z',
      numero_certificado: 'CERT-001',
      data_conclusao: '2026-08-25',
      data_vencimento: '2027-08-25',
      validade_meses: 12,
      carga_horaria: 8,
      instrutor: 'Instrutor',
      tipo_treinamento: 'INICIAL',
      funcionario_nome: 'Tripulante Fictício',
      funcionario_cpf: '123.456.789-01',
      codigo_anac: 'ANAC000',
      qualificacao_nome: 'CRM',
      qualificacao_codigo: 'EAD-CRM',
      qualificacao_categoria: 'EAD',
      qualificacao_carga_padrao: 8,
      qualificacao_carga_inicial: 8,
      qualificacao_carga_recorrente: 8,
      qualificacao_validade: 12,
      vencimento_fim_mes: 0,
      empresa_nome: 'Empresa Fictícia',
      validacao_hash: validacaoHash === undefined ? hash : validacaoHash,
    },
  };
}

describe('indexed public certificate validation', () => {
  it('returns the historical token via indexed lookup', async () => {
    const { hash, row } = await makeCertificateRow();
    const env = makeEnv([row]);

    const response = await validacaoCertificadosRoutes.request(`/${hash}`, {}, env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      valido: boolean;
      certificado: { hash: string; funcionario_cpf: string };
    };
    expect(payload.success).toBe(true);
    expect(payload.valido).toBe(true);
    expect(payload.certificado.hash).toBe(hash);
    expect(payload.certificado.funcionario_cpf).toBe('***.***.***-01');
  });

  it('rejects ambiguous indexed collisions without accepting either row', async () => {
    const { hash, row } = await makeCertificateRow();
    const env = makeEnv([
      row,
      { ...row, id: 12, r2_key: 'cert/CERT-002.pdf' },
    ]);
    const response = await validacaoCertificadosRoutes.request(`/${hash}`, {}, env);
    expect(response.status).toBe(409);
  });

  it('preserves legacy validation when migration 0470 is not applied yet', async () => {
    const { hash, row } = await makeCertificateRow(null);
    const env = makeEnv([row], false);

    const response = await validacaoCertificadosRoutes.request(`/${hash}`, {}, env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean; valido: boolean };
    expect(payload.success).toBe(true);
    expect(payload.valido).toBe(true);
  });

  it('preserves legacy validation while historical 0470 backfill is incomplete', async () => {
    const { hash, row } = await makeCertificateRow(null);
    const env = makeEnv([row], true);

    const response = await validacaoCertificadosRoutes.request(`/${hash}`, {}, env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean; valido: boolean };
    expect(payload.success).toBe(true);
    expect(payload.valido).toBe(true);
  });

  it('does not re-scan already indexed certificates after an indexed miss', async () => {
    const { row } = await makeCertificateRow();
    const env = makeEnv([row], true);

    const response = await validacaoCertificadosRoutes.request('/0123456789ABCDEF', {}, env);
    expect(response.status).toBe(404);
  });

  it('returns 404 when neither indexed nor transitional lookup finds the hash', async () => {
    const env = makeEnv([], false);
    const response = await validacaoCertificadosRoutes.request('/0123456789ABCDEF', {}, env);
    expect(response.status).toBe(404);
  });
});
