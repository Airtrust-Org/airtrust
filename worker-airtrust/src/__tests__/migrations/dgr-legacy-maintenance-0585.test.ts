import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};
const root = join(process.cwd(), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const sqlPath = 'worker-airtrust/schema-v2/changes/0585_dgr_legacy_maintenance_consolidation.sql';
const planPath = 'worker-airtrust/schema-v2/plans/dgr-legacy-maintenance-consolidation-0585.md';
const changeId = 'dgr-legacy-maintenance-consolidation-0585';

describe('DGR maintenance conservative consolidation 0585', () => {
  it('has reviewed immutable bundle and fail-closed protected production workflow', () => {
    const manifest = JSON.parse(read('worker-airtrust/schema-v2/' + changeId + '.json'));
    expect(manifest).toMatchObject({
      changeId,
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: sqlPath,
      planPath,
      fileHash: hash(read(sqlPath)),
      planHash: hash(read(planPath)),
    });
    const workflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(workflow).toContain('Preflight DGR maintenance consolidation 0585');
    expect(workflow).toContain('Post-validate DGR maintenance consolidation 0585');
    const pinnedGuard = workflow.split('      - name: Preflight DGR maintenance consolidation 0585')[1]?.split('      - name:')[0] || '';
    expect(pinnedGuard).toContain('EXPECTED_WORKER_SHA: ff16b2d4e0510be73a24cdee93a5fff4e0d36d22');
    expect(pinnedGuard).toContain('RELEASE_SHA: ff16b2d4e0510be73a24cdee93a5fff4e0d36d22');
    expect(pinnedGuard).not.toContain('EXPECTED_WORKER_SHA: ${{ github.sha }}');
    expect(workflow).toContain('git merge-base --is-ancestor "$EXPECTED_WORKER_SHA" "$GITHUB_SHA"');
    expect(workflow).toContain('node scripts/ci/verify-release-gates.mjs');
    expect(read('scripts/schema-v2/validate-0585-production-preflight.sh')).toContain('DGR_0585_PREFLIGHT_PASS');
    expect(read('scripts/schema-v2/validate-0585-production-postconditions.sh')).toContain('DGR_0585_POSTCONDITIONS_PASS');
    const sql = read(sqlPath);
    expect(sql).not.toMatch(/DELETE FROM qualificacoes_historico|DROP TABLE|DELETE FROM treinamento_requisitos/i);
    const contract = JSON.parse(read('docs/database/schema-contracts/production-d1-baseline-v2.json'));
    expect(contract.schema_v2_since_baseline.some((c: { change_id: string; sha256: string; targets: string[] }) =>
      c.change_id === changeId && c.sha256 === hash(sql) && c.targets.length === 0,
    )).toBe(true);
  });

  it('preserves 39 D4 histories plus two inactive legacy certificates, isolates tenant and refuses false compliance', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        PRAGMA foreign_keys=ON;
        CREATE TABLE funcionarios (
          id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT,
          ativo INTEGER, deleted_at TEXT
        );
        CREATE TABLE qualificacoes_tipos (
          id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT,nome TEXT,
          ativo INTEGER,deleted_at TEXT,updated_at TEXT
        );
        CREATE TABLE qualificacoes_historico (
          id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
          funcionario_id INTEGER REFERENCES funcionarios(id),
          qualificacao_id INTEGER REFERENCES qualificacoes_tipos(id),
          qualificacao_codigo TEXT,tipo TEXT,perfil_competencia TEXT,observacoes TEXT,
          status TEXT,data_conclusao TEXT,data_vencimento TEXT,
          numero_certificado TEXT,deleted_at TEXT,updated_at TEXT
        );
        CREATE TABLE qualificacoes_tipos_setores (
          id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
          tipo_id INTEGER REFERENCES qualificacoes_tipos(id),
          setor_id INTEGER,deleted_at TEXT,updated_at TEXT
        );
        CREATE TABLE treinamento_requisitos (
          id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
          qualificacao_tipo_id INTEGER REFERENCES qualificacoes_tipos(id),
          escopo TEXT,funcao_id INTEGER,perfil_competencia TEXT,
          obrigatoriedade TEXT,ativo INTEGER,deleted_at TEXT,updated_at TEXT
        );
        INSERT INTO qualificacoes_tipos VALUES
          (25,6,'D4','DGR — Transporte de Artigos Perigosos',1,NULL,NULL),
          (137,6,'MNT_ARTIGOS_PERIGOSOS','Artigos Perigosos',1,NULL,NULL),
          (725,7,'D4','DGR — Outra Empresa',1,NULL,NULL);
        INSERT INTO qualificacoes_tipos_setores VALUES
          (16,6,137,11,NULL,NULL),
          (27,6,25,10,NULL,NULL),
          (700,7,725,10,NULL,NULL);
        INSERT INTO funcionarios VALUES
          (100,6,'ATIVO',1,NULL),
          (116,6,'INATIVO',0,NULL),
          (124,6,'INATIVO',0,NULL),
          (101,6,'ATIVO',1,NULL),
          (777,7,'ATIVO',1,NULL);
        INSERT INTO qualificacoes_historico VALUES
          (4781,6,116,137,'MNT_ARTIGOS_PERIGOSOS','Artigos Perigosos',NULL,NULL,'VENCIDA','2022-06-12','2024-06-12','CERT-MNT-1',NULL,NULL),
          (4782,6,124,137,'MNT_ARTIGOS_PERIGOSOS','Artigos Perigosos',NULL,NULL,'VENCIDA','2022-06-12','2024-06-12','CERT-MNT-2',NULL,NULL),
          (4649,6,101,137,'MNT_ARTIGOS_PERIGOSOS','Artigos Perigosos',NULL,'PTM 20.12','VENCIDA','2022-04-20','2024-04-20','CERT-ARCHIVE','2026-10-27',NULL),
          (7001,7,777,725,'D4','DGR Outra Empresa',NULL,NULL,'VALIDA','2025-01-01','2027-01-01','CERT-OTHER',NULL,NULL);
        INSERT INTO treinamento_requisitos VALUES
          (220,6,137,'FUNCAO',36,NULL,'OBRIGATORIA',1,NULL,NULL),
          (492,6,25,'FUNCAO',44,'PTAP_COORDENADOR_VOO','OBRIGATORIA',1,NULL,NULL),
          (496,6,25,'FUNCAO',2,'PTAP_TRIPULANTE_VOO','OBRIGATORIA',1,NULL,NULL);
      `);
      for (let i = 0; i < 39; i++) {
        db.prepare(`
          INSERT INTO qualificacoes_historico
          (id,empresa_id,funcionario_id,qualificacao_id,qualificacao_codigo,tipo,perfil_competencia,status,
           data_conclusao,data_vencimento,numero_certificado)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).run(10000+i,6,100,25,'D4','DGR','PTAP_TRIPULANTE_VOO','VALIDA','2025-01-01','2027-01-01','CERT-'+i);
      }
      db.exec('BEGIN IMMEDIATE');
      db.exec(read(sqlPath));
      db.exec('COMMIT');
      const scalar = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
      expect(scalar('SELECT COUNT(*) n FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=25 AND deleted_at IS NULL')).toBe(41);
      expect(scalar('SELECT COUNT(*) n FROM qualificacoes_historico WHERE empresa_id=6 AND qualificacao_id=137 AND deleted_at IS NULL')).toBe(0);
      expect(scalar("SELECT COUNT(*) n FROM qualificacoes_historico WHERE id IN (4781,4782) AND perfil_competencia='PTAP_MNT_LEGACY_NAO_HOMOLOGADO' AND qualificacao_codigo='MNT_ARTIGOS_PERIGOSOS' AND numero_certificado LIKE 'CERT-MNT-%' AND status='VENCIDA'")).toBe(2);
      expect(scalar("SELECT COUNT(*) n FROM treinamento_requisitos WHERE id=220 AND qualificacao_tipo_id=25 AND perfil_competencia='PTAP_MNT_SUPRIMENTOS' AND ativo=1")).toBe(1);
      expect(scalar("SELECT COUNT(*) n FROM qualificacoes_historico h JOIN treinamento_requisitos r ON r.id=220 AND r.qualificacao_tipo_id=h.qualificacao_id WHERE h.id IN (4781,4782) AND h.perfil_competencia=r.perfil_competencia")).toBe(0);
      expect(scalar("SELECT COUNT(*) n FROM qualificacoes_historico WHERE id=4649 AND qualificacao_id=137 AND deleted_at IS NOT NULL")).toBe(1);
      expect(scalar("SELECT COUNT(*) n FROM qualificacoes_tipos WHERE id=137 AND ativo=0 AND deleted_at IS NOT NULL")).toBe(1);
      expect(scalar("SELECT COUNT(*) n FROM qualificacoes_tipos WHERE id=25 AND nome='Treinamento de Artigos Perigosos para o Transporte Aéreo'")).toBe(1);
      expect(scalar("SELECT COUNT(*) n FROM qualificacoes_historico WHERE empresa_id=7 AND qualificacao_id=725 AND id=7001")).toBe(1);
      expect(scalar('SELECT COUNT(*) n FROM qualificacoes_tipos_setores WHERE empresa_id=6 AND tipo_id=25 AND setor_id IN (10,11) AND deleted_at IS NULL')).toBe(2);
      expect(scalar('SELECT COUNT(*) n FROM qualificacoes_tipos_setores WHERE empresa_id=6 AND tipo_id=137 AND deleted_at IS NULL')).toBe(0);
      expect(scalar('SELECT COUNT(*) n FROM pragma_foreign_key_check')).toBe(0);
    } finally {
      db.close();
    }
  });
});
