// source_reference: #1426/#1373; canonical team-roster SQL, synthetic SQLite only.
// operational_decision: preserve real check-ins/journeys even without fortnight assignment.
// dry_run_required: in-memory read-only regression; rollback_plan_required: no remote writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const source = readFileSync(new URL('../../worker-airtrust/src/lib/frms/daily-fatigue-team-roster.ts', import.meta.url), 'utf8');
const sql = source.split('.prepare(')[1]?.split(String.fromCharCode(96))[1]?.replace('$'+'{params.sectorScope.clause}', '1=1');
assert.ok(sql, 'canonical roster query not found');

test('scope and membership contract rejects cross-tenant journeys', () => {
  assert.match(sql, /LEFT JOIN current_fortnight cf/);
  assert.match(sql, /fj\.empresa_id\s*=\s*f\.empresa_id/);
  assert.match(sql, /f\.nome ASC,\s*f\.id ASC/);
  assert.match(sql, /ch\.empresa_id\s*=\s*f\.empresa_id/);
  assert.match(sql, /f\.empresa_id\s*=\s*\?/);
  assert.match(sql, /cf\.numero IS NOT NULL OR fj\.id IS NOT NULL OR ch\.id IS NOT NULL/);
});

test('synthetic SQLite returns reported crew even without fortnight, not foreign-tenant crew', () => {
  const py = [
    'import json,sqlite3,sys',
    "q=json.load(sys.stdin)['sql']",
    "db=sqlite3.connect(':memory:')",
    'db.row_factory=sqlite3.Row',
    'db.executescript("""',
    'CREATE TABLE escalas_quinzenas(numero INTEGER,data_inicio TEXT,data_fim TEXT,empresa_id INTEGER,deleted_at TEXT);',
    'CREATE TABLE funcionarios(id INTEGER,empresa_id INTEGER,nome TEXT,cargo TEXT,funcao TEXT,quinzena TEXT,deleted_at TEXT,ativo INTEGER,status TEXT);',
    'CREATE TABLE frms_jornada(id TEXT,empresa_id INTEGER,tripulante_id INTEGER,data TEXT,status TEXT,deleted_at TEXT);',
    'CREATE TABLE frms_fadiga_checkin(id TEXT,empresa_id INTEGER,funcionario_id INTEGER,data_checkin TEXT,deleted_at TEXT,jornada_inicio_prevista TEXT,hora_checkin TEXT,kss_score INTEGER,horas_sono REAL,horas_sono_48h REAL,wake_time TEXT,score_fadiga INTEGER,nivel_fadiga TEXT,status_operacional TEXT,computed_risk_level TEXT,requires_operational_review INTEGER);',
    "INSERT INTO escalas_quinzenas VALUES(1,'2026-10-16','2026-10-31',999006,NULL);",
    "INSERT INTO funcionarios VALUES(7,999006,'Escalado','PILOTO','PILOTO','primeira',NULL,1,'ATIVO');",
    "INSERT INTO funcionarios VALUES(1,999006,'Escalado','PILOTO','PILOTO','primeira',NULL,1,'ATIVO');",
    "INSERT INTO funcionarios VALUES(2,999006,'Checkin sem quinzena','PILOTO','PILOTO',NULL,NULL,1,'ATIVO');",
    "INSERT INTO funcionarios VALUES(3,999006,'Jornada de outro tenant','PILOTO','PILOTO',NULL,NULL,1,'ATIVO');",
    "INSERT INTO funcionarios VALUES(4,999006,'Jornada quinzena diferente','COMANDANTE','COMANDANTE','segunda',NULL,1,'ATIVO');",
    "INSERT INTO funcionarios VALUES(5,999006,'Sem escala nem atividade','COPILOTO','COPILOTO',NULL,NULL,1,'ATIVO');",
    "INSERT INTO funcionarios VALUES(6,999007,'Outro tenant','PILOTO','PILOTO','primeira',NULL,1,'ATIVO');",
    "INSERT INTO frms_fadiga_checkin(id,empresa_id,funcionario_id,data_checkin,kss_score) VALUES('c2',999006,2,'2026-10-27',3);",
    "INSERT INTO frms_fadiga_checkin(id,empresa_id,funcionario_id,data_checkin,kss_score) VALUES('c6',999007,6,'2026-10-27',9);",
    "INSERT INTO frms_jornada VALUES('j3-foreign',999007,3,'2026-10-27','ES',NULL);",
    "INSERT INTO frms_jornada VALUES('j4',999006,4,'2026-10-27','ES',NULL);",
    '""")',
    "day='2026-10-27'",
    'args=(999006,day,day,day,999006,100,0)',
    'rows=db.execute(q,args).fetchall()',
    "ids={int(row['funcionario_id']) for row in rows}",
    "assert ids=={1,2,4,7},'unexpected synthetic scope: '+repr(ids)",
    "assert next(x for x in rows if x['funcionario_id']==2)['checkin_id']=='c2'",
    "assert next(x for x in rows if x['funcionario_id']==4)['jornada_id']=='j4'",
    'assert len(db.execute(q,(999006,day,day,day,999006,2,0)).fetchall())==2',
    "assert db.execute(q,(999006,day,day,day,999006,1,2)).fetchone()['funcionario_id']==1,'tie-break page 3 must be crew 1'",
    "assert db.execute(q,(999006,day,day,day,999006,1,3)).fetchone()['funcionario_id']==7,'tie-break page 4 must be crew 7'",
    "print('FRMS_DAILY_ROSTER_SQLITE_PASS')",
  ].join('\n');
  const result = spawnSync('python3', ['-c', py], { input: JSON.stringify({sql}), encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /FRMS_DAILY_ROSTER_SQLITE_PASS/);
});
