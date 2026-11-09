import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_STALE_RUN_MINUTES, BackupOrchestrator } from '../../services/backup/orchestrator';
import type { Env } from '../../types';
import { BackupSqliteD1 } from '../helpers/backup-sqlite-d1';
import { FakeR2Bucket } from '../helpers/fake-r2-bucket';

function orchestratorOver(db: BackupSqliteD1, r2 = new FakeR2Bucket()) {
  return new BackupOrchestrator({ DB: db.asD1(), BUCKET: r2.asR2() } as Env);
}

function insertRun(
  db: BackupSqliteD1,
  uuid: string,
  triggeredBy: string,
  status: string,
  createdAt: string,
) {
  db.exec(
    `INSERT INTO backups_controle (uuid, tipo, escopo, status, r2_path, triggered_by, created_at)
     VALUES ('${uuid}', 'COMPLETO', 'SYSTEM_GLOBAL', '${status}', 'backups/x', '${triggeredBy}', '${createdAt}')`,
  );
}

const status = (db: BackupSqliteD1, uuid: string) =>
  (
    db.database.prepare('SELECT status FROM backups_controle WHERE uuid = ?').get(uuid) as {
      status: string;
    }
  ).status;

const INCREMENTAL_TABLES = [
  'qualificacoes_tipos', 'qualificacoes_historico', 'licencas', 'qualificacoes_categorias',
  'qualificacoes_areas', 'alertas_reforco', 'certificados', 'certificado_anexos',
  'fichas_sessao', 'fichas_sessao_manobras', 'manobras', 'simuladores',
  'historico_notas_manobras', 'instrutores_simulador', 'tipos_sessao', 'modelos_sessao',
  'modelos_sessao_manobras', 'auditoria_avancada_v2', 'auditoria', 'audit_cascade',
  'pessoas_auditoria_acessos', 'notificacoes', 'compliance_status', 'historico_compliance',
];

function createModuleTables(db: BackupSqliteD1) {
  for (const t of INCREMENTAL_TABLES) db.exec(`CREATE TABLE "${t}" (id INTEGER PRIMARY KEY)`);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('BackupOrchestrator - execucoes abandonadas (P13-03 / P08)', () => {
  it('marca como FALHOU so as execucoes de cron EM_PROGRESSO alem do limite e deixa log de erro', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T03:00:00.000Z'));
    const db = new BackupSqliteD1();
    insertRun(db, 'velha-diaria', 'CRON_DIARIO', 'EM_PROGRESSO', '2026-11-05 03:00:01');
    insertRun(db, 'velha-mensal', 'CRON_MENSAL', 'EM_PROGRESSO', '2026-06-01 05:00:00');
    insertRun(db, 'recente', 'CRON_DIARIO', 'EM_PROGRESSO', '2026-11-09 02:30:00');
    insertRun(db, 'concluida-antiga', 'CRON_DIARIO', 'CONCLUIDO', '2026-11-04 03:00:00');
    insertRun(db, 'manual-velha', 'MANUAL_API', 'EM_PROGRESSO', '2026-10-01 10:00:00');

    const encerradas = await orchestratorOver(db).encerrarExecucoesAbandonadas();

    expect(BACKUP_STALE_RUN_MINUTES).toBe(60);
    expect(encerradas).toBe(2);
    expect(status(db, 'velha-diaria')).toBe('FALHOU');
    expect(status(db, 'velha-mensal')).toBe('FALHOU');
    expect(status(db, 'recente')).toBe('EM_PROGRESSO');
    expect(status(db, 'concluida-antiga')).toBe('CONCLUIDO');
    expect(status(db, 'manual-velha')).toBe('EM_PROGRESSO');

    const logs = db.database
      .prepare("SELECT nivel, mensagem FROM backups_logs WHERE nivel = 'ERROR'")
      .all() as Array<{ nivel: string; mensagem: string }>;
    expect(logs).toHaveLength(2);
    expect(logs[0].mensagem).toContain('Execução abandonada');

    // idempotente: segunda passada nao encontra nada
    await expect(orchestratorOver(db).encerrarExecucoesAbandonadas()).resolves.toBe(0);
  });

  it('o backup do dia roda de novo quando a execucao anterior do mesmo dia ficou abandonada', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T03:00:00.000Z'));
    const db = new BackupSqliteD1();
    // Ficou presa as 00:30 do mesmo dia: sem o reaper, status EM_PROGRESSO bloquearia o retry.
    insertRun(db, 'cron-diario-2026-11-09', 'CRON_DIARIO', 'EM_PROGRESSO', '2026-11-09 00:30:00');
    createModuleTables(db);

    await orchestratorOver(db).executarBackupAutomatico('DIARIO');

    expect(status(db, 'cron-diario-2026-11-09')).toBe('FALHOU');
    const retry = db.database
      .prepare("SELECT uuid, status FROM backups_controle WHERE uuid LIKE 'cron-diario-2026-11-09-retry-%'")
      .get() as { uuid: string; status: string } | undefined;
    expect(retry?.status).toBe('CONCLUIDO');
  });

  it('falha na limpeza de controle nao impede o backup do dia (best effort)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T03:00:00.000Z'));
    const db = new BackupSqliteD1();
    createModuleTables(db);
    const orchestrator = orchestratorOver(db);
    vi.spyOn(orchestrator, 'encerrarExecucoesAbandonadas').mockRejectedValue(new Error('D1 indisponivel'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await orchestrator.executarBackupAutomatico('DIARIO');

    expect(status(db, 'cron-diario-2026-11-09')).toBe('CONCLUIDO');
  });
});
