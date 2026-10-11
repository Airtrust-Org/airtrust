#!/usr/bin/env python3
"""OFFLINE rehearsal of a potential Native V1 catalog CHECK rebuild.

This intentionally NEVER connects to Cloudflare, writes schema files, exports
production data, or produces an apply SQL bundle. It consumes an approved
read-only sqlite_master DDL snapshot, tests a rebuild against synthetic records
in an in-memory SQLite database, and emits only anonymous counts/hashes.

A successful rehearsal is NOT migration authorization: a dedicated, governed
executor with recovery/provenance is still required for D1 staging/production.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

EXPECTED_CHECK = re.compile(
    r"CHECK\s*\(\s*tipo_conteudo\s+IN\s*\(\s*"
    r"'scorm'\s*,\s*'h5p'\s*,\s*'video'\s*,\s*'pdf'\s*,\s*'pptx'\s*"
    r"\)\s*\)", re.I,
)
TABLE_START = re.compile(
    r'^\s*CREATE\s+TABLE\s+(?:"lms_cursos"|lms_cursos)\s*\(', re.I,
)
OBJECT_NAME = re.compile(r"^[a-z][a-z0-9_]{0,127}$", re.I)
SHA = re.compile(r"^[a-f0-9]{64}$")


class CatalogRehearsalError(ValueError):
    pass


def fail(code: str):
    raise CatalogRehearsalError(code)


def digest(raw: str) -> str:
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def parse_snapshot(snapshot: list, expected_digest: str):
    if not isinstance(expected_digest, str) or not SHA.fullmatch(expected_digest):
        fail('CATALOG_EXPECTED_SHA_REQUIRED')
    if not isinstance(snapshot, list) or not 1 <= len(snapshot) <= 10:
        fail('CATALOG_INVALID_SNAPSHOT')
    rows = []
    for part in snapshot:
        if not isinstance(part, dict) or not isinstance(part.get('results'), list):
            fail('CATALOG_INVALID_RESULT')
        for row in part['results']:
            if not isinstance(row, dict) or row.get('type') not in (
                'table', 'index', 'trigger',
            ) or not isinstance(row.get('name'), str) or not OBJECT_NAME.fullmatch(
                row['name']
            ) or not isinstance(row.get('sql'), str) or not row['sql'].strip():
                fail('CATALOG_INVALID_OBJECT')
            rows.append({k: row[k] for k in ('type','name','sql')})
    rows.sort(key=lambda r: (r['type'], r['name']))
    if len(rows) != 12 or len({r['name'] for r in rows}) != 12:
        fail('CATALOG_SCHEMA_OBJECT_COUNT_OR_DUPLICATE')
    tables = [r for r in rows if r['type']=='table' and r['name']=='lms_cursos']
    indexes = [r for r in rows if r['type']=='index']
    triggers = [r for r in rows if r['type']=='trigger']
    if len(tables)!=1 or len(indexes)!=6 or len(triggers)!=5:
        fail('CATALOG_SCHEMA_INVENTORY_DRIFT')
    if any(r['type']=='table' and r['name']!='lms_cursos' for r in rows):
        fail('CATALOG_EXTRA_TABLE')
    table_sql = tables[0]['sql']
    if not TABLE_START.match(table_sql) or len(EXPECTED_CHECK.findall(table_sql))!=1:
        fail('CATALOG_CHECK_UNEXPECTED')
    # Same [type,name,sql] shape and compact encoding as the existing
    # scripts/schema-v2/native-v1-catalog-readonly-preflight.mjs checker.
    fingerprint = digest(json.dumps([
        [r['type'],r['name'],r['sql']] for r in rows
    ], ensure_ascii=False, separators=(',',':')))
    if fingerprint != expected_digest:
        fail('CATALOG_SNAPSHOT_DRIFT')
    for row in indexes:
        if not re.match(r'^CREATE\s+(?:UNIQUE\s+)?INDEX\s+',row['sql'],re.I):
            fail('CATALOG_INDEX_UNEXPECTED')
    for row in triggers:
        if not re.match(r'^CREATE\s+TRIGGER\s+',row['sql'],re.I):
            fail('CATALOG_TRIGGER_UNEXPECTED')
    return table_sql, indexes, triggers, fingerprint


def create_synthetic_db(table_sql: str, indexes: list, triggers: list) -> sqlite3.Connection:
    db=sqlite3.connect(':memory:',isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript("""
        CREATE TABLE empresas (id INTEGER PRIMARY KEY);
        CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY);
        CREATE TABLE qualificacoes_formatos (id INTEGER PRIMARY KEY);
        CREATE TABLE qualificacoes_categorias (id INTEGER PRIMARY KEY);
    """)
    db.execute(table_sql)
    db.execute("INSERT INTO empresas(id) VALUES (6)")
    db.execute("INSERT INTO lms_cursos(id,empresa_id,titulo,tipo_conteudo) "
               "VALUES(1,6,'Treinamento sintético','scorm')")
    # Check preservation of AUTOINCREMENT even when a former high ID has
    # been deleted from the original table.
    db.execute("INSERT INTO lms_cursos(id,empresa_id,titulo) VALUES "
               "(900,6,'Registro sintético descartado')")
    db.execute("DELETE FROM lms_cursos WHERE id=900")
    db.executescript("""
      CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY,
        curso_id INTEGER REFERENCES lms_cursos(id) ON DELETE NO ACTION);
      CREATE TABLE lms_cursos_setores (id INTEGER PRIMARY KEY,
        curso_id INTEGER REFERENCES lms_cursos(id) ON DELETE NO ACTION);
      CREATE TABLE lms_scorm_package_versions (id INTEGER PRIMARY KEY,
        curso_id INTEGER REFERENCES lms_cursos(id) ON DELETE NO ACTION);
      INSERT INTO lms_matriculas VALUES(101,1);
      INSERT INTO lms_cursos_setores VALUES(201,1);
      INSERT INTO lms_scorm_package_versions VALUES(301,1);
    """)
    for object_ in indexes+triggers:
        db.execute(object_['sql'])
    return db


def rehearse_snapshot(snapshot: list, expected_hash: str,
                      inject_fault_after_drop: bool=False) -> dict:
    table_sql,indexes,triggers,fingerprint=parse_snapshot(snapshot,expected_hash)
    db=create_synthetic_db(table_sql,indexes,triggers)
    try:
        original_seq=db.execute(
            "SELECT seq FROM sqlite_sequence WHERE name='lms_cursos'"
        ).fetchone()[0]
        original_catalog_count=db.execute(
            "SELECT COUNT(*) FROM lms_cursos"
        ).fetchone()[0]
        original_ddl=table_sql
        match=EXPECTED_CHECK.search(original_ddl)
        assert match
        native_check=match.group(0).replace("'pptx'","'pptx', 'native'")
        new_sql=EXPECTED_CHECK.sub(lambda _:native_check,original_ddl)
        new_sql=TABLE_START.sub('CREATE TABLE "lms_cursos__native_tmp" (',new_sql,count=1)
        columns=[row[1] for row in db.execute('PRAGMA table_xinfo(lms_cursos)')]
        if not columns or len(columns)!=len(set(columns)) or any(
            not OBJECT_NAME.fullmatch(col) for col in columns
        ):
            fail('CATALOG_COLUMNS_UNEXPECTED')
        names=','.join('"' + name + '"' for name in columns)
        db.execute('PRAGMA foreign_keys=OFF')
        db.execute('BEGIN IMMEDIATE')
        try:
            db.execute(new_sql)
            db.execute(
                f'INSERT INTO lms_cursos__native_tmp ({names}) '
                f'SELECT {names} FROM lms_cursos'
            )
            db.execute('DROP TABLE lms_cursos')
            if inject_fault_after_drop:
                raise RuntimeError('SYNTHETIC_INJECTED_FAILURE')
            db.execute('ALTER TABLE lms_cursos__native_tmp RENAME TO lms_cursos')
            for object_ in indexes+triggers:
                db.execute(object_['sql'])
            db.execute(
                "UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='lms_cursos'",
                (original_seq,),
            )
            if db.execute('SELECT COUNT(*) FROM lms_cursos').fetchone()[0] != original_catalog_count:
                fail('CATALOG_ROW_COUNT_CHANGED')
            if db.execute('PRAGMA foreign_key_check').fetchall():
                fail('CATALOG_FK_CHECK_FAILED')
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                fail('CATALOG_INTEGRITY_CHECK_FAILED')
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.execute('PRAGMA foreign_keys=ON')

        # The synthetic child references remain valid on the ORIGINAL table
        # name. All 11 dependent definitions must survive byte-for-byte.
        ddl=db.execute(
            "SELECT sql FROM sqlite_master WHERE name='lms_cursos'"
        ).fetchone()[0]
        if "'native'" not in ddl or db.execute('PRAGMA foreign_key_check').fetchall():
            fail('CATALOG_POST_REBUILD_INVALID')
        for object_ in indexes+triggers:
            row=db.execute('SELECT sql FROM sqlite_master WHERE name=?',
                           (object_['name'],)).fetchone()
            if not row or row[0]!=object_['sql']:
                fail('CATALOG_DEPENDENCY_CHANGED')
        db.execute("UPDATE lms_cursos SET tipo_conteudo='native' WHERE id=1")
        if db.execute('SELECT tipo_conteudo FROM lms_cursos WHERE id=1').fetchone()[0]!='native':
            fail('CATALOG_NATIVE_WRITE_REJECTED')
        if db.execute('SELECT seq FROM sqlite_sequence WHERE name=?',
                      ('lms_cursos',)).fetchone()[0] < original_seq:
            fail('CATALOG_AUTOINCREMENT_REGRESSED')
        return {
            'schema': 'AIRTRUST_NATIVE_CATALOG_OFFLINE_REHEARSAL_V1',
            'snapshotHash': fingerprint,
            'offlineOnly': True,
            'migrationPrepared': False,
            'remoteMutationPerformed': False,
            'catalogRowCountPreserved': original_catalog_count,
            'originalAutoincrementPreserved': True,
            'foreignKeyCheck': 'PASS',
            'integrityCheck': 'PASS',
            'dependentDefinitionsPreserved':len(indexes)+len(triggers),
            'syntheticNativeWrite':'PASS',
            'requiresDedicatedGovernedD1Executor':True,
        }
    finally:
        db.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot_json',type=Path)
    parser.add_argument('expected_sha256')
    args=parser.parse_args()
    try:
        report=rehearse_snapshot(
            json.loads(args.snapshot_json.read_text(encoding='utf8')),
            args.expected_sha256,
        )
    except (CatalogRehearsalError,sqlite3.Error,OSError,ValueError) as error:
        parser.exit(2,'OFFLINE_REHEARSAL_REJECTED: '+str(error)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
