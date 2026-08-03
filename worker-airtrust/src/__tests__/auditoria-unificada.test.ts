import { beforeEach, describe, expect, it, vi } from 'vitest';

const { publishDomainEventMock } = vi.hoisted(() => ({
  publishDomainEventMock: vi.fn(),
}));

vi.mock('../shared/domainEvents', () => ({
  publishDomainEvent: publishDomainEventMock,
}));

import { registrarAuditoria } from '../utils/auditoria';

function createDb() {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          calls.push({ sql, bindings });
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, calls };
}

beforeEach(() => {
  publishDomainEventMock.mockReset();
  publishDomainEventMock.mockResolvedValue(undefined);
});

describe('registrarAuditoria unified trail', () => {
  it('preserva o log legado e grava a mesma mutação na fonte central', async () => {
    const { db, calls } = createDb();

    await registrarAuditoria({
      db,
      tabela: 'admin_usuarios',
      acao: 'DELETE',
      registro_id: 'user-7',
      usuario_id: '42',
      dados_anteriores: { role: 'manager' },
    });

    expect(calls).toHaveLength(2);
    expect(calls.some((call) => call.sql.includes('INSERT INTO auditoria ('))).toBe(true);
    expect(calls.some((call) => call.sql.includes('INSERT INTO auditoria_avancada_v2'))).toBe(true);
    expect(publishDomainEventMock).not.toHaveBeenCalled();
  });

  it('emite FUNCIONARIO_CRIADO após a criação auditada', async () => {
    const { db } = createDb();

    await registrarAuditoria({
      db,
      tabela: 'funcionarios',
      acao: 'INSERT',
      registro_id: 99,
      usuario_id: '42',
      dados_novos: { id: 99, empresa_id: 6, status: 'ATIVO', ativo: 1 },
    });

    expect(publishDomainEventMock).toHaveBeenCalledWith(
      db,
      'funcionarios',
      'FUNCIONARIO_CRIADO',
      expect.objectContaining({
        empresa_id: 6,
        funcionario_id: '99',
        origem_usuario_id: '42',
      }),
    );
  });

  it('distingue reativação de atualização comum', async () => {
    const first = createDb();
    await registrarAuditoria({
      db: first.db,
      tabela: 'funcionarios',
      acao: 'UPDATE',
      registro_id: 99,
      dados_anteriores: { id: 99, empresa_id: 6, status: 'INATIVO', ativo: 0 },
      dados_novos: { id: 99, empresa_id: 6, status: 'ATIVO', ativo: 1 },
    });

    const second = createDb();
    await registrarAuditoria({
      db: second.db,
      tabela: 'funcionarios',
      acao: 'UPDATE',
      registro_id: 99,
      dados_anteriores: { id: 99, empresa_id: 6, status: 'ATIVO', ativo: 1 },
      dados_novos: { id: 99, empresa_id: 6, status: 'ATIVO', ativo: 1, cargo: 'PIC' },
    });

    expect(publishDomainEventMock.mock.calls[0][2]).toBe('FUNCIONARIO_REATIVADO');
    expect(publishDomainEventMock.mock.calls[1][2]).toBe('FUNCIONARIO_ATUALIZADO');
  });
});
