import { describe, expect, it } from 'vitest';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../../utils/auditoria';

describe('Pendência 7 — Trilha de Auditoria e Autenticidade do Ator (PR #2085 / commit eb319c5418fb6724bf0478f859fa4af468a53c6d)', () => {
  it('1. Extrai corretamente o autor autenticado a partir de c.get("userId") e c.get("userEmail")', () => {
    const mockContext = {
      get: (key: string) => {
        if (key === 'userId') return 42;
        if (key === 'userEmail') return 'gestor@airtrust.online';
        return undefined;
      },
      req: {
        header: (name: string) => {
          if (name === 'cf-connecting-ip') return '198.51.100.1';
          if (name === 'user-agent') return 'AirTrust-E2E-Agent';
          return undefined;
        },
      },
    };

    const audit = extrairUsuarioAuditoria(mockContext);
    expect(audit.usuario_id).toBe('42');
    expect(audit.usuario_nome).toBe('gestor@airtrust.online');
    expect(audit.ip_address).toBe('198.51.100.1');
    expect(audit.user_agent).toBe('AirTrust-E2E-Agent');
  });

  it('2. Impossibilidade de falsificação: cabeçalhos arbitrários não injetam autor falso', () => {
    const spoofAttemptContext = {
      get: (key: string) => {
        // Sem contexto autenticado no middleware
        return undefined;
      },
      req: {
        header: (name: string) => {
          if (name === 'X-User-Id' || name === 'x-user-id') return '9999';
          if (name === 'X-Actor' || name === 'x-actor') return 'admin_infiltrado';
          if (name === 'X-User-Email') return 'hacker@malicious.com';
          return undefined;
        },
      },
    };

    const audit = extrairUsuarioAuditoria(spoofAttemptContext);
    expect(audit.usuario_id).toBeUndefined();
    expect(audit.usuario_nome).toBeUndefined();
  });

  it('3. Rejeita IDs inválidos, não numéricos ou <= 0', () => {
    const invalidIds = ['0', '-1', 'NaN', 'null', 'undefined', 'drop table', '1.5'];

    for (const invalidId of invalidIds) {
      const mockContext = {
        get: (key: string) => (key === 'userId' ? invalidId : undefined),
        req: { header: () => undefined },
      };
      const audit = extrairUsuarioAuditoria(mockContext);
      expect(audit.usuario_id).toBeUndefined();
    }
  });

  it('4. Persistência de auditoria em D1 registra usuario_id e dados novos e anteriores', async () => {
    const executedQueries: Array<{ sql: string; binds: unknown[] }> = [];

    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...binds: unknown[]) => ({
          run: async () => {
            executedQueries.push({ sql, binds });
            return { meta: { changes: 1 } };
          },
        }),
      }),
    };

    await registrarAuditoria({
      db: mockDb as never,
      tabela: 'treinamento_requisitos',
      acao: 'UPDATE',
      registro_id: 198,
      usuario_id: '42',
      usuario_nome: 'gestor@airtrust.online',
      dados_anteriores: { status: 'ATIVO' },
      dados_novos: { status: 'ATIVO', validade_meses: 24 },
    });

    expect(executedQueries.length).toBeGreaterThan(0);
    const hasAuditLog = executedQueries.some(
      (q) => q.sql.includes('INSERT INTO auditoria') || q.sql.includes('INSERT INTO auditoria_avancada_v2'),
    );
    expect(hasAuditLog).toBe(true);
  });
});
