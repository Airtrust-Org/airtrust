#!/usr/bin/env python3
"""Offline-only Native Schema V2 preflight on a read-only sqlite_master snapshot.

Input is the JSON result of a SELECT name,sql FROM sqlite_master query
containing TABLE DDL ONLY. This program never connects to Cloudflare, uses
no credentials and executes all SQL against SQLite :memory: exclusively.

Example read-only collection, in an AUTHORIZED staging context:
 wrangler d1 execute <staging-db> --env staging --remote --json \\
   --command "SELECT name,sql FROM sqlite_master WHERE type='table' AND
    name IN (...the required tables...)" > /tmp/airtrust-native-ddl.json
 python3 scripts/ops/rehearse-native-schema-from-staging-snapshot.py \\
   --snapshot /tmp/airtrust-native-ddl.json
Delete the temporary snapshot afterwards. Never use remote --file/--command
writes to rehearse Schema V2; this is not an apply or deployment tool.
"""
import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL_0550 = ROOT / 'worker-airtrust/schema-v2/changes/0553_lms_native_v1_evidence.sql'
SQL_0551 = ROOT / 'worker-airtrust/schema-v2/plans/lms-native-catalog-activation-0555.REVIEW-ONLY.sql.txt'
SQL_0553 = ROOT / 'worker-airtrust/schema-v2/plans/lms-native-canonical-completion-0556.REVIEW-ONLY.sql.txt'

REQUIRED_TABLES = frozenset({
    'empresas', 'funcionarios', 'usuarios', 'lms_cursos', 'lms_matriculas',
    'lms_matricula_ciclos', 'lms_scorm_package_versions',
    'qualificacoes_tipos', 'qualificacoes_historico', 'qualificacoes_categorias',
    'lms_historico_importado', 'qualificacoes_formatos',
})
REQUIRED_COLUMNS = {
    'funcionarios': {'id','empresa_id','ativo','status','deleted_at'},
    'usuarios': {'id','funcionario_id','active','deleted_at'},
    'lms_cursos': {'id','empresa_id','tipo_conteudo','scorm_launch_file',
                   'scorm_package_r2_prefix','ativo','publicado','deleted_at'},
    'lms_matriculas': {'id','empresa_id','curso_id','funcionario_id','status',
                      'progresso_pct','data_conclusao','qualificacao_historico_id','deleted_at'},
    'lms_matricula_ciclos': {'id','matricula_id','curso_id','empresa_id',
                            'funcionario_id','status','ciclo_atual',
                            'progresso_pct','data_conclusao','qualificacao_historico_id','deleted_at'},
    'lms_scorm_package_versions': {'id','curso_id'},
}

def parse_snapshot(payload):
    chunks = payload if isinstance(payload, list) else [payload]
    if not chunks or any(not isinstance(x,dict) or x.get('success') is False for x in chunks):
        raise ValueError('NATIVE_SCHEMA_SNAPSHOT_INVALID')
    rows = [r for chunk in chunks for r in chunk.get('results',[])]
    if not rows or any(not isinstance(r,dict) for r in rows):
        raise ValueError('NATIVE_SCHEMA_SNAPSHOT_EMPTY')
    names = [r.get('name') for r in rows]
    if len(names) != len(set(names)) or set(names) != REQUIRED_TABLES:
        raise ValueError('NATIVE_SCHEMA_TABLE_SCOPE_DRIFT')
    result={}
    for r in rows:
        name,sql=r['name'],r.get('sql')
        if not isinstance(sql,str) or not re.match(
            r'^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?'+re.escape(name)+r'"?|\['+
              re.escape(name)+r'\])\s*\(', sql, flags=re.I,
        ):
            raise ValueError('NATIVE_SCHEMA_TABLE_DDL_INVALID:'+str(name))
        # DB-sourced sqlite_master table SQL, not arbitrary commands or DML.
        if ';' in sql.rstrip().rstrip(';'):
            raise ValueError('NATIVE_SCHEMA_MULTISTATEMENT_REJECTED:'+name)
        result[name]=sql
    return result

def rehearse(snapshot):
    ddl = parse_snapshot(snapshot)
    db=sqlite3.connect(':memory:')
    try:
        db.execute('PRAGMA foreign_keys=ON')
        assert db.execute('PRAGMA foreign_keys').fetchone()[0] == 1
        for name in sorted(ddl):
            db.execute(ddl[name])
        for name,required in REQUIRED_COLUMNS.items():
            columns={row[1] for row in db.execute('PRAGMA table_info("'+name+'")')}
            if not required <= columns:
                raise ValueError('NATIVE_SCHEMA_COLUMN_DRIFT:'+name+
                                 ':'+','.join(sorted(required-columns)))
        # Never apply or modify versioned migration SQL in the rehearsal.
        db.executescript(SQL_0550.read_text(encoding='utf8'))
        db.executescript(SQL_0551.read_text(encoding='utf8'))
        db.executescript(SQL_0553.read_text(encoding='utf8'))
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('NATIVE_SCHEMA_FK_CHECK_FAILED')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('NATIVE_SCHEMA_INTEGRITY_CHECK_FAILED')
        native_table_count=db.execute("""
          SELECT COUNT(*) FROM sqlite_master
          WHERE type='table' AND name IN (
            'lms_native_edicoes','lms_native_matricula_edicoes',
            'lms_native_eventos','lms_native_tentativas',
            'lms_native_catalog_activation','lms_native_enrollment_intents',
            'lms_native_uncommittable_intent_guard',
            'lms_native_completion_intents')
        """).fetchone()[0]
        if native_table_count != 8:
            raise ValueError('NATIVE_SCHEMA_OBJECT_COUNT_DRIFT')
        fingerprint=hashlib.sha256(
            '\n'.join(ddl[k] for k in sorted(ddl)).encode('utf8')
        ).hexdigest()
        return {'staging_ddl_sha256':fingerprint,'base_tables':len(ddl),
                'native_tables':native_table_count,'fk_check':'ok',
                'integrity_check':'ok','mode':'OFFLINE_ONLY',
                'applied_concepts':['0550','0551_REVIEW_ONLY','0553_REVIEW_ONLY']}
    finally:
        db.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot',type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(rehearse(json.loads(args.snapshot.read_text(encoding='utf8'))),
                     sort_keys=True))

if __name__ == '__main__':
    main()
