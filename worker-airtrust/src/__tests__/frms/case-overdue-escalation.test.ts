import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../cron/frms-daily-check', () => ({ getSaoPauloOperationalDate: () => '2026-11-16' }));

import { frmsCaseOverdueEscalation } from '../../cron/frms-case-overdue';
import { daysBetween, escalateOverdueCases, overduePriority, selectOverdueCases } from '../../lib/frms/case-overdue';
import { buildFrmsCaseReopenNotes, buildFrmsCaseResolutionNotes, buildFrmsCaseTreatmentNotes, readFrmsPendingTreatment } from '../../lib/frms/case-resolution';
import { marcarAlertaResolvido, reabrirAlertaResolvido, registrarTratamentoAlerta } from '../../lib/frms/db-service-alertas';
import { DEFAULT_MODULE_ALERT_SETTINGS, renderAlertTemplate } from '../../services/module-alert-settings';

// Escalonamento de casos vencidos e reabertura, com o SQL real dos serviços sobre SQLite.
// O prazo vem do tratamento registrado pelo gestor; nada aqui define prazo da empresa.
const Db = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (s: string): DatabaseSync };
const opened: DatabaseSync[] = [];
const HOJE = '2026-11-16';

function treatmentNotes(prazo: string, responsavel = 'Coordenação de Segurança') {
  return buildFrmsCaseTreatmentNotes({
    responsavel, prazo, acao_mitigacao: 'Reprogramar a escala e confirmar o repouso.',
    justificativa: 'Mitigação definida pela coordenação após o alerta.',
  }, 'gestor-1')!;
}

function fixture() {
  const sqlite = new Db(':memory:');
  opened.push(sqlite);
  sqlite.exec([
    'CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT, ativo INTEGER DEFAULT 1, status TEXT DEFAULT "ATIVO")',
    `CREATE TABLE frms_alerta(id TEXT PRIMARY KEY, tripulante_id INTEGER, jornada_id TEXT, nivel TEXT, tipo_limite TEXT,
      resolvido INTEGER DEFAULT 0, resolvido_em TEXT, resolvido_por TEXT, notas_resolucao TEXT, deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`,
    'CREATE TABLE auditoria_avancada_v2(tabela TEXT, acao TEXT, registro_id TEXT, dados_anteriores TEXT, dados_novos TEXT)',
    `CREATE TABLE notificacoes_sistema(id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, prioridade TEXT, titulo TEXT, mensagem TEXT,
      grupo TEXT, dados TEXT, empresa_id INTEGER, link TEXT, acao_primaria TEXT, deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    'CREATE TABLE empresas_config(empresa_id INTEGER PRIMARY KEY, cores_tema TEXT, updated_at TEXT)',
    'INSERT INTO funcionarios(id, empresa_id) VALUES (101, 7), (102, 7), (103, 7), (201, 8)',
  ].join(';') + ';');
  const d1 = {
    prepare(sql: string) {
      const make = (args: unknown[]) => ({
        bind: (...next: unknown[]) => make(next),
        async all() { return { results: sqlite.prepare(sql).all(...args as []), success: true }; },
        async first() { return sqlite.prepare(sql).get(...args as []) ?? null; },
        async run() { const r = sqlite.prepare(sql).run(...args as []); return { success: true, meta: { changes: Number(r.changes) } }; },
      });
      return make([]);
    },
  } as unknown as D1Database;
  const addCase = (id: string, tripulante: number, notes: string | null, extra: { nivel?: string; resolvido?: number } = {}) =>
    sqlite.prepare('INSERT INTO frms_alerta(id, tripulante_id, nivel, tipo_limite, notas_resolucao, resolvido) VALUES (?,?,?,?,?,?)')
      .run(id, tripulante, extra.nivel ?? 'ATENCAO', 'HV_7D', notes, extra.resolvido ?? 0);
  const rows = <T>(sql: string, ...args: unknown[]) => sqlite.prepare(sql).all(...args as []) as T[];
  return { sqlite, d1, addCase, rows };
}
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

const settings = {
  repeat_hours: DEFAULT_MODULE_ALERT_SETTINGS.frms_case_overdue.repeat_hours,
  title_template: DEFAULT_MODULE_ALERT_SETTINGS.frms_case_overdue.title_template,
  message_template: DEFAULT_MODULE_ALERT_SETTINGS.frms_case_overdue.message_template,
};
const escalate = (d1: D1Database, empresaId = 7, hoje = HOJE) =>
  escalateOverdueCases(d1, { empresaId, hoje, settings, render: renderAlertTemplate });

describe('seleção de casos vencidos (função pura)', () => {
  it('só conta tratamento vigente com prazo anterior a hoje; ordena do mais antigo', () => {
    const rows = [
      { id: 'a', nivel: 'atencao', tipo_limite: 'HV_7D', notas_resolucao: treatmentNotes('2026-11-10') },
      { id: 'b', nivel: 'AVISO', tipo_limite: 'FDP_DIARIO', notas_resolucao: treatmentNotes('2026-11-16') },
      { id: 'c', nivel: 'AVISO', tipo_limite: 'FDP_DIARIO', notas_resolucao: treatmentNotes('2026-11-01') },
      { id: 'd', nivel: 'AVISO', tipo_limite: 'FDP_DIARIO', notas_resolucao: null },
      { id: 'e', nivel: 'AVISO', tipo_limite: 'FDP_DIARIO', notas_resolucao: 'texto legado livre' },
      { id: 'f', nivel: 'AVISO', tipo_limite: 'FDP_DIARIO', notas_resolucao: JSON.stringify({ schema: 'FRMS_CASE_REOPENED_V1' }) },
    ];
    const result = selectOverdueCases(rows, HOJE);
    expect(result.map((item) => [item.id, item.dias_vencido])).toEqual([['c', 15], ['a', 6]]);
    expect(daysBetween('2026-11-10', HOJE)).toBe(6);
    expect(() => selectOverdueCases(rows, '16/11/2026')).toThrow('FRMS_CASE_OVERDUE_INVALID_TODAY');
  });

  it('prioridade vem da severidade do próprio caso', () => {
    const base = { id: 'x', tipo_limite: 'HV_7D', responsavel: 'r', prazo: '2026-11-01', dias_vencido: 15 };
    expect(overduePriority([{ ...base, nivel: 'ATENCAO' }])).toBe('ALTA');
    expect(overduePriority([{ ...base, nivel: 'ATENCAO' }, { ...base, nivel: 'VIOLACAO' }])).toBe('URGENTE');
    expect(overduePriority([{ ...base, nivel: 'CRITICO' }])).toBe('URGENTE');
  });
});

describe('escalonamento por empresa (SQLite)', () => {
  it('notifica uma vez, registra a providência por caso e é idempotente no mesmo dia', async () => {
    const { d1, addCase, rows } = fixture();
    addCase('vencido', 101, treatmentNotes('2026-11-10'));
    addCase('no-prazo', 102, treatmentNotes('2026-11-16'));
    addCase('sem-tratamento', 103, null);
    addCase('encerrado', 101, treatmentNotes('2026-11-01'), { resolvido: 1 });

    const first = await escalate(d1);
    expect(first).toEqual({ vencidos: 1, notificado: true, registrados: 1, truncado: false });
    const notifications = rows<Record<string, unknown>>('SELECT * FROM notificacoes_sistema');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      tipo: 'FRMS_CASE_OVERDUE', prioridade: 'ALTA', grupo: 'frms', empresa_id: 7, link: '/frms/alertas',
    });
    expect(String(notifications[0].mensagem)).toContain('1 caso(s)');
    expect(String(notifications[0].mensagem)).toContain('6 dia(s)');
    const dados = JSON.parse(String(notifications[0].dados));
    expect(dados.casos).toEqual([expect.objectContaining({ id: 'vencido', prazo: '2026-11-10', dias_vencido: 6 })]);
    // Nenhum dado de saúde nem identificação do tripulante vai na notificação.
    expect(JSON.stringify(dados)).not.toMatch(/tripulante|nome|cpf/i);

    const second = await escalate(d1);
    expect(second).toEqual({ vencidos: 1, notificado: false, registrados: 0, truncado: false });
    expect(rows('SELECT 1 FROM notificacoes_sistema')).toHaveLength(1);
    const audits = rows<{ acao: string; registro_id: string; dados_novos: string }>('SELECT * FROM auditoria_avancada_v2');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ acao: 'PRAZO_VENCIDO', registro_id: 'vencido' });
    expect(JSON.parse(audits[0].dados_novos)).toMatchObject({ prazo: '2026-11-10', dias_vencido: 6, notificado_nesta_execucao: true });
  });

  it('caso severo escala para URGENTE; prazo renegociado e vencido de novo gera novo registro', async () => {
    const { d1, sqlite, addCase, rows } = fixture();
    addCase('grave', 101, treatmentNotes('2026-11-05'), { nivel: 'VIOLACAO' });
    await escalate(d1);
    expect(rows<{ prioridade: string }>('SELECT prioridade FROM notificacoes_sistema')[0].prioridade).toBe('URGENTE');

    sqlite.prepare('UPDATE frms_alerta SET notas_resolucao = ? WHERE id = ?').run(treatmentNotes('2026-11-12'), 'grave');
    sqlite.exec("UPDATE notificacoes_sistema SET created_at = datetime('now', '-30 hours')");
    const again = await escalate(d1);
    expect(again).toMatchObject({ vencidos: 1, notificado: true, registrados: 1 });
    expect(rows('SELECT 1 FROM auditoria_avancada_v2 WHERE acao = ?', 'PRAZO_VENCIDO')).toHaveLength(2);
  });

  it('isolamento entre empresas: cada tenant só vê e notifica os próprios casos', async () => {
    const { d1, addCase, rows } = fixture();
    addCase('t7', 101, treatmentNotes('2026-11-01'));
    addCase('t8', 201, treatmentNotes('2026-11-01'));
    expect(await escalate(d1, 7)).toMatchObject({ vencidos: 1 });
    const only7 = rows<{ empresa_id: number; dados: string }>('SELECT empresa_id, dados FROM notificacoes_sistema');
    expect(only7.map((row) => row.empresa_id)).toEqual([7]);
    expect(JSON.parse(only7[0].dados).casos.map((item: { id: string }) => item.id)).toEqual(['t7']);
    expect(await escalate(d1, 8)).toMatchObject({ vencidos: 1 });
    expect(rows<{ empresa_id: number }>('SELECT empresa_id FROM notificacoes_sistema ORDER BY empresa_id').map((row) => row.empresa_id)).toEqual([7, 8]);
  });

  it('cron por empresa respeita a configuração e não depende de config de check-in', async () => {
    const { d1, sqlite, addCase, rows } = fixture();
    addCase('t7', 101, treatmentNotes('2026-11-01'));
    addCase('t8', 201, treatmentNotes('2026-11-01'));
    sqlite.prepare('INSERT INTO empresas_config(empresa_id, cores_tema) VALUES (?, ?)').run(
      8, JSON.stringify({ system_settings: { moduleAlertSettings: { frms_case_overdue: { enabled: false } } } }));
    const result = await frmsCaseOverdueEscalation({ DB: d1 } as never);
    expect(result).toMatchObject({ empresas: 1, casosVencidos: 1, notificacoes: 1, registros: 1, falhas: 0 });
    expect(rows<{ empresa_id: number }>('SELECT empresa_id FROM notificacoes_sistema').map((row) => row.empresa_id)).toEqual([7]);
  });

  it('falha de uma empresa não interrompe as demais e é contada', async () => {
    const { d1, sqlite, addCase, rows } = fixture();
    addCase('t7', 101, treatmentNotes('2026-11-01'));
    addCase('t8', 201, treatmentNotes('2026-11-01'));
    sqlite.exec(`CREATE TRIGGER boom BEFORE INSERT ON notificacoes_sistema WHEN NEW.empresa_id = 7
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`);
    const result = await frmsCaseOverdueEscalation({ DB: d1 } as never);
    expect(result.falhas).toBe(1);
    expect(result.empresas).toBe(1);
    expect(rows<{ empresa_id: number }>('SELECT empresa_id FROM notificacoes_sistema').map((row) => row.empresa_id)).toEqual([8]);
  });
});

describe('reabertura de caso encerrado (SQL real)', () => {
  const treat = (prazo = '2026-11-20') => treatmentNotes(prazo);
  const closure = (prior: string) => buildFrmsCaseResolutionNotes({
    ...readFrmsPendingTreatment(prior)!, avaliacao_eficacia: 'Eficácia verificada por conferência da escala seguinte.',
  }, 'gestor-1')!;
  const reopen = (d1: D1Database, id: string, justificativa: unknown, empresa = 7) =>
    reabrirAlertaResolvido(d1, id, 'gestor-2', (prev) => buildFrmsCaseReopenNotes({ justificativa }, 'gestor-2', prev), empresa);

  it('trata, encerra, reabre com justificativa e preserva o encerramento anterior', async () => {
    const { d1, addCase, rows } = fixture();
    addCase('c1', 101, null);
    const notes = treat();
    expect(await registrarTratamentoAlerta(d1, 'c1', 'gestor-1', notes, 7)).toBe(true);
    expect(await marcarAlertaResolvido(d1, 'c1', 'gestor-1', closure(notes), 7)).toBe(true);
    expect(await reopen(d1, 'c1', 'Reincidência após a mitigação; eficácia insuficiente.')).toBe('REOPENED');

    const row = rows<Record<string, unknown>>('SELECT * FROM frms_alerta WHERE id = ?', 'c1')[0];
    expect(row).toMatchObject({ resolvido: 0, resolvido_em: null, resolvido_por: null });
    const reopened = JSON.parse(String(row.notas_resolucao));
    expect(reopened).toMatchObject({ schema: 'FRMS_CASE_REOPENED_V1', reaberto_por: 'gestor-2' });
    expect(reopened.historico).toHaveLength(1);
    expect(reopened.historico[0]).toMatchObject({ schema: 'FRMS_CASE_RESOLUTION_V1', responsavel: 'Coordenação de Segurança' });
    // Sem tratamento vigente: não é "vencido" e novo encerramento exige novo tratamento.
    expect(readFrmsPendingTreatment(row.notas_resolucao)).toBeNull();
    expect(selectOverdueCases([{ id: 'c1', nivel: 'ATENCAO', tipo_limite: 'HV_7D', notas_resolucao: String(row.notas_resolucao) }], '2027-01-01')).toEqual([]);
    expect(rows<{ acao: string }>('SELECT acao FROM auditoria_avancada_v2 ORDER BY rowid').map((a) => a.acao)).toEqual([
      'TRATAMENTO_REGISTRADO', 'RESOLVIDO', 'REABERTO']);

    // Ciclo completo de novo: a segunda resolução acrescenta ao histórico, sem perder a primeira.
    const second = treat('2026-12-01');
    expect(await registrarTratamentoAlerta(d1, 'c1', 'gestor-2', second, 7)).toBe(true);
    expect(await marcarAlertaResolvido(d1, 'c1', 'gestor-2', closure(second), 7)).toBe(true);
    expect(await reopen(d1, 'c1', 'Nova reincidência registrada pela coordenação.')).toBe('REOPENED');
    const twice = JSON.parse(String(rows<{ notas_resolucao: string }>('SELECT notas_resolucao FROM frms_alerta WHERE id = ?', 'c1')[0].notas_resolucao));
    expect(twice.historico).toHaveLength(2);
  });

  it('recusa reabrir caso aberto, de outro tenant ou sem justificativa suficiente, sem alterar nada', async () => {
    const { d1, addCase, rows } = fixture();
    addCase('aberto', 101, null);
    addCase('fechado7', 101, closure(treat()), { resolvido: 1 });
    addCase('fechado8', 201, closure(treat()), { resolvido: 1 });
    expect(await reopen(d1, 'aberto', 'Justificativa longa o bastante.')).toBe('NOT_CLOSED');
    expect(await reopen(d1, 'fechado8', 'Justificativa longa o bastante.', 7)).toBe('NOT_CLOSED');
    expect(await reopen(d1, 'fechado7', 'curta')).toBe('INVALID');
    expect(await reopen(d1, 'fechado7', undefined)).toBe('INVALID');
    expect(rows<{ id: string; resolvido: number }>('SELECT id, resolvido FROM frms_alerta ORDER BY id')).toEqual([
      { id: 'aberto', resolvido: 0 }, { id: 'fechado7', resolvido: 1 }, { id: 'fechado8', resolvido: 1 }]);
    expect(rows('SELECT 1 FROM auditoria_avancada_v2')).toHaveLength(0);
  });

  it('encerramento legado em texto livre também é preservado', async () => {
    const { d1, addCase, rows } = fixture();
    addCase('legado', 101, 'resolvido por telefone em 2026-09', { resolvido: 1 });
    expect(await reopen(d1, 'legado', 'Revisão da coordenação encontrou pendência.')).toBe('REOPENED');
    const notes = JSON.parse(String(rows<{ notas_resolucao: string }>('SELECT notas_resolucao FROM frms_alerta')[0].notas_resolucao));
    expect(notes.historico[0]).toMatchObject({ schema: 'LEGACY_TEXT', texto: 'resolvido por telefone em 2026-09' });
  });
});
