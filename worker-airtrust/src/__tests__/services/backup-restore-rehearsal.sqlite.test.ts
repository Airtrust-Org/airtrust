/**
 * ENSAIO SINTÉTICO DE BACKUP -> RESTORE (100% local; nenhuma rede, D1 ou R2 reais).
 *
 * Dados: 2 empresas sintéticas nas 43 tabelas configuradas em BACKUP_MODULES, em SQLite real
 * (node:sqlite) + R2 em memória. Executa o BackupOrchestrator de verdade, verifica manifesto e
 * SHA-256 por objeto com node:crypto (independente do WebCrypto do orquestrador), restaura em
 * um SQLite isolado e compara contagens/checksums por tabela e por empresa. Injeta falhas:
 * objeto R2 sumido, falha no meio, isolate encerrado (promessa pendurada), corrupção pós-gravação.
 *
 * Evidência: com BACKUP_REHEARSAL_REPORT=/caminho/relatorio.json grava o relatório do ensaio.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BACKUP_MODULES, TODOS_MODULOS } from '../../config/backup-modules';
import {
  type BackupObjectReader,
  type RestoreTarget,
  quoteSqlIdentifier,
  restoreVerifiedBackupIntoScratch,
  verifyBackupSet,
} from '../../services/backup/offline-restore';
import { BackupOrchestrator } from '../../services/backup/orchestrator';
import type { Env } from '../../types';
import { BackupSqliteD1 } from '../helpers/backup-sqlite-d1';
import { FakeR2Bucket } from '../helpers/fake-r2-bucket';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');

const ALL_TABLES = TODOS_MODULOS.flatMap((modulo) => [
  ...BACKUP_MODULES[modulo].tabelas_principais,
  ...BACKUP_MODULES[modulo].tabelas_relacionadas,
]) as string[];

// ---------------------------------------------------------------- dados sintéticos
const TENANTS = [1, 2] as const;
const ROWS_PER_TENANT = 4; // a 4ª linha de cada empresa é soft-deleted (quando a tabela tem deleted_at)

function ddlFor(table: string): string {
  if (table === 'usuarios')
    return `CREATE TABLE usuarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, email TEXT NOT NULL, password_hash TEXT NOT NULL, deleted_at TEXT)`;
  if (table === 'funcionarios')
    return `CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT NOT NULL, cpf TEXT, deleted_at TEXT)`;
  if (table === 'empresas')
    return `CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, deleted_at TEXT)`;
  if (table === 'system_config')
    return `CREATE TABLE system_config (key TEXT PRIMARY KEY, value TEXT, description TEXT, updated_at TEXT)`;
  if (table === 'pessoas_auditoria_acessos')
    return `CREATE TABLE pessoas_auditoria_acessos (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT NOT NULL, "dados_sensíveis" TEXT, deleted_at TEXT)`;
  if (table === 'certificados')
    return `CREATE TABLE certificados (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT NOT NULL, arquivo_hash TEXT, deleted_at TEXT)`;
  return `CREATE TABLE "${table}" (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT NOT NULL, payload TEXT, deleted_at TEXT)`;
}

function seedSource(db: DatabaseSync): { liveRowsByTable: Record<string, number> } {
  for (const table of ALL_TABLES) db.exec(ddlFor(table));
  const liveRowsByTable: Record<string, number> = {};
  for (const table of ALL_TABLES) {
    liveRowsByTable[table] = 0;
    if (table === 'empresas') {
      for (const t of TENANTS) db.exec(`INSERT INTO empresas (id, nome) VALUES (${t}, 'EMPRESA-SINTETICA-${t}')`);
      liveRowsByTable[table] = TENANTS.length;
      continue;
    }
    if (table === 'system_config') {
      db.exec(`INSERT INTO system_config VALUES ('modo','teste','sintetico','2026-01-01')`);
      liveRowsByTable[table] = 1;
      continue;
    }
    for (const t of TENANTS) {
      for (let i = 1; i <= ROWS_PER_TENANT; i++) {
        const id = t * 1000 + i;
        const softDeleted = i === ROWS_PER_TENANT;
        const del = softDeleted ? `'2026-10-01'` : 'NULL';
        if (table === 'usuarios')
          db.exec(`INSERT INTO usuarios VALUES (${id}, ${t}, 'u${id}@sintetico.test', 'SYNTH-HASH-${id}', ${del})`);
        else if (table === 'funcionarios')
          db.exec(`INSERT INTO funcionarios VALUES (${id}, ${t}, 'FUNC-SINT-${id}', 'SINT-CPF-${id}', ${del})`);
        else if (table === 'pessoas_auditoria_acessos')
          db.exec(`INSERT INTO pessoas_auditoria_acessos VALUES (${id}, ${t}, 'ACESSO-${id}', 'dado-sintetico-${id}', ${del})`);
        else if (table === 'certificados')
          db.exec(`INSERT INTO certificados VALUES (${id}, ${t}, 'CERT-${id}', 'arquivo-hash-publico-${id}', ${del})`);
        else db.exec(`INSERT INTO "${table}" VALUES (${id}, ${t}, '${table}-${t}-${i}', 'payload-${id}', ${del})`);
        if (!softDeleted) liveRowsByTable[table] += 1;
      }
    }
  }
  return { liveRowsByTable };
}

// ---------------------------------------------------------------- utilitários do ensaio
function r2Reader(r2: FakeR2Bucket): BackupObjectReader {
  return {
    get: async (key) => (r2.store.has(key) ? r2.bytes(key) : null),
    list: async (prefix) => r2.keys(prefix),
  };
}

function sqliteTarget(db: DatabaseSync): RestoreTarget {
  return {
    tableColumns(table) {
      const cols = db.prepare(`PRAGMA table_info(${quoteSqlIdentifier(table)})`).all() as Array<{ name: string }>;
      return cols.length ? cols.map((c) => c.name) : null;
    },
    rowCount(table) {
      return Number((db.prepare(`SELECT COUNT(*) n FROM ${quoteSqlIdentifier(table)}`).get() as { n: number }).n);
    },
    insertRows(table, columns, rows) {
      const stmt = db.prepare(
        `INSERT INTO ${quoteSqlIdentifier(table)} (${columns.map(quoteSqlIdentifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      );
      for (const row of rows) stmt.run(...(row as Array<string | number | null>));
    },
    transaction(fn) {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function scratchWithSchemaOf(source: DatabaseSync): DatabaseSync {
  const scratch = new NodeDatabaseSync(':memory:');
  for (const table of ALL_TABLES) scratch.exec(ddlFor(table));
  void source;
  return scratch;
}

/** SHA-256 de uma tabela: linhas ordenadas por rowid, valores serializados, só colunas dadas. */
function tableDigest(db: DatabaseSync, table: string, columns: string[], where = ''): { rows: number; sha256: string } {
  const cols = columns.map(quoteSqlIdentifier).join(',');
  const rows = db
    .prepare(`SELECT ${cols} FROM ${quoteSqlIdentifier(table)} ${where} ORDER BY rowid`)
    .all() as Array<Record<string, unknown>>;
  return { rows: rows.length, sha256: sha256(JSON.stringify(rows.map((r) => columns.map((c) => r[c] ?? null)))) };
}

const columnsOf = (db: DatabaseSync, table: string) =>
  (db.prepare(`PRAGMA table_info(${quoteSqlIdentifier(table)})`).all() as Array<{ name: string }>).map((c) => c.name);

function newWorld(objectCount = 12) {
  const source = new NodeDatabaseSync(':memory:');
  const { liveRowsByTable } = seedSource(source);
  // Reaproveita o MESMO SQLite como "D1" do orquestrador (mais as tabelas de controle).
  const d1 = new BackupSqliteD1(true);
  for (const table of ALL_TABLES) d1.exec(ddlFor(table));
  // copia dados fonte -> D1 de teste
  for (const table of ALL_TABLES) {
    const rows = source.prepare(`SELECT * FROM ${quoteSqlIdentifier(table)}`).all() as Array<Record<string, unknown>>;
    const cols = columnsOf(source, table);
    const ins = d1.database.prepare(
      `INSERT INTO ${quoteSqlIdentifier(table)} (${cols.map(quoteSqlIdentifier).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    );
    for (const row of rows) ins.run(...cols.map((c) => (row[c] ?? null) as string | number | null));
  }
  source.close();

  const initial: Record<string, string> = {};
  for (const t of TENANTS) {
    for (let i = 0; i < objectCount / 2; i++) {
      initial[`tenant-${t}/docs/doc-${i}.txt`] = `conteudo-sintetico tenant=${t} doc=${i}`;
    }
  }
  const r2 = new FakeR2Bucket(initial);
  const orchestrator = new BackupOrchestrator({ DB: d1.asD1(), BUCKET: r2.asR2() } as Env);
  return { d1, r2, orchestrator, liveRowsByTable, initial };
}

const controle = (d1: BackupSqliteD1, uuid: string) =>
  d1.database
    .prepare('SELECT status, r2_checksum_sha256 AS checksum, tipo, escopo FROM backups_controle WHERE uuid = ?')
    .get(uuid) as { status: string; checksum: string | null; tipo: string; escopo: string };

const evidence: Record<string, unknown> = {
  natureza: 'ensaio sintetico local: SQLite em memoria + R2 em memoria; nenhum dado ou servico real',
  cenarios: {} as Record<string, unknown>,
};
const cenarios = evidence.cenarios as Record<string, unknown>;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  const out = process.env.BACKUP_REHEARSAL_REPORT;
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(evidence, null, 2));
  }
});

describe('Ensaio sintético backup -> restore', () => {
  it('C1 caminho feliz: backup COMPLETO sistêmico, manifesto/SHA-256 por objeto, restore isolado e comparação por tabela', async () => {
    const { d1, r2, orchestrator, liveRowsByTable, initial } = newWorld();
    const uuid = 'ensaio-c1-completo';

    await orchestrator.executarBackupManual({
      tipo: 'COMPLETO',
      modulos: TODOS_MODULOS,
      triggered_by: 'ENSAIO',
      escopo: 'SYSTEM_GLOBAL',
      backup_uuid: uuid,
    });

    const ctl = controle(d1, uuid);
    expect(ctl.status).toBe('CONCLUIDO');
    expect(ctl.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

    // 1) manifesto autenticado pelo valor gravado em backups_controle
    const reader = r2Reader(r2);
    const verification = await verifyBackupSet({
      reader,
      backupUuid: uuid,
      expectedManifestSha256: ctl.checksum,
      expectedModules: [...TODOS_MODULOS],
    });
    expect(verification.failures).toEqual([]);
    expect(verification.ok).toBe(true);

    // 2) SHA-256 por objeto recomputado com node:crypto (independente do orquestrador)
    const manifest = JSON.parse(r2.text(verification.manifestKey)) as {
      artifacts: Array<{ key: string; size: number; sha256: string }>;
    };
    expect(sha256(r2.text(verification.manifestKey))).toBe(ctl.checksum!.replace('sha256:', ''));
    for (const artifact of manifest.artifacts) {
      expect(artifact.sha256).toBe(`sha256:${sha256(r2.bytes(artifact.key))}`);
      expect(artifact.size).toBe(r2.bytes(artifact.key).byteLength);
    }

    // 3) cópias dos objetos R2 são byte-idênticas às originais
    for (const [key, content] of Object.entries(initial)) {
      expect(r2.text(`backups/${uuid}/r2-files/${key}`)).toBe(content);
    }

    // 4) restore em SQLite isolado e comparação
    const scratch = scratchWithSchemaOf(d1.database);
    const report = await restoreVerifiedBackupIntoScratch(verification, reader, sqliteTarget(scratch), {
      secretPlaceholder: '!RESET_OBRIGATORIO',
    });

    const comparacao: Record<string, unknown> = {};
    for (const table of ALL_TABLES) {
      const restoredCols = columnsOf(scratch, table);
      const cols = restoredCols.filter((c) => c !== 'password_hash');
      const live = tableDigest(d1.database, table, cols, columnsOf(d1.database, table).includes('deleted_at') ? 'WHERE deleted_at IS NULL' : '');
      const restored = tableDigest(scratch, table, cols);
      expect(restored.rows, `linhas de ${table}`).toBe(liveRowsByTable[table]);
      expect(restored, `checksum de ${table}`).toEqual(live);
      comparacao[table] = { ...restored };
    }

    // 5) segredos: o JSON do backup não contém hash; o restore marca placeholder, não reintroduz
    for (const key of r2.keys('backups/').filter((k) => k.endsWith('.json'))) {
      expect(r2.text(key)).not.toContain('SYNTH-HASH');
    }
    expect(report.placeholderedSecretColumns).toEqual({ usuarios: ['password_hash'] });
    const hashes = scratch.prepare('SELECT DISTINCT password_hash h FROM usuarios').all() as Array<{ h: string }>;
    expect(hashes).toEqual([{ h: '!RESET_OBRIGATORIO' }]);

    // 6) limitação documentada: soft-deleted NÃO volta do backup
    const softDeletedNoOrigem = Number(
      (d1.database.prepare('SELECT COUNT(*) n FROM funcionarios WHERE deleted_at IS NOT NULL').get() as { n: number }).n,
    );
    expect(softDeletedNoOrigem).toBe(TENANTS.length);
    expect((scratch.prepare('SELECT COUNT(*) n FROM funcionarios WHERE deleted_at IS NOT NULL').get() as { n: number }).n).toBe(0);

    cenarios.C1 = {
      uuid,
      status: ctl.status,
      checksum_manifesto: ctl.checksum,
      artefatos: manifest.artifacts.length,
      objetos_r2_copiados: Object.keys(initial).length,
      tabelas_restauradas: report.tables.length,
      linhas_restauradas: report.totalInserted,
      tabelas_com_checksum_igual: Object.keys(comparacao).length,
      soft_deleted_na_origem: softDeletedNoOrigem,
      soft_deleted_restaurados: 0,
      colunas_segredo_omitidas: report.placeholderedSecretColumns,
    };
  });

  it('C2 isolamento entre empresas: restore filtrado por empresa não traz nenhuma linha da outra; backup TENANT_SCOPED é recusado', async () => {
    const { d1, r2, orchestrator } = newWorld();
    const uuid = 'ensaio-c2-isolamento';
    await orchestrator.executarBackupManual({
      tipo: 'MODULAR', modulos: TODOS_MODULOS, triggered_by: 'ENSAIO', escopo: 'SYSTEM_GLOBAL', backup_uuid: uuid,
    });
    const ctl = controle(d1, uuid);
    const reader = r2Reader(r2);
    const verification = await verifyBackupSet({ reader, backupUuid: uuid, expectedManifestSha256: ctl.checksum, expectedModules: [...TODOS_MODULOS] });
    expect(verification.ok).toBe(true);

    const porEmpresa: Record<number, Record<string, number>> = {};
    for (const empresa of TENANTS) {
      const scratch = scratchWithSchemaOf(d1.database);
      const report = await restoreVerifiedBackupIntoScratch(verification, reader, sqliteTarget(scratch), {
        secretPlaceholder: '!RESET', onlyEmpresaId: empresa,
      });
      porEmpresa[empresa] = {};
      for (const table of ALL_TABLES) {
        const cols = columnsOf(scratch, table);
        if (table === 'empresas') {
          const ids = (scratch.prepare('SELECT id FROM empresas').all() as Array<{ id: number }>).map((r) => r.id);
          expect(ids).toEqual([empresa]);
        } else if (cols.includes('empresa_id')) {
          const outras = (scratch.prepare('SELECT COUNT(*) n FROM ' + quoteSqlIdentifier(table) + ' WHERE empresa_id IS NOT ?').get(empresa) as { n: number }).n;
          expect(outras, `${table}: linhas de outra empresa`).toBe(0);
          const esperado = (d1.database.prepare(`SELECT COUNT(*) n FROM ${quoteSqlIdentifier(table)} WHERE empresa_id = ? ${cols.includes('deleted_at') ? 'AND deleted_at IS NULL' : ''}`).get(empresa) as { n: number }).n;
          const obtido = (scratch.prepare(`SELECT COUNT(*) n FROM ${quoteSqlIdentifier(table)}`).get() as { n: number }).n;
          expect(obtido).toBe(esperado);
          porEmpresa[empresa][table] = obtido;
        } else {
          expect((scratch.prepare(`SELECT COUNT(*) n FROM ${quoteSqlIdentifier(table)}`).get() as { n: number }).n).toBe(0);
        }
      }
      // marcador textual da outra empresa não aparece em nenhuma tabela restaurada
      const outra = empresa === 1 ? 2 : 1;
      const usuarios = scratch.prepare('SELECT email FROM usuarios').all() as Array<{ email: string }>;
      expect(usuarios.every((u) => !u.email.startsWith(`u${outra}`))).toBe(true);
      expect(report.skippedTablesWithoutTenantColumn).toContain('system_config');
    }

    // O backup sistêmico é GLOBAL por desenho: contém as duas empresas. Rotulá-lo de tenant é recusado.
    const sqlAntes = d1.executed.length;
    const putsAntes = r2.ops.put;
    await expect(
      orchestrator.executarBackupManual({ tipo: 'COMPLETO', modulos: ['PESSOAS'], triggered_by: 'ENSAIO', escopo: 'TENANT_SCOPED' }),
    ).rejects.toThrow('TENANT_SCOPED_BACKUP_NOT_IMPLEMENTED');
    expect(d1.executed.length).toBe(sqlAntes);
    expect(r2.ops.put).toBe(putsAntes);

    cenarios.C2 = { linhas_restauradas_por_empresa_em_tabelas_com_empresa_id: porEmpresa, linhas_de_outra_empresa: 0, tenant_scoped: 'recusado sem tocar D1/R2' };
  });

  it('C3 objeto R2 listado some durante a cópia: FALHOU, sem manifesto, sem checksum, sem CONCLUIDO', async () => {
    const { d1, r2, orchestrator, initial } = newWorld();
    const alvo = Object.keys(initial).sort()[3];
    r2.hooks.beforeGet = (key) => (key === alvo ? 'missing' : undefined);
    const uuid = 'ensaio-c3-objeto-sumido';

    await expect(
      orchestrator.executarBackupManual({ tipo: 'COMPLETO', modulos: TODOS_MODULOS, triggered_by: 'ENSAIO', escopo: 'SYSTEM_GLOBAL', backup_uuid: uuid }),
    ).rejects.toThrow('R2_BACKUP_SOURCE_OBJECT_MISSING');

    const ctl = controle(d1, uuid);
    expect(ctl.status).toBe('FALHOU');
    expect(ctl.checksum).toBeNull();
    expect(r2.keys(`backups/${uuid}/`).some((k) => k.endsWith('/r2-manifest.json') || k.endsWith('/checksum-manifest.json'))).toBe(false);
    // sem manifesto não há como "verificar"; o verificador reprova
    const v = await verifyBackupSet({ reader: r2Reader(r2), backupUuid: uuid, expectedManifestSha256: null });
    expect(v.ok).toBe(false);
    cenarios.C3 = { status: ctl.status, checksum: ctl.checksum, manifesto_gerado: false, verificador: v.failures[0] };
  });

  it('C4 falha no meio da execução (put do 3º módulo): FALHOU; o retry do mesmo dia conclui com checksum', async () => {
    const { d1, r2, orchestrator } = newWorld();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T05:00:00.000Z'));
    let falhou = false;
    r2.hooks.beforePut = (key) => {
      if (!falhou && key.endsWith('/SIMULADORES.json')) {
        falhou = true;
        throw new Error('R2 put falhou (injetado)');
      }
    };

    await expect(orchestrator.executarBackupAutomatico('MENSAL')).rejects.toThrow('R2 put falhou');
    const primeira = controle(d1, 'cron-mensal-2026-11-09');
    expect(primeira.status).toBe('FALHOU');
    expect(primeira.checksum).toBeNull();
    expect(r2.keys('backups/cron-mensal-2026-11-09/checksum-manifest.json')).toEqual([]);

    await orchestrator.executarBackupAutomatico('MENSAL'); // retry do mesmo dia
    const retry = d1.database
      .prepare("SELECT uuid, status, r2_checksum_sha256 AS checksum FROM backups_controle WHERE uuid LIKE 'cron-mensal-2026-11-09-retry-%'")
      .get() as { uuid: string; status: string; checksum: string };
    expect(retry.status).toBe('CONCLUIDO');
    const v = await verifyBackupSet({ reader: r2Reader(r2), backupUuid: retry.uuid, expectedManifestSha256: retry.checksum, expectedModules: [...TODOS_MODULOS] });
    // objetos da tentativa que falhou ficam fora do escopo (outro uuid); o retry se verifica sozinho
    expect(v.failures).toEqual([]);
    cenarios.C4 = { primeira: primeira.status, retry: retry.status, retry_verificado: v.ok };
  });

  it('C5 isolate encerrado no meio (promessa pendurada): nunca vira CONCLUIDO; depois de 60 min vira FALHOU e o backup do dia roda de novo', async () => {
    const { d1, r2, orchestrator } = newWorld();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T03:00:00.000Z'));
    r2.hooks.beforePut = (key) => (key.endsWith('/QUALIFICACOES.json') ? new Promise<void>(() => undefined) : undefined);

    void orchestrator.executarBackupAutomatico('DIARIO'); // nunca termina, como um isolate morto
    await vi.advanceTimersByTimeAsync(10);
    // created_at usa CURRENT_TIMESTAMP (relógio real); deixa a linha "velha" como uma morta de verdade
    d1.database.exec("UPDATE backups_controle SET created_at = '2026-11-09 03:00:00' WHERE uuid = 'cron-diario-2026-11-09'");
    const emAndamento = controle(d1, 'cron-diario-2026-11-09');
    expect(emAndamento.status).toBe('EM_PROGRESSO');
    expect(emAndamento.checksum).toBeNull();

    vi.setSystemTime(new Date('2026-11-09T04:30:00.000Z'));
    r2.hooks.beforePut = undefined;
    await orchestrator.executarBackupAutomatico('DIARIO'); // próxima invocação do cron
    expect(controle(d1, 'cron-diario-2026-11-09').status).toBe('FALHOU');
    const retry = d1.database.prepare("SELECT status FROM backups_controle WHERE uuid LIKE 'cron-diario-2026-11-09-retry-%'").get() as { status: string };
    expect(retry.status).toBe('CONCLUIDO');
    cenarios.C5 = { durante: emAndamento.status, depois: 'FALHOU', retry: retry.status };
  });

  it('C6 corrupção após gravar: byte alterado, objeto truncado, objeto removido, objeto extra e manifesto adulterado são todos detectados', async () => {
    const { d1, r2, orchestrator } = newWorld();
    const uuid = 'ensaio-c6-corrupcao';
    await orchestrator.executarBackupManual({ tipo: 'COMPLETO', modulos: TODOS_MODULOS, triggered_by: 'ENSAIO', escopo: 'SYSTEM_GLOBAL', backup_uuid: uuid });
    const ctl = controle(d1, uuid);
    const base = { reader: r2Reader(r2), backupUuid: uuid, expectedManifestSha256: ctl.checksum, expectedModules: [...TODOS_MODULOS] };
    expect((await verifyBackupSet(base)).ok).toBe(true);

    // The dated scope in a real generated manifest has NO trailing slash.
    // Sibling backup UUID prefixes must not be mistaken as this backup's data.
    const datedScope = (JSON.parse(r2.text(`backups/${uuid}/checksum-manifest.json`)) as {
      scope_prefixes: string[];
    }).scope_prefixes.find((prefix) => !prefix.endsWith('/'))!;
    const siblingKey = `${datedScope}-retry/QUALIFICACOES.json`;
    r2.store.set(siblingKey, { bytes: new TextEncoder().encode('{}'), uploaded: new Date() });
    expect((await verifyBackupSet(base)).ok).toBe(true);
    r2.store.delete(siblingKey);

    const moduloKey = r2.keys(`backups/`).find((k) => k.endsWith('/QUALIFICACOES.json'))!;
    const original = new Uint8Array(r2.bytes(moduloKey));
    const resultados: Record<string, string> = {};

    // (a) um byte alterado, mesmo tamanho
    const flipped = new Uint8Array(original);
    flipped[10] = flipped[10] ^ 0xff;
    r2.store.get(moduloKey)!.bytes = flipped;
    let v = await verifyBackupSet(base);
    expect(v.ok).toBe(false);
    expect(v.failures.join(' ')).toContain('SHA-256 divergente');
    resultados.byte_alterado = 'detectado';

    // (b) truncado
    r2.store.get(moduloKey)!.bytes = original.slice(0, original.length - 5);
    v = await verifyBackupSet(base);
    expect(v.failures.join(' ')).toContain('Tamanho divergente');
    resultados.truncado = 'detectado';

    // (c) removido
    r2.store.delete(moduloKey);
    v = await verifyBackupSet(base);
    expect(v.failures.join(' ')).toContain('Artefato ausente');
    resultados.removido = 'detectado';
    r2.store.set(moduloKey, { bytes: original, uploaded: new Date() });
    expect((await verifyBackupSet(base)).ok).toBe(true);

    // (d) objeto extra no escopo do backup
    r2.store.set(`backups/${uuid}/intruso.json`, { bytes: new TextEncoder().encode('{}'), uploaded: new Date() });
    v = await verifyBackupSet(base);
    expect(v.failures.join(' ')).toContain('Objeto fora do manifesto');
    r2.store.delete(`backups/${uuid}/intruso.json`);
    resultados.objeto_extra = 'detectado';

    // (e) manifesto adulterado (hash recalculado de propósito) não bate com o gravado em backups_controle
    const manifestKey = `backups/${uuid}/checksum-manifest.json`;
    const manifest = JSON.parse(r2.text(manifestKey));
    manifest.artifacts[0].sha256 = `sha256:${'0'.repeat(64)}`;
    r2.store.get(manifestKey)!.bytes = new TextEncoder().encode(JSON.stringify(manifest));
    v = await verifyBackupSet(base);
    expect(v.failures.join(' ')).toContain('SHA-256 do manifesto divergente');
    resultados.manifesto_adulterado = 'detectado';

    // (f) sem o SHA esperado o manifesto não é autenticado
    v = await verifyBackupSet({ ...base, expectedManifestSha256: null });
    expect(v.failures.join(' ')).toContain('não autenticado');

    // (g) restore recusa backup não verificado e nada é escrito
    const scratch = scratchWithSchemaOf(d1.database);
    await expect(restoreVerifiedBackupIntoScratch(v, r2Reader(r2), sqliteTarget(scratch))).rejects.toThrow('RESTORE_REFUSED_UNVERIFIED_BACKUP');
    expect((scratch.prepare('SELECT COUNT(*) n FROM funcionarios').get() as { n: number }).n).toBe(0);
    resultados.restore_de_backup_nao_verificado = 'recusado';
    cenarios.C6 = resultados;
  });

  it('C7 restore nunca sobrescreve e é atômico: destino não vazio, deriva de schema e falha no meio não deixam resíduo', async () => {
    const { d1, r2, orchestrator } = newWorld();
    const uuid = 'ensaio-c7-restore-seguro';
    await orchestrator.executarBackupManual({ tipo: 'MODULAR', modulos: TODOS_MODULOS, triggered_by: 'ENSAIO', escopo: 'SYSTEM_GLOBAL', backup_uuid: uuid });
    const ctl = controle(d1, uuid);
    const reader = r2Reader(r2);
    const v = await verifyBackupSet({ reader, backupUuid: uuid, expectedManifestSha256: ctl.checksum, expectedModules: [...TODOS_MODULOS] });
    expect(v.ok).toBe(true);

    // destino com dados -> aborta sem tocar em nada
    const sujo = scratchWithSchemaOf(d1.database);
    sujo.exec(`INSERT INTO funcoes (id, empresa_id, nome) VALUES (999, 1, 'EXISTENTE')`);
    await expect(restoreVerifiedBackupIntoScratch(v, reader, sqliteTarget(sujo))).rejects.toThrow('RESTORE_TARGET_NOT_EMPTY: funcoes');
    expect((sujo.prepare('SELECT COUNT(*) n FROM funcionarios').get() as { n: number }).n).toBe(0);

    // schema do destino sem uma coluna que o backup tem
    const drift = scratchWithSchemaOf(d1.database);
    drift.exec('DROP TABLE funcionarios; CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT)');
    await expect(restoreVerifiedBackupIntoScratch(v, reader, sqliteTarget(drift))).rejects.toThrow('RESTORE_SCHEMA_DRIFT');

    // falha no meio da escrita (constraint) desfaz tudo
    const meio = scratchWithSchemaOf(d1.database);
    meio.exec('DROP TABLE auditoria; CREATE TABLE auditoria (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT NOT NULL CHECK (nome = \'nunca\'), payload TEXT, deleted_at TEXT)');
    await expect(restoreVerifiedBackupIntoScratch(v, reader, sqliteTarget(meio))).rejects.toThrow();
    for (const table of ['usuarios', 'funcionarios', 'qualificacoes_historico']) {
      expect((meio.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n, table).toBe(0);
    }
    cenarios.C7 = { destino_nao_vazio: 'recusado', deriva_de_schema: 'recusada', falha_no_meio: 'rollback total' };
  });

  it('P2A colisão de nomes: objeto em r2-files com basename de módulo não sobrescreve o módulo exportado', async () => {
    const { d1, r2, orchestrator } = newWorld();
    const uuid = 'ensaio-p2a-colisao';
    await orchestrator.executarBackupManual({ tipo: 'MODULAR', modulos: ['PESSOAS'], triggered_by: 'ENSAIO', escopo: 'SYSTEM_GLOBAL', backup_uuid: uuid });
    const ctl = controle(d1, uuid);
    const reader = r2Reader(r2);

    // Injeta um objeto em r2-files com o mesmo basename de um módulo
    const collisionKey = `backups/${uuid}/r2-files/PESSOAS.json`;
    const payload = new TextEncoder().encode('{"malicioso": true}');
    r2.store.set(collisionKey, { bytes: payload, uploaded: new Date() });

    // Atualiza o manifesto adicionando o objeto em r2-files
    const manifestKey = `backups/${uuid}/checksum-manifest.json`;
    const manifest = JSON.parse(r2.text(manifestKey));
    manifest.artifact_count += 1;
    manifest.total_bytes += payload.length;
    manifest.artifacts.push({
      key: collisionKey,
      size: payload.length,
      sha256: `sha256:${sha256(payload)}`,
    });
    const newManifestJson = JSON.stringify(manifest);
    r2.store.get(manifestKey)!.bytes = new TextEncoder().encode(newManifestJson);
    const newManifestSha256 = `sha256:${sha256(newManifestJson)}`;

    const v = await verifyBackupSet({ reader, backupUuid: uuid, expectedManifestSha256: newManifestSha256, expectedModules: ['PESSOAS'] });
    expect(v.failures).toEqual([]);
    expect(v.ok).toBe(true);
    // A chave associada ao módulo PESSOAS deve ser o módulo exportado, NUNCA o arquivo de r2-files
    expect(v.moduleKeys.PESSOAS).not.toContain('/r2-files/');
    expect(v.moduleKeys.PESSOAS).toMatch(new RegExp(`^backups/(?:\\d{4}/\\d{2}/\\d{2}/)?${uuid}/PESSOAS\\.json$`));
  });

  it('P2B bytes alterados após verificação: restore rejeita objeto mutado antes da escrita e desfaz', async () => {
    const { d1, r2, orchestrator } = newWorld();
    const uuid = 'ensaio-p2b-mutacao-pos-verificacao';
    await orchestrator.executarBackupManual({ tipo: 'MODULAR', modulos: ['PESSOAS'], triggered_by: 'ENSAIO', escopo: 'SYSTEM_GLOBAL', backup_uuid: uuid });
    const ctl = controle(d1, uuid);
    const reader = r2Reader(r2);

    const v = await verifyBackupSet({ reader, backupUuid: uuid, expectedManifestSha256: ctl.checksum, expectedModules: ['PESSOAS'] });
    expect(v.ok).toBe(true);

    // Modifica o módulo PESSOAS no R2 DEPOIS que a verificação passou
    const pessoasKey = v.moduleKeys.PESSOAS;
    const adulterado = JSON.parse(r2.text(pessoasKey));
    adulterado.tabelas_principais.usuarios[0].email = 'hacked@adulterado.com';
    r2.store.get(pessoasKey)!.bytes = new TextEncoder().encode(JSON.stringify(adulterado));

    const scratch = scratchWithSchemaOf(d1.database);
    await expect(restoreVerifiedBackupIntoScratch(v, reader, sqliteTarget(scratch))).rejects.toThrow('RESTORE_MODULE_DIGEST_MISMATCH: PESSOAS');
    // Nada deve ter sido inserido no scratch
    expect((scratch.prepare('SELECT COUNT(*) n FROM usuarios').get() as { n: number }).n).toBe(0);
  });

  it('C8 cobertura: o backup in-Worker cobre 43 tabelas, sem duplicatas, todas com nome válido', () => {
    expect(ALL_TABLES).toHaveLength(43);
    expect(new Set(ALL_TABLES).size).toBe(43);
    expect(ALL_TABLES.every((t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t))).toBe(true);
    cenarios.C8 = { tabelas_cobertas: ALL_TABLES.length, tabelas_em_producao: 353 };
  });

  it('o utilitário de restore offline não é importado por nenhum código de runtime do Worker', () => {
    const root = join(__dirname, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === '__tests__') continue;
          walk(full);
        } else if (/\.(ts|tsx|js|mjs)$/.test(name) && !full.endsWith('services/backup/offline-restore.ts')) {
          if (readFileSync(full, 'utf8').includes('offline-restore')) offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
