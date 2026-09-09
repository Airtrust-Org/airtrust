import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ensureCertificateForQualification } from '../../services/ensure-certificate';
import type { Env } from '../../types';

const generateCertificateForHistoricoMock = vi.fn();

vi.mock('../../services/generate-certificate', () => ({
  generateCertificateForHistorico: (...args: any[]) => generateCertificateForHistoricoMock(...args),
  CertificateGenerationError: class CertificateGenerationError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
}));

function createDb(historicoMock: any, docExisteMock: any = null, temTemplateMock: any = { 1: 1 }) {
  return {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (sql.includes('SELECT qh.id, qh.certificado_arquivo_id, qh.data_conclusao, qh.status')) {
            if (historicoMock && statement.params[1] === historicoMock.empresa_id) {
              return historicoMock as T;
            }
            return null as T;
          }
          if (sql.includes('SELECT id FROM documentos')) {
            return docExisteMock as T;
          }
          if (sql.includes('SELECT 1 FROM empresas_config')) {
            return temTemplateMock as T;
          }
          if (sql.includes('SELECT 1 FROM certificados_templates')) {
            return temTemplateMock as T;
          }
          return null as T;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

const mockEnv = {
  CF_ACCOUNT_ID: 'fake-account-id',
  CF_BROWSER_API_TOKEN: 'fake-browser-token',
};

describe('ensureCertificateForQualification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite certificado para estado concluído válido (CONCLUIDA)', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: null,
      data_conclusao: '2026-09-09',
      status: 'CONCLUIDA',
      empresa_id: 10
    });
    
    generateCertificateForHistoricoMock.mockResolvedValueOnce({ documentoId: 999 });

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10
    );

    expect(result.state).toBe('CREATED');
    expect(result.documentoId).toBe(999);
    expect(generateCertificateForHistoricoMock).toHaveBeenCalledTimes(1);
  });

  it('permite certificado para estado concluído válido legado (CONCLUIDO)', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: null,
      data_conclusao: '2026-09-09',
      status: 'CONCLUIDO',
      empresa_id: 10
    });
    
    generateCertificateForHistoricoMock.mockResolvedValueOnce({ documentoId: 999 });

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10
    );

    expect(result.state).toBe('CREATED');
    expect(result.documentoId).toBe(999);
  });

  it('bloqueia certificado para estado não concluído (PLANEJADA)', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: null,
      data_conclusao: '2026-09-09',
      status: 'PLANEJADA',
      empresa_id: 10
    });

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10
    );

    expect(result.state).toBe('SKIPPED');
    expect(result.reason).toContain('não possui um status de conclusão válido');
    expect(generateCertificateForHistoricoMock).not.toHaveBeenCalled();
  });

  it('bloqueia certificado para estado cancelado (CANCELADA)', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: null,
      data_conclusao: '2026-09-09',
      status: 'CANCELADA',
      empresa_id: 10
    });

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10
    );

    expect(result.state).toBe('SKIPPED');
    expect(result.reason).toContain('não possui um status de conclusão válido');
  });

  it('bloqueia certificado para estado desconhecido (fail closed)', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: null,
      data_conclusao: '2026-09-09',
      status: 'DESCONHECIDO_123',
      empresa_id: 10
    });

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10
    );

    expect(result.state).toBe('SKIPPED');
    expect(result.reason).toContain('não possui um status de conclusão válido');
  });

  it('bloqueia certificado para ausência de status (null) (fail closed)', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: null,
      data_conclusao: '2026-09-09',
      status: null,
      empresa_id: 10
    });

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10
    );

    expect(result.state).toBe('SKIPPED');
    expect(result.reason).toContain('não possui um status de conclusão válido');
  });

  it('comportamento idempotente: retorna EXISTS se já tem certificado e não é forceRegenerate', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: 555,
      data_conclusao: '2026-09-09',
      status: 'CONCLUIDA',
      empresa_id: 10
    }, { id: 555 }); // doc existe

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10
    );

    expect(result.state).toBe('EXISTS');
    expect(result.documentoId).toBe(555);
    expect(generateCertificateForHistoricoMock).not.toHaveBeenCalled();
  });

  it('isolamento de tenant: não encontra o histórico se empresaId não bater', async () => {
    const db = createDb({
      id: 1,
      certificado_arquivo_id: null,
      data_conclusao: '2026-09-09',
      status: 'CONCLUIDA',
      empresa_id: 99 // tenant diferente
    });

    const result = await ensureCertificateForQualification(
      { ...mockEnv, DB: db } as unknown as Env,
      1,
      10 // empresa req
    );

    expect(result.state).toBe('SKIPPED');
    expect(result.reason).toContain('não encontrado para empresa 10');
    expect(generateCertificateForHistoricoMock).not.toHaveBeenCalled();
  });
});

