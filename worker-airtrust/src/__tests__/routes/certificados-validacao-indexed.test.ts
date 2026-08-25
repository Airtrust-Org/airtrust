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
  return { DB: db, BUCKET: bucket } as unknown as Env;
}

describe('indexed public certificate validation', () => {
  it('returns the historical token via indexed lookup without scanning', async () => {
    const hash = await generateCertificateValidationHash({
      funcionarioCpf: '123.456.789-01',
      qualificacaoCodigo: 'EAD-CRM',
      dataConclusao: '2026-08-25',
      numeroCertificado: 'CERT-001',
    });
    const env = makeEnv([
      {
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
        validacao_hash: hash,
      },
    ]);

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

  it('rejects ambiguous indexed collisions without scanning', async () => {
    const hash = await generateCertificateValidationHash({
      funcionarioCpf: '123.456.789-01',
      qualificacaoCodigo: 'EAD-CRM',
      dataConclusao: '2026-08-25',
      numeroCertificado: 'CERT-001',
    });
    const env = makeEnv([
      { validacao_hash: hash, id: 1, r2_key: 'a.pdf', funcionario_cpf: '123.456.789-01', qualificacao_codigo: 'EAD-CRM', data_conclusao: '2026-08-25', numero_certificado: 'CERT-001' },
      { validacao_hash: hash, id: 2, r2_key: 'b.pdf', funcionario_cpf: '123.456.789-01', qualificacao_codigo: 'EAD-CRM', data_conclusao: '2026-08-25', numero_certificado: 'CERT-001' },
    ]);
    const response = await validacaoCertificadosRoutes.request(`/${hash}`, {}, env);
    expect(response.status).toBe(409);
  });

  it('does not scan when the index column is missing', async () => {
    const env = makeEnv([], false);
    const response = await validacaoCertificadosRoutes.request('/0123456789ABCDEF', {}, env);
    expect(response.status).toBe(503);
  });
});
