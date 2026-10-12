#!/usr/bin/env python3
"""OFFLINE ONLY: rehearse an FK-safe Native catalog activation table.

This never creates a deployable migration, Cloudflare request, R2 object,
authorization for activation, or mutation of an existing course. It uses the
fingerprinted read-only staging DDL and entirely fictitious enrollment rows.
"""
from __future__ import annotations

import argparse
import json
import runpy
import sqlite3
from pathlib import Path

HELPERS = runpy.run_path(str(Path(__file__).with_name('rehearse-native-catalog-rebuild.py')))
parse_snapshot = HELPERS['parse_snapshot']
create_synthetic_db = HELPERS['create_synthetic_db']

# Design candidate only. This is deliberately NOT stored in schema-v2/changes.
ACTIVATION_DDL = """
CREATE TABLE lms_native_catalog_activation (
  curso_id INTEGER PRIMARY KEY REFERENCES lms_cursos(id) ON DELETE RESTRICT,
  empresa_id INTEGER NOT NULL CHECK(empresa_id > 0),
  activated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER trg_native_catalog_activation_insert BEFORE INSERT ON lms_native_catalog_activation
BEGIN
  SELECT RAISE(ABORT,'NATIVE_CATALOG_TENANT_OR_SOURCE_CONFLICT')
    WHERE NOT EXISTS (
      SELECT 1 FROM lms_cursos c
       WHERE c.id=NEW.curso_id AND c.empresa_id=NEW.empresa_id
         AND c.tipo_conteudo='scorm' AND c.deleted_at IS NULL
         AND NULLIF(TRIM(COALESCE(c.scorm_launch_file,'')),'') IS NULL
         AND NULLIF(TRIM(COALESCE(c.scorm_package_r2_prefix,'')),'') IS NULL
    );
  SELECT RAISE(ABORT,'NATIVE_CATALOG_PREEXISTING_ENROLLMENT')
    WHERE EXISTS (SELECT 1 FROM lms_matriculas m WHERE m.curso_id=NEW.curso_id);
  SELECT RAISE(ABORT,'NATIVE_CATALOG_PREEXISTING_SCORM_PACKAGE')
    WHERE EXISTS (SELECT 1 FROM lms_scorm_package_versions v WHERE v.curso_id=NEW.curso_id);
END;
CREATE TRIGGER trg_native_catalog_activation_immutable_update
BEFORE UPDATE ON lms_native_catalog_activation
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_ACTIVATION_IMMUTABLE'); END;
CREATE TRIGGER trg_native_catalog_activation_immutable_delete
BEFORE DELETE ON lms_native_catalog_activation
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_ACTIVATION_IMMUTABLE'); END;
CREATE TRIGGER trg_native_catalog_course_format_lock BEFORE UPDATE ON lms_cursos
WHEN EXISTS (SELECT 1 FROM lms_native_catalog_activation marker WHERE marker.curso_id=OLD.id)
  AND (NEW.empresa_id != OLD.empresa_id OR NEW.tipo_conteudo != OLD.tipo_conteudo
    OR NEW.scorm_launch_file IS NOT OLD.scorm_launch_file
    OR NEW.scorm_package_r2_prefix IS NOT OLD.scorm_package_r2_prefix)
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_COURSE_FORMAT_LOCKED'); END;
-- This offline pilot is deliberately enrollment-frozen until a governed,
-- atomic Native enrollment + edition-pin contract supersedes these triggers.
CREATE TRIGGER trg_native_catalog_no_legacy_enrollment_insert
BEFORE INSERT ON lms_matriculas
WHEN EXISTS (SELECT 1 FROM lms_native_catalog_activation a WHERE a.curso_id=NEW.curso_id)
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_ENROLLMENT_REQUIRES_NATIVE_PIN'); END;
CREATE TRIGGER trg_native_catalog_no_legacy_enrollment_retarget
BEFORE UPDATE OF curso_id ON lms_matriculas
WHEN EXISTS (SELECT 1 FROM lms_native_catalog_activation a WHERE a.curso_id=NEW.curso_id)
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_ENROLLMENT_REQUIRES_NATIVE_PIN'); END;
CREATE TRIGGER trg_native_catalog_no_scorm_version_insert
BEFORE INSERT ON lms_scorm_package_versions
WHEN EXISTS (SELECT 1 FROM lms_native_catalog_activation a WHERE a.curso_id=NEW.curso_id)
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_SCORM_VERSION_DENIED'); END;
CREATE TRIGGER trg_native_catalog_no_scorm_version_retarget
BEFORE UPDATE OF curso_id ON lms_scorm_package_versions
WHEN EXISTS (SELECT 1 FROM lms_native_catalog_activation a WHERE a.curso_id=NEW.curso_id)
BEGIN SELECT RAISE(ABORT,'NATIVE_CATALOG_SCORM_VERSION_DENIED'); END;
"""

def fixture(snapshot: list, sha: str) -> tuple[sqlite3.Connection, list, str]:
    ddl, indexes, triggers, fingerprint = parse_snapshot(snapshot, sha)
    db = create_synthetic_db(ddl, indexes, triggers)
    # Qualification triggers from the staging DDL need these synthetically
    # shaped ancillary columns before inserting a second, empty course.
    for table, columns in (
        ('qualificacoes_tipos', ('empresa_id INTEGER','categoria_id INTEGER',
            'deleted_at TEXT','dominio_codigo TEXT')),
        ('qualificacoes_categorias', ('empresa_id INTEGER','ativo INTEGER',
            'deleted_at TEXT','nome TEXT','dominio_codigo TEXT')),
    ):
        for column in columns:
            db.execute(f'ALTER TABLE {table} ADD COLUMN {column}')
    # The staging schema provides these fields. Older reduced SQL fixtures
    # must be rejected, never silently modified to appear equivalent.
    required = {'id','empresa_id','tipo_conteudo','deleted_at',
                'scorm_launch_file','scorm_package_r2_prefix'}
    existing = {row[1] for row in db.execute('PRAGMA table_info(lms_cursos)')}
    if not required.issubset(existing):
        db.close()
        raise ValueError('NATIVE_ACTIVATION_REQUIRED_CATALOG_COLUMNS_MISSING')
    before = [(o['name'], db.execute(
        'SELECT sql FROM sqlite_master WHERE name=?', (o['name'],)).fetchone()[0])
        for o in indexes + triggers]
    return db, before, fingerprint

def ensure_refused(db: sqlite3.Connection, sql: str, params: tuple, expected: str) -> None:
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError as error:
        if expected not in str(error):
            raise AssertionError('NATIVE_ACTIVATION_UNEXPECTED_REJECTION') from error
    else:
        raise AssertionError('NATIVE_ACTIVATION_UNSAFE_WRITE_ACCEPTED')

def rehearse_marker_table(snapshot: list, expected_sha: str) -> dict:
    db, original_objects, fingerprint = fixture(snapshot, expected_sha)
    try:
        assert db.execute('PRAGMA foreign_keys').fetchone()[0] == 1
        original_ddl = db.execute(
            "SELECT sql FROM sqlite_master WHERE name='lms_cursos'"
        ).fetchone()[0]
        db.executescript(ACTIVATION_DDL)
        db.execute("INSERT INTO lms_cursos(id,empresa_id,titulo,tipo_conteudo)"
                   " VALUES(2,6,'Novo curso Native sintético','scorm')")
        ensure_refused(db,
            "INSERT INTO lms_native_catalog_activation(curso_id,empresa_id) VALUES(?,?)",
            (2,7),'NATIVE_CATALOG_TENANT_OR_SOURCE_CONFLICT')
        ensure_refused(db,
            "INSERT INTO lms_native_catalog_activation(curso_id,empresa_id) VALUES(?,?)",
            (1,6),'NATIVE_CATALOG_PREEXISTING_ENROLLMENT')
        db.execute("UPDATE lms_cursos SET scorm_launch_file='index.html' WHERE id=2")
        ensure_refused(db,
            "INSERT INTO lms_native_catalog_activation(curso_id,empresa_id) VALUES(?,?)",
            (2,6),'NATIVE_CATALOG_TENANT_OR_SOURCE_CONFLICT')
        db.execute("UPDATE lms_cursos SET scorm_launch_file=NULL WHERE id=2")
        db.execute("INSERT INTO lms_native_catalog_activation(curso_id,empresa_id)"
                   " VALUES(2,6)")
        # D1 integrity gates close even if an old background job bypasses
        # an HTTP route. Neither legacy enrollment nor SCORM versioning may
        # mutate this new course during the pre-Native-pinning pilot.
        ensure_refused(db,
            "INSERT INTO lms_matriculas(id,curso_id) VALUES(?,?)",
            (102,2),'NATIVE_CATALOG_ENROLLMENT_REQUIRES_NATIVE_PIN')
        ensure_refused(db,
            "UPDATE lms_matriculas SET curso_id=? WHERE id=?",
            (2,101),'NATIVE_CATALOG_ENROLLMENT_REQUIRES_NATIVE_PIN')
        ensure_refused(db,
            "INSERT INTO lms_scorm_package_versions(id,curso_id) VALUES(?,?)",
            (302,2),'NATIVE_CATALOG_SCORM_VERSION_DENIED')
        ensure_refused(db,
            "UPDATE lms_scorm_package_versions SET curso_id=? WHERE id=?",
            (2,301),'NATIVE_CATALOG_SCORM_VERSION_DENIED')
        # A scoped effective-type projection can distinguish the NEW Native
        # course while preserving the physical legacy CHECK and its records.
        marker = db.execute("""
           SELECT c.tipo_conteudo,
             CASE WHEN a.curso_id IS NOT NULL THEN 'native' ELSE c.tipo_conteudo END
           FROM lms_cursos c LEFT JOIN lms_native_catalog_activation a
             ON a.curso_id=c.id AND a.empresa_id=c.empresa_id
           WHERE c.id=2 AND c.empresa_id=6
        """).fetchone()
        legacy = db.execute("""
           SELECT c.tipo_conteudo,
             CASE WHEN a.curso_id IS NOT NULL THEN 'native' ELSE c.tipo_conteudo END
           FROM lms_cursos c LEFT JOIN lms_native_catalog_activation a
             ON a.curso_id=c.id AND a.empresa_id=c.empresa_id
           WHERE c.id=1 AND c.empresa_id=6
        """).fetchone()
        if marker != ('scorm','native') or legacy != ('scorm','scorm'):
            raise AssertionError('NATIVE_ACTIVATION_CLASSIFIER_FAILED')
        ensure_refused(db,"UPDATE lms_cursos SET tipo_conteudo='h5p' WHERE id=?",
                       (2,),'NATIVE_CATALOG_COURSE_FORMAT_LOCKED')
        ensure_refused(db,"UPDATE lms_cursos SET scorm_launch_file='index.html' WHERE id=?",
                       (2,),'NATIVE_CATALOG_COURSE_FORMAT_LOCKED')
        ensure_refused(db,"DELETE FROM lms_native_catalog_activation WHERE curso_id=?",
                       (2,),'NATIVE_CATALOG_ACTIVATION_IMMUTABLE')
        ensure_refused(db,"UPDATE lms_native_catalog_activation SET empresa_id=7 WHERE curso_id=?",
                       (2,),'NATIVE_CATALOG_ACTIVATION_IMMUTABLE')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise AssertionError('NATIVE_ACTIVATION_FK_BROKEN')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise AssertionError('NATIVE_ACTIVATION_INTEGRITY_BROKEN')
        if db.execute("SELECT sql FROM sqlite_master WHERE name='lms_cursos'"
                     ).fetchone()[0] != original_ddl:
            raise AssertionError('NATIVE_ACTIVATION_CATALOG_DDL_MODIFIED')
        for name, before in original_objects:
            if db.execute('SELECT sql FROM sqlite_master WHERE name=?',
                          (name,)).fetchone()[0] != before:
                raise AssertionError('NATIVE_ACTIVATION_LEGACY_DEPENDENCY_MODIFIED')
        return {
            'schema': 'AIRTRUST_NATIVE_CATALOG_ACTIVATION_TABLE_OFFLINE_REHEARSAL_V1',
            'snapshotHash': fingerprint,
            'foreignKeysKeptOn': True, 'foreignKeyCheck': 'PASS',
            'integrityCheck': 'PASS',
            'originalDependentObjectsPreserved': len(original_objects),
            'nativeEffectiveIdentityOnNewCourse': True,
            'preexistingScormEnrollmentPreserved': True,
            'newLegacyEnrollmentAndScormVersionsDenied': True,
            'preexistingScormCourseIsNotNative': True,
            'legacyRoutesStillRequireNativeExclusion': True,
            'migrationPrepared': False, 'remoteMutationPerformed': False,
            'approvalForActivation': False,
        }
    finally:
        db.close()

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot_json', type=Path)
    parser.add_argument('expected_sha256')
    args = parser.parse_args()
    try:
        report = rehearse_marker_table(
            json.loads(args.snapshot_json.read_text(encoding='utf8')),
            args.expected_sha256)
    except (ValueError, OSError, sqlite3.Error, AssertionError) as error:
        parser.exit(2, 'NATIVE_ACTIVATION_REHEARSAL_REJECTED: ' + str(error) + '\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
