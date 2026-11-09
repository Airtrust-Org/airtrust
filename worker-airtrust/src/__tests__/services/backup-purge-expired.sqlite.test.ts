import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupOrchestrator } from '../../services/backup/orchestrator';
import type { Env } from '../../types';
import { BackupSqliteD1 } from '../helpers/backup-sqlite-d1';
import { FakeR2Bucket } from '../helpers/fake-r2-bucket';

const NOW = new Date('2026-11-09T03:00:00.000Z');

interface Seed {
  uuid: string;
  status?: string;
  triggeredBy?: string;
  expiresAt: string;
  date?: string; // yyyy/mm/dd
  r2Path?: string;
}

function seed(db: BackupSqliteD1, r2: FakeR2Bucket, row: Seed) {
  const date = row.date ?? '2026/09/01';
  const r2Path = row.r2Path ?? `backups/${date}/${row.uuid}`;
  db.exec(
    `INSERT INTO backups_controle (uuid, tipo, escopo, status, r2_path, triggered_by, expires_at)
     VALUES ('${row.uuid}', 'INCREMENTAL', 'SYSTEM_GLOBAL', '${row.status ?? 'CONCLUIDO'}',
             '${r2Path}', '${row.triggeredBy ?? 'CRON_DIARIO'}', '${row.expiresAt}')`,
  );
  // artefatos nos dois prefixos usados pelo orquestrador
  if (!row.r2Path) {
    r2.store.set(`${r2Path}/QUALIFICACOES.json`, { bytes: new TextEncoder().encode('{}'), uploaded: NOW });
  }
  r2.store.set(`backups/${row.uuid}/checksum-manifest.json`, { bytes: new TextEncoder().encode('{}'), uploaded: NOW });
}

function setup(env: Record<string, string> = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const db = new BackupSqliteD1();
  const r2 = new FakeR2Bucket({ 'scorm/pkg/index.html': '<html/>', 'tenant-assets/logo.png': 'png' });
  const orchestrator = new BackupOrchestrator({ DB: db.asD1(), BUCKET: r2.asR2(), ...env } as Env);
  return { db, r2, orchestrator };
}

const deleted = (db: BackupSqliteD1, uuid: string) =>
  (
    db.database.prepare('SELECT deleted_at FROM backups_controle WHERE uuid = ?').get(uuid) as {
      deleted_at: string | null;
    }
  ).deleted_at;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BackupOrchestrator.expurgarBackupsExpirados (P08-03)', () => {
  it('por padrao e dry-run: conta candidatos e nao apaga nada', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db, r2, orchestrator } = setup({ BACKUP_PURGE_KEEP_LATEST: '1' });
    seed(db, r2, { uuid: 'expirado-0001', expiresAt: '2026-10-01T00:00:00.000Z' });
    seed(db, r2, { uuid: 'protegido-ultimo1', expiresAt: '2027-01-01T00:00:00.000Z', date: '2026/11/08' });
    const antes = r2.keys();

    const res = await orchestrator.expurgarBackupsExpirados();

    expect(res).toMatchObject({ dryRun: true, candidates: 1, purged: 0 });
    expect(r2.keys()).toEqual(antes);
    expect(r2.ops.delete).toBe(0);
    expect(deleted(db, 'expirado-0001')).toBeNull();
  });

  it('habilitado: remove so os prefixos do backup expirado e marca deleted_at; preserva nao expirados e dados de producao', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { db, r2, orchestrator } = setup({ BACKUP_PURGE_ENABLED: 'true', BACKUP_PURGE_KEEP_LATEST: '1' });
    seed(db, r2, { uuid: 'expirado-0001', expiresAt: '2026-10-01T00:00:00.000Z' });
    seed(db, r2, { uuid: 'expirado-0001-retry-0300', expiresAt: '2026-10-01T00:00:00.000Z' });
    seed(db, r2, { uuid: 'valido-00000001', expiresAt: '2027-01-01T00:00:00.000Z' });
    // o CONCLUIDO mais recente fica protegido mesmo expirado
    seed(db, r2, { uuid: 'ultimo-expirado', expiresAt: '2026-10-02T00:00:00.000Z', date: '2026/10/05' });

    const res = await orchestrator.expurgarBackupsExpirados();

    expect(res).toMatchObject({ dryRun: false, candidates: 2, purged: 2, failed: 0 });
    expect(r2.keys('backups/2026/09/01/expirado-0001/')).toEqual([]);
    expect(r2.keys('backups/expirado-0001/')).toEqual([]);
    // prefixo de uuid parecido (retry) tambem foi tratado como backup proprio, nao por colisao de prefixo
    expect(deleted(db, 'expirado-0001')).not.toBeNull();
    expect(deleted(db, 'expirado-0001-retry-0300')).not.toBeNull();
    expect(deleted(db, 'valido-00000001')).toBeNull();
    expect(deleted(db, 'ultimo-expirado')).toBeNull();
    expect(r2.keys('backups/2026/09/01/valido-00000001/')).toHaveLength(1);
    expect(r2.keys('backups/2026/10/05/ultimo-expirado/')).toHaveLength(1);
    // dados de producao intactos
    expect(r2.keys('scorm/')).toEqual(['scorm/pkg/index.html']);
    expect(r2.keys('tenant-assets/')).toEqual(['tenant-assets/logo.png']);
  });

  it('nunca apaga o prefixo de outro backup cujo uuid e prefixo textual do expirado', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { db, r2, orchestrator } = setup({ BACKUP_PURGE_ENABLED: 'true', BACKUP_PURGE_KEEP_LATEST: '1' });
    seed(db, r2, { uuid: 'cron-diario-2026-09-01', expiresAt: '2026-10-01T00:00:00.000Z' });
    seed(db, r2, { uuid: 'cron-diario-2026-09-01-retry-0300', expiresAt: '2027-10-01T00:00:00.000Z' });
    seed(db, r2, { uuid: 'protegido-ultimo1', expiresAt: '2027-10-01T00:00:00.000Z', date: '2026/11/08' });

    await orchestrator.expurgarBackupsExpirados();

    expect(deleted(db, 'cron-diario-2026-09-01')).not.toBeNull();
    expect(r2.keys('backups/cron-diario-2026-09-01-retry-0300/')).toHaveLength(1);
    expect(r2.keys('backups/2026/09/01/cron-diario-2026-09-01-retry-0300/')).toHaveLength(1);
  });

  it('respeita o limite por execucao e processa os mais antigos primeiro', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { db, r2, orchestrator } = setup({
      BACKUP_PURGE_ENABLED: 'true',
      BACKUP_PURGE_MAX_PER_RUN: '2',
      BACKUP_PURGE_KEEP_LATEST: '1',
    });
    seed(db, r2, { uuid: 'exp-antigo-0003', expiresAt: '2026-03-03T00:00:00.000Z' });
    seed(db, r2, { uuid: 'exp-antigo-0001', expiresAt: '2026-01-01T00:00:00.000Z' });
    seed(db, r2, { uuid: 'exp-antigo-0002', expiresAt: '2026-02-02T00:00:00.000Z' });
    seed(db, r2, { uuid: 'recente-ultimo1', expiresAt: '2026-11-01T00:00:00.000Z', date: '2026/11/08' });

    const res = await orchestrator.expurgarBackupsExpirados();

    expect(res.purged).toBe(2);
    expect(deleted(db, 'exp-antigo-0001')).not.toBeNull();
    expect(deleted(db, 'exp-antigo-0002')).not.toBeNull();
    expect(deleted(db, 'exp-antigo-0003')).toBeNull();
  });

  it('nao toca em EM_PROGRESSO nem em linha com r2_path fora do formato; falha de R2 nao marca a linha', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { db, r2, orchestrator } = setup({ BACKUP_PURGE_ENABLED: 'true', BACKUP_PURGE_KEEP_LATEST: '1' });
    seed(db, r2, { uuid: 'em-progresso-01', status: 'EM_PROGRESSO', expiresAt: '2026-01-01T00:00:00.000Z' });
    seed(db, r2, { uuid: 'path-estranho-01', expiresAt: '2026-01-01T00:00:00.000Z', r2Path: 'scorm/pkg' });
    seed(db, r2, { uuid: 'falha-no-r2-001', expiresAt: '2026-01-02T00:00:00.000Z' });
    seed(db, r2, { uuid: 'protegido-ultimo1', expiresAt: '2027-01-01T00:00:00.000Z', date: '2026/11/08' });
    vi.spyOn(r2, 'delete').mockRejectedValueOnce(new Error('R2 indisponivel'));

    const res = await orchestrator.expurgarBackupsExpirados();

    expect(res).toMatchObject({ candidates: 1, purged: 0, failed: 1 });
    expect(deleted(db, 'em-progresso-01')).toBeNull();
    expect(deleted(db, 'path-estranho-01')).toBeNull();
    expect(deleted(db, 'falha-no-r2-001')).toBeNull();
    expect(r2.keys('scorm/')).toEqual(['scorm/pkg/index.html']);
  });

  it('executarBackupAutomatico(DIARIO) expurga antes do backup e uma falha no expurgo nao o impede', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { db, r2, orchestrator } = setup();
    for (const t of [
      'qualificacoes_tipos', 'qualificacoes_historico', 'licencas', 'qualificacoes_categorias',
      'qualificacoes_areas', 'alertas_reforco', 'certificados', 'certificado_anexos',
      'fichas_sessao', 'fichas_sessao_manobras', 'manobras', 'simuladores',
      'historico_notas_manobras', 'instrutores_simulador', 'tipos_sessao', 'modelos_sessao',
      'modelos_sessao_manobras', 'auditoria_avancada_v2', 'auditoria', 'audit_cascade',
      'pessoas_auditoria_acessos', 'notificacoes', 'compliance_status', 'historico_compliance',
    ]) {
      db.exec(`CREATE TABLE "${t}" (id INTEGER PRIMARY KEY)`);
    }
    vi.spyOn(orchestrator, 'expurgarBackupsExpirados').mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await orchestrator.executarBackupAutomatico('DIARIO');

    const row = db.database.prepare("SELECT status FROM backups_controle WHERE uuid = 'cron-diario-2026-11-09'").get() as { status: string };
    expect(row.status).toBe('CONCLUIDO');
    expect(r2.keys('backups/').length).toBeGreaterThan(0);
  });
});
