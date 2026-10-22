#!/usr/bin/env python3
"""Rehearse a non-destructive Native catalog marker with foreign_keys=ON.

OFFLINE ONLY. This uses the exact captured catalog DDL and anonymous synthetic
rows; it does NOT declare a migration, touch D1, or authorize treating a legacy
SCORM course as Native. Its purpose is to prove additive DDL compatibility
separately from the much larger application-level legacy-route isolation task.
"""
from __future__ import annotations

import argparse
import json
import runpy
import sqlite3
from pathlib import Path

HELPERS = runpy.run_path(str(
    Path(__file__).resolve().with_name('rehearse-native-catalog-rebuild.py')
))
parse_snapshot = HELPERS['parse_snapshot']
create_synthetic_db = HELPERS['create_synthetic_db']


def rehearse_additive_marker(snapshot: list, expected_hash: str) -> dict:
    ddl, indexes, triggers, fingerprint = parse_snapshot(snapshot, expected_hash)
    db = create_synthetic_db(ddl, indexes, triggers)
    try:
        # The captured 0457 triggers reference qualification metadata tables
        # beyond the original rebuild helper's minimal synthetic fixtures.
        # Supply only their expected column *shapes* (no real records).
        # This does not replace a governed review of real FK dependencies.
        for table, columns in (
            ('qualificacoes_tipos', (
                'empresa_id INTEGER', 'categoria_id INTEGER', 'deleted_at TEXT',
                'dominio_codigo TEXT',
            )),
            ('qualificacoes_categorias', (
                'empresa_id INTEGER', 'ativo INTEGER', 'deleted_at TEXT',
                'nome TEXT', 'dominio_codigo TEXT',
            )),
        ):
            for column in columns:
                db.execute(f'ALTER TABLE {table} ADD COLUMN {column}')
        old_seq = db.execute(
            "SELECT seq FROM sqlite_sequence WHERE name='lms_cursos'"
        ).fetchone()[0]
        before = [
            db.execute(
                "SELECT sql FROM sqlite_master WHERE name=?", (obj['name'],)
            ).fetchone()[0]
            for obj in indexes + triggers
        ]
        # D1-compatible additive DDL: no table rename, DROP, FK disabling or
        # rewriting of any legacy row. This is an offline design candidate.
        assert db.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        db.execute("""
            ALTER TABLE lms_cursos ADD COLUMN native_pilot_format INTEGER
              NOT NULL DEFAULT 0
              CHECK (native_pilot_format IN (0,1))
        """)
        db.execute(
            "INSERT INTO lms_cursos(id,empresa_id,titulo,tipo_conteudo) "
            "VALUES (2,6,'Legacy synthetic control','scorm')"
        )
        original = db.execute(
            "SELECT tipo_conteudo,native_pilot_format FROM lms_cursos WHERE id=1"
        ).fetchone()
        if original != ('scorm', 0):
            raise AssertionError('ADDITIVE_LEGACY_DEFAULT_DRIFT')
        db.execute(
            "UPDATE lms_cursos SET native_pilot_format=1 WHERE id=1"
        )
        marker = db.execute(
            "SELECT tipo_conteudo,native_pilot_format FROM lms_cursos WHERE id=1"
        ).fetchone()
        if marker != ('scorm', 1):
            raise AssertionError('ADDITIVE_MARKER_NOT_INDEPENDENT')
        default = db.execute(
            "SELECT native_pilot_format FROM lms_cursos WHERE id=2"
        ).fetchone()[0]
        if default != 0:
            raise AssertionError('ADDITIVE_LEGACY_CONTROL_CHANGED')
        references = (
            ('lms_matriculas',101),
            ('lms_cursos_setores',201),
            ('lms_scorm_package_versions',301),
        )
        for table, row_id in references:
            assert db.execute(
                f'SELECT curso_id FROM {table} WHERE id=?', (row_id,)
            ).fetchone()[0] == 1
        after = [
            db.execute(
                "SELECT sql FROM sqlite_master WHERE name=?", (obj['name'],)
            ).fetchone()[0]
            for obj in indexes + triggers
        ]
        if before != after:
            raise AssertionError('ADDITIVE_DEPENDENT_OBJECTS_CHANGED')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise AssertionError('ADDITIVE_FK_BROKEN')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise AssertionError('ADDITIVE_INTEGRITY_BROKEN')
        if db.execute(
            "SELECT seq FROM sqlite_sequence WHERE name='lms_cursos'"
        ).fetchone()[0] < old_seq:
            raise AssertionError('ADDITIVE_AUTOINCREMENT_REGRESSED')
        try:
            db.execute("UPDATE lms_cursos SET native_pilot_format=2 WHERE id=1")
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError('ADDITIVE_INVALID_MARKER_ACCEPTED')
        # Critically the preexisting legacy type *still says SCORM*.
        # A naive marker-only migration would remain unsafe without blocking
        # every legacy player/upload/completion/write pathway.
        return {
            'schema': 'AIRTRUST_NATIVE_ADDITIVE_MARKER_OFFLINE_REHEARSAL_V1',
            'snapshotHash': fingerprint,
            'foreignKeysKeptOn': True,
            'foreignKeyCheck': 'PASS',
            'integrityCheck': 'PASS',
            'dependentDefinitionsPreserved': len(before),
            'legacyDefaultUnchanged': True,
            'markerIndependentOfLegacyType': True,
            'unmodifiedLegacyRouteWouldSeeScorm': True,
            'legacyRouteIsolationRequired': True,
            'migrationPrepared': False,
            'remoteMutationPerformed': False,
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
        report = rehearse_additive_marker(
            json.loads(args.snapshot_json.read_text(encoding='utf8')),
            args.expected_sha256,
        )
    except (ValueError, OSError, sqlite3.Error, AssertionError) as error:
        parser.exit(2, 'ADDITIVE_REHEARSAL_REJECTED: '+str(error)+'\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
