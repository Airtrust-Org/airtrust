import { describe, expect, it } from 'vitest';
import '../shared/handlers/simuladoresHandlers';
import '../shared/handlers/frmsHandlers';
import '../shared/handlers/escalasHandlers';
import '../shared/handlers/hospedagemHandlers';
import '../shared/handlers/qualificacoesHandlers';
import { processarEventosParaModulo } from '../shared/eventProcessor';

/**
 * Minimal in-memory D1 fake that supports exactly the SQL shapes used by the
 * domain-event handlers under test. It tracks whether any UPDATE/INSERT
 * actually mutated a row, and lets each test seed a "world" of tenant-owned
 * entities so we can assert cross-tenant writes are rejected.
 */
class FakeDb {
  events: Array<{
    id: string;
    empresa_id: number;
    modulo: string;
    tipo: string;
    payload: string;
    consumidores: string;
    processado_por: string;
    processado: number;
  }> = [];

  // tenant-owned entities: id -> empresa_id
  funcionarios = new Map<string, number>();
  escalasMensais = new Map<string, number>(); // escala_id -> empresa_id
  escalaTripulacoes = new Map<string, { escala_id: string; observacoes: string }>();
  frmsCargaTrabalho: Array<{
    id: string;
    empresa_id: number;
    escala_tripulacao_id: string | null;
    deleted_at: string | null;
  }> = [];
  simuladorAgendamentos: Array<{
    id: number;
    funcionario_id: number;
    status: string;
    deleted_at: string | null;
  }> = [];
  sessoesParticipantes: Array<{ sessao_id: number; funcionario_id: number; deleted_at: null }> = [];
  hospedagens: Array<{ id: number; funcionario_id: number; status: string; deleted_at: null }> = [];
  qualificacoesPendencias: Array<{ funcionario_id: string; empresa_id: number }> = [];
  frmsCargaTrabalhoInserts: Array<{ funcionario_id: string; empresa_id: number }> = [];
  hospedagemSugestoes: Array<{ funcionario_id: string; empresa_id: number }> = [];

  writes = 0;

  prepare(sql: string) {
    const self = this;
    return {
      bind(...bindings: unknown[]) {
        return {
          async run() {
            return self.exec(sql, bindings);
          },
          async first<T>() {
            return self.execFirst<T>(sql, bindings);
          },
          async all<T>() {
            return self.execAll<T>(sql, bindings);
          },
        };
      },
    };
  }

  private exec(sql: string, b: unknown[]): { meta: { changes: number } } {
    if (sql.includes('UPDATE domain_events') && sql.includes('SET processado_por = ?,')) {
      const [processadoPor, processado, , ultimoErro, id, expectedPrev] = b as [
        string,
        number,
        number,
        string | null,
        string,
        string,
      ];
      const ev = this.events.find((e) => e.id === id);
      if (!ev || ev.processado_por !== expectedPrev) return { meta: { changes: 0 } };
      ev.processado_por = processadoPor;
      ev.processado = processado;
      void ultimoErro;
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE simulador_agendamentos')) {
      const [funcionarioId1, funcionarioId2, empresaId] = b as [number, number, number];
      const owns = this.funcionarios.get(String(funcionarioId2)) === empresaId;
      let changes = 0;
      if (owns) {
        const sessaoIds = this.sessoesParticipantes
          .filter((s) => s.funcionario_id === funcionarioId1 && !s.deleted_at)
          .map((s) => s.sessao_id);
        for (const ag of this.simuladorAgendamentos) {
          if (
            sessaoIds.includes(ag.id) &&
            ['PENDENTE', 'AGENDADO'].includes(ag.status.toUpperCase()) &&
            !ag.deleted_at &&
            ag.funcionario_id === funcionarioId1
          ) {
            ag.status = 'CANCELADO';
            changes++;
          }
        }
      }
      this.writes += changes;
      return { meta: { changes } };
    }
    if (sql.includes('UPDATE frms_carga_trabalho')) {
      const [tripulacaoId, empresaId] = b as [string, number];
      let changes = 0;
      for (const row of this.frmsCargaTrabalho) {
        if (
          row.escala_tripulacao_id === tripulacaoId &&
          row.empresa_id === empresaId &&
          !row.deleted_at
        ) {
          row.deleted_at = 'now';
          changes++;
        }
      }
      this.writes += changes;
      return { meta: { changes } };
    }
    if (sql.includes('UPDATE escala_tripulacoes')) {
      const isReserva = sql.includes('Hospedagem: ');
      const [, tripulacaoId, empresaId] = isReserva
        ? (b as [string, string, number])
        : ([undefined, ...(b as [string, number])] as [undefined, string, number]);
      const row = this.escalaTripulacoes.get(tripulacaoId);
      const owns = row && this.escalasMensais.get(row.escala_id) === empresaId;
      if (owns && row) {
        row.observacoes = 'updated';
        this.writes += 1;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (sql.includes('UPDATE hospedagens')) {
      const [funcionarioId1, funcionarioId2, empresaId] = b as [number, number, number];
      const owns = this.funcionarios.get(String(funcionarioId2)) === empresaId;
      let changes = 0;
      if (owns) {
        for (const h of this.hospedagens) {
          if (
            h.funcionario_id === funcionarioId1 &&
            ['reservado', 'confirmado'].includes(h.status) &&
            !h.deleted_at
          ) {
            h.status = 'cancelado';
            changes++;
          }
        }
      }
      this.writes += changes;
      return { meta: { changes } };
    }
    if (sql.includes('INSERT OR IGNORE INTO frms_carga_trabalho')) {
      const [, empresaId, funcionarioId] = b as [string, number, string];
      this.frmsCargaTrabalhoInserts.push({ funcionario_id: funcionarioId, empresa_id: empresaId });
      this.writes += 1;
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO hospedagem_sugestoes')) {
      const [, empresaId, funcionarioId] = b as [string, number, string];
      this.hospedagemSugestoes.push({ funcionario_id: funcionarioId, empresa_id: empresaId });
      this.writes += 1;
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO qualificacoes_pendencias')) {
      const [, empresaId, funcionarioId] = b as [string, number, string];
      this.qualificacoesPendencias.push({ funcionario_id: funcionarioId, empresa_id: empresaId });
      this.writes += 1;
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled exec SQL: ${sql}`);
  }

  private execFirst<T>(sql: string, b: unknown[]): T | null {
    if (sql.includes('UPDATE domain_events') && sql.includes('RETURNING id')) {
      const [processadoPor, id, expectedPrev] = b as [string, string, string];
      const ev = this.events.find((e) => e.id === id);
      if (!ev || ev.processado_por !== expectedPrev || ev.processado) return null;
      ev.processado_por = processadoPor;
      return { id } as T;
    }
    if (sql.includes('SELECT consumidores, processado_por, ultimo_erro')) {
      const [id] = b as [string];
      const ev = this.events.find((e) => e.id === id);
      if (!ev) return null;
      return { consumidores: ev.consumidores, processado_por: ev.processado_por, ultimo_erro: null } as T;
    }
    if (sql.includes('SELECT id FROM funcionarios')) {
      const [funcionarioId, empresaId] = b as [string, number];
      const owns = this.funcionarios.get(String(funcionarioId)) === Number(empresaId);
      return (owns ? { id: funcionarioId } : null) as T | null;
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  private execAll<T>(sql: string, b: unknown[]): { results: T[] } {
    if (sql.includes('FROM domain_events')) {
      const [empresaId, consumidor] = b as [string, string];
      const results = this.events.filter(
        (e) =>
          String(e.empresa_id) === String(empresaId) &&
          !e.processado &&
          JSON.parse(e.consumidores).includes(consumidor),
      );
      return { results: results as unknown as T[] };
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }

  addEvent(empresaId: number, modulo: string, tipo: string, payload: Record<string, unknown>, consumidor: string) {
    this.events.push({
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      modulo,
      tipo,
      payload: JSON.stringify(payload),
      consumidores: JSON.stringify([consumidor]),
      processado_por: '[]',
      processado: 0,
    });
  }
}

function asD1(db: FakeDb) {
  return db as unknown as import('@cloudflare/workers-types').D1Database;
}

describe('domain event handlers reject cross-tenant entity references (A/B mismatch)', () => {
  it('simuladores: FUNCIONARIO_INATIVADO does not cancel another tenant funcionario sessions', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 2); // funcionario 50 belongs to tenant B
    db.sessoesParticipantes.push({ sessao_id: 1, funcionario_id: 50, deleted_at: null });
    db.simuladorAgendamentos.push({ id: 1, funcionario_id: 50, status: 'AGENDADO', deleted_at: null });

    // Event stamped as tenant A, referencing funcionario_id that actually belongs to tenant B
    db.addEvent(1, 'simuladores', 'FUNCIONARIO_INATIVADO', { empresa_id: 1, funcionario_id: '50' }, 'simuladores');

    const result = await processarEventosParaModulo(asD1(db), '1', 'simuladores');
    expect(result.processados).toBe(1);
    expect(db.simuladorAgendamentos[0].status).toBe('AGENDADO'); // untouched
    expect(db.writes).toBe(0);
  });

  it('simuladores: legitimate same-tenant FUNCIONARIO_INATIVADO still cancels sessions', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 1);
    db.sessoesParticipantes.push({ sessao_id: 1, funcionario_id: 50, deleted_at: null });
    db.simuladorAgendamentos.push({ id: 1, funcionario_id: 50, status: 'AGENDADO', deleted_at: null });
    db.addEvent(1, 'simuladores', 'FUNCIONARIO_INATIVADO', { empresa_id: 1, funcionario_id: '50' }, 'simuladores');

    const result = await processarEventosParaModulo(asD1(db), '1', 'simuladores');
    expect(result.processados).toBe(1);
    expect(db.simuladorAgendamentos[0].status).toBe('CANCELADO');
  });

  it('frms: TRIPULANTE_REMOVIDO does not delete another tenant carga_trabalho row', async () => {
    const db = new FakeDb();
    db.frmsCargaTrabalho.push({
      id: 'ct-1',
      empresa_id: 2,
      escala_tripulacao_id: 'trip-1',
      deleted_at: null,
    });
    db.addEvent(1, 'frms', 'TRIPULANTE_REMOVIDO', { empresa_id: 1, tripulacao_id: 'trip-1' }, 'frms');

    const result = await processarEventosParaModulo(asD1(db), '1', 'frms');
    expect(result.processados).toBe(1);
    expect(db.frmsCargaTrabalho[0].deleted_at).toBeNull();
  });

  it('frms: legitimate same-tenant TRIPULANTE_REMOVIDO still deletes row', async () => {
    const db = new FakeDb();
    db.frmsCargaTrabalho.push({
      id: 'ct-1',
      empresa_id: 1,
      escala_tripulacao_id: 'trip-1',
      deleted_at: null,
    });
    db.addEvent(1, 'frms', 'TRIPULANTE_REMOVIDO', { empresa_id: 1, tripulacao_id: 'trip-1' }, 'frms');

    const result = await processarEventosParaModulo(asD1(db), '1', 'frms');
    expect(result.processados).toBe(1);
    expect(db.frmsCargaTrabalho[0].deleted_at).toBe('now');
  });

  it('escalas: HOSPEDAGEM_RESERVADA does not touch another tenant escala_tripulacoes row', async () => {
    const db = new FakeDb();
    db.escalasMensais.set('escala-B', 2);
    db.escalaTripulacoes.set('trip-1', { escala_id: 'escala-B', observacoes: '' });
    db.addEvent(
      1,
      'escalas',
      'HOSPEDAGEM_RESERVADA',
      { empresa_id: 1, escala_tripulacao_id: 'trip-1', hospedagem_nome: 'Hotel X' },
      'escalas',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'escalas');
    expect(result.processados).toBe(1);
    expect(db.escalaTripulacoes.get('trip-1')?.observacoes).toBe('');
  });

  it('escalas: legitimate same-tenant HOSPEDAGEM_RESERVADA still updates row', async () => {
    const db = new FakeDb();
    db.escalasMensais.set('escala-A', 1);
    db.escalaTripulacoes.set('trip-1', { escala_id: 'escala-A', observacoes: '' });
    db.addEvent(
      1,
      'escalas',
      'HOSPEDAGEM_RESERVADA',
      { empresa_id: 1, escala_tripulacao_id: 'trip-1', hospedagem_nome: 'Hotel X' },
      'escalas',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'escalas');
    expect(result.processados).toBe(1);
    expect(db.escalaTripulacoes.get('trip-1')?.observacoes).toBe('updated');
  });

  it('hospedagem: FUNCIONARIO_INATIVADO does not cancel another tenant reservation', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 2);
    db.hospedagens.push({ id: 1, funcionario_id: 50, status: 'reservado', deleted_at: null });
    db.addEvent(1, 'hospedagem', 'FUNCIONARIO_INATIVADO', { empresa_id: 1, funcionario_id: '50' }, 'hospedagem');

    const result = await processarEventosParaModulo(asD1(db), '1', 'hospedagem');
    expect(result.processados).toBe(1);
    expect(db.hospedagens[0].status).toBe('reservado');
  });

  it('hospedagem: legitimate same-tenant FUNCIONARIO_INATIVADO still cancels reservation', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 1);
    db.hospedagens.push({ id: 1, funcionario_id: 50, status: 'reservado', deleted_at: null });
    db.addEvent(1, 'hospedagem', 'FUNCIONARIO_INATIVADO', { empresa_id: 1, funcionario_id: '50' }, 'hospedagem');

    const result = await processarEventosParaModulo(asD1(db), '1', 'hospedagem');
    expect(result.processados).toBe(1);
    expect(db.hospedagens[0].status).toBe('cancelado');
  });

  it('qualificacoes: DOCUMENTO_CMA_DETECTADO does not create pendencia for another tenant funcionario', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 2);
    db.addEvent(
      1,
      'qualificacoes',
      'DOCUMENTO_CMA_DETECTADO',
      { empresa_id: 1, funcionario_id: '50', r2_key: 'k' },
      'qualificacoes',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'qualificacoes');
    expect(result.processados).toBe(1);
    expect(db.qualificacoesPendencias).toHaveLength(0);
  });

  it('qualificacoes: legitimate same-tenant DOCUMENTO_CMA_DETECTADO still creates pendencia', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 1);
    db.addEvent(
      1,
      'qualificacoes',
      'DOCUMENTO_CMA_DETECTADO',
      { empresa_id: 1, funcionario_id: '50', r2_key: 'k' },
      'qualificacoes',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'qualificacoes');
    expect(result.processados).toBe(1);
    expect(db.qualificacoesPendencias).toHaveLength(1);
  });

  it('frms: TRIPULANTE_ALOCADO does not insert carga_trabalho referencing another tenant funcionario', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 2); // funcionario 50 belongs to tenant B
    db.addEvent(
      1,
      'frms',
      'TRIPULANTE_ALOCADO',
      { empresa_id: 1, funcionario_id: '50', tripulacao_id: 'trip-1' },
      'frms',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'frms');
    expect(result.processados).toBe(1);
    expect(db.frmsCargaTrabalhoInserts).toHaveLength(0);
  });

  it('frms: legitimate same-tenant TRIPULANTE_ALOCADO still inserts carga_trabalho', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 1);
    db.addEvent(
      1,
      'frms',
      'TRIPULANTE_ALOCADO',
      { empresa_id: 1, funcionario_id: '50', tripulacao_id: 'trip-1' },
      'frms',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'frms');
    expect(result.processados).toBe(1);
    expect(db.frmsCargaTrabalhoInserts).toHaveLength(1);
  });

  it('hospedagem: TRIPULANTE_ALOCADO does not create sugestao referencing another tenant funcionario', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 2); // funcionario 50 belongs to tenant B
    db.addEvent(
      1,
      'hospedagem',
      'TRIPULANTE_ALOCADO',
      { empresa_id: 1, funcionario_id: '50', base_destino: 'GRU', base_origem: 'CGH' },
      'hospedagem',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'hospedagem');
    expect(result.processados).toBe(1);
    expect(db.hospedagemSugestoes).toHaveLength(0);
  });

  it('hospedagem: legitimate same-tenant TRIPULANTE_ALOCADO still creates sugestao', async () => {
    const db = new FakeDb();
    db.funcionarios.set('50', 1);
    db.addEvent(
      1,
      'hospedagem',
      'TRIPULANTE_ALOCADO',
      { empresa_id: 1, funcionario_id: '50', base_destino: 'GRU', base_origem: 'CGH' },
      'hospedagem',
    );

    const result = await processarEventosParaModulo(asD1(db), '1', 'hospedagem');
    expect(result.processados).toBe(1);
    expect(db.hospedagemSugestoes).toHaveLength(1);
  });
});
