#!/usr/bin/env python3
"""Fail-closed SQL and PTO release planner tests (no production access)."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name("build-pto-v18-guide-import-plan.py")
spec = importlib.util.spec_from_file_location("pto_v18_guide_plan", MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fixture_plan():
    source = json.loads((mod.CANON / "sessoes_pto_v18.json").read_text())
    functional = json.loads((mod.CANON / "funcionais_pto_v18.json").read_text())
    guides = []
    for i, session in enumerate(source + functional, 1):
        metadata = mod.session_metadata(session, i > 82)
        code = session["codigo"]
        meta = {**metadata, "modelo_sessao_id": 100 + i,
                "modelo_aeronave_id": None if i > 82 else (5 if i <= 37 else 6),
                "html_bytes": 1200, "pdf_bytes": 3900,
                "html_sha256": "a" * 64, "pdf_sha256": "b" * 64,
                "r2_html": f"guias-instrutor/6/test/{code.replace('/','_')}/index.html",
                "r2_pdf": f"guias-instrutor/6/test/{code.replace('/','_')}/guia.pdf",
                "guia_codigo_versionado": code + "@PTO-REV10-V18"}
        guides.append(meta)
    return {"version": "1.0.UNITTEST", "guides": guides}


def fixture_db(plan):
    db = sqlite3.connect(":memory:")
    db.executescript("""
CREATE TABLE modelos_sessao_versionamento (
  modelo_id INTEGER, empresa_id INTEGER, codigo_canonico TEXT,
  versao_matriz TEXT, is_current INTEGER
);
CREATE TABLE fichas_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
  modelo_sessao_id INTEGER, instrutor_id INTEGER, data TEXT, status TEXT
);
CREATE TABLE simuladores_guias_instrutor_v2 (
 id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
 modelo_aeronave_id INTEGER, programa TEXT NOT NULL, ciclo INTEGER,
 sessao_numero INTEGER, sessao_total INTEGER, codigo TEXT NOT NULL,
 titulo TEXT NOT NULL, descricao TEXT, versao TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN ('RASCUNHO','VALIDACAO','ATIVO','INATIVO','SUBSTITUIDO')),
 html_r2_key TEXT, html_nome TEXT, html_mime_type TEXT,
 html_tamanho_bytes INTEGER, html_sha256 TEXT, html_status_validacao TEXT,
 pdf_r2_key TEXT, pdf_nome TEXT, pdf_mime_type TEXT,
 pdf_tamanho_bytes INTEGER, pdf_sha256 TEXT, versao_curriculo TEXT,
 documento_referencia TEXT, created_by INTEGER NOT NULL, updated_by INTEGER,
 publicado_em TEXT, deleted_at TEXT, updated_at TEXT
);
CREATE UNIQUE INDEX idx_unique_active
ON simuladores_guias_instrutor_v2(
 empresa_id,COALESCE(modelo_aeronave_id,-1),programa,
 COALESCE(ciclo,0),COALESCE(sessao_numero,0),codigo)
WHERE status='ATIVO' AND deleted_at IS NULL;
CREATE TABLE simuladores_modelos_sessao_guias_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER NOT NULL,
  modelo_sessao_id INTEGER NOT NULL,guia_id INTEGER NOT NULL,
  principal INTEGER,ordem INTEGER,deleted_at TEXT
);
CREATE TABLE simuladores_guias_instrutor_auditoria_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,guia_id INTEGER,
  usuario_id INTEGER,acao TEXT,valores_novos TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
""")
    db.executemany(
        "INSERT INTO modelos_sessao_versionamento VALUES(?,?,?,?,?)",
        [(x["modelo_sessao_id"], 6, x["codigo"], mod.MATRIX, 1) for x in plan["guides"]]
    )
    # Historical signed fichas must remain intact
    db.executemany(
        "INSERT INTO fichas_sessao (empresa_id, modelo_sessao_id, instrutor_id, data, status) VALUES (?,?,?,?,?)",
        [(6, 101, 10, "2026-07-21", "ASSINADA"), (6, 102, 11, "2026-07-22", "ASSINADA")]
    )
    # A legacy guide can have the same canonical code without replacement.
    guide = plan["guides"][0]
    db.execute(
        "INSERT INTO simuladores_guias_instrutor_v2 "
        "(empresa_id,modelo_aeronave_id,programa,ciclo,sessao_numero,sessao_total,"
        "codigo,titulo,versao,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (6, 5, guide["programa"], guide["ciclo"], guide["sessao_numero"],
         guide["sessao_total"], guide["codigo"], "LEGADO", "1", "ATIVO", 99),
    )
    db.commit()
    return db


class GuideImportPlanTests(unittest.TestCase):
    def test_program_and_aircraft_mappings(self):
        p = fixture_plan()
        self.assertEqual(len(p["guides"]), 88)
        self.assertEqual(p["guides"][0]["programa"], "INICIAL")
        self.assertEqual(p["guides"][-1]["programa"], "EXAMINADOR")
        self.assertEqual(p["guides"][-1]["modelo_aeronave_id"], None)
        self.assertTrue(all(x["programa"] in mod.ALLOWED for x in p["guides"]))

    def test_functional_sessions_handling(self):
        p = fixture_plan()
        functional_guides = [g for g in p["guides"] if g["aeronave"] == "FUNCIONAL"]
        self.assertEqual(len(functional_guides), 6)
        for g in functional_guides:
            self.assertIsNone(g["modelo_aeronave_id"])
            self.assertIn(g["programa"], {"INSTRUTOR", "EXAMINADOR"})

    def test_keys_escape_and_nfc(self):
        self.assertEqual(mod.key_slug("S76-REC/01"), "S76-REC-01")
        self.assertEqual(mod.key_slug("Requalificação"), "REQUALIFICACAO")
        self.assertEqual(mod.sql("a'b"), "'a''b'")
        with self.assertRaises(ValueError):
            mod.sql("bad\x00input")

    def test_sql_import_full_idempotent_preserves_legacy(self):
        p = fixture_plan()
        db = fixture_db(p)
        fichas_before = db.execute("SELECT COUNT(*) FROM fichas_sessao").fetchone()[0]
        code = mod.make_sql(p)
        db.executescript(code)
        counts = db.execute(
            "SELECT status,COUNT(*) FROM simuladores_guias_instrutor_v2 GROUP BY status ORDER BY status"
        ).fetchall()
        self.assertEqual(counts, [("ATIVO", 89)])
        self.assertEqual(db.execute("SELECT COUNT(*) FROM simuladores_modelos_sessao_guias_v2").fetchone()[0], 88)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM simuladores_guias_instrutor_auditoria_v2").fetchone()[0], 88)
        self.assertEqual(db.execute(
            "SELECT COUNT(*) FROM simuladores_guias_instrutor_v2 WHERE status='ATIVO' AND codigo NOT LIKE '%@PTO-REV10-V18'"
        ).fetchone()[0], 1)
        # Idempotence: execute a second and third time
        db.executescript(code)
        db.executescript(code)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM simuladores_guias_instrutor_v2").fetchone()[0], 89)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM simuladores_modelos_sessao_guias_v2").fetchone()[0], 88)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM simuladores_guias_instrutor_auditoria_v2").fetchone()[0], 88)
        fichas_after = db.execute("SELECT COUNT(*) FROM fichas_sessao").fetchone()[0]
        self.assertEqual(fichas_before, fichas_after)

    def test_fail_closed_if_model_not_current(self):
        p = fixture_plan()
        db = fixture_db(p)
        db.execute(
            "UPDATE modelos_sessao_versionamento SET is_current=0 WHERE modelo_id=?",
            (p["guides"][-1]["modelo_sessao_id"],)
        )
        db.executescript(mod.make_sql(p))
        self.assertEqual(
            db.execute("SELECT COUNT(*) FROM simuladores_guias_instrutor_v2 WHERE status='ATIVO'").fetchone()[0], 1
        )
        self.assertEqual(
            db.execute("SELECT COUNT(*) FROM simuladores_guias_instrutor_v2 WHERE status='VALIDACAO'").fetchone()[0], 87
        )
        self.assertEqual(db.execute("SELECT COUNT(*) FROM simuladores_guias_instrutor_auditoria_v2").fetchone()[0], 0)

    def test_audit_records_technical_actor(self):
        p = fixture_plan()
        db = fixture_db(p)
        db.executescript(mod.make_sql(p))
        audit_rows = db.execute(
            "SELECT usuario_id, acao, valores_novos FROM simuladores_guias_instrutor_auditoria_v2"
        ).fetchall()
        self.assertEqual(len(audit_rows), 88)
        for uid, acao, valores in audit_rows:
            self.assertEqual(uid, 0)
            self.assertEqual(acao, "IMPORTACAO_AUTOMATIZADA_ESPÉLHO_PTO")
            data = json.loads(valores)
            self.assertEqual(data["PTO"], "PTO-REV10-V18")
            self.assertEqual(data["source_sha256"], mod.SOURCE_SHA)
            self.assertEqual(data["ator"], "execucao_tecnica_automatizada_sem_assinatura_RT")

    def test_wrong_code_or_program_rejected(self):
        with self.assertRaises(ValueError):
            mod.session_metadata({"codigo": "X-01", "programa": "Inicial", "aeronave": "AW139"}, False)
        with self.assertRaises(ValueError):
            mod.session_metadata({"codigo": "A139-I-99", "programa": "Inovação", "aeronave": "AW139"}, False)

    def test_validate_source_rejects_existing_links(self):
        with tempfile.TemporaryDirectory() as td:
            guide_dir = Path(td)
            (guide_dir / "manifesto_guias_pto_v18.json").write_text(json.dumps({
                "status": "CANONICAL_PTO_MIRROR_CREATED",
                "source_sha256": mod.SOURCE_SHA,
                "guides": 88, "positions": 1584, "sanitized_approved": 88,
                "entries": []
            }))
            snapshot = {"links": 1, "models": [], "aircraft": []}
            with self.assertRaises(ValueError) as ctx:
                mod.validate_source(guide_dir, snapshot)
            self.assertIn("CURRENT_V18_LINKS_EXIST_REQUIRE_RECONCILIATION", str(ctx.exception))

    def test_validate_source_rejects_aircraft_mismatch(self):
        # Setup minimal mock directory
        with tempfile.TemporaryDirectory() as td:
            guide_dir = Path(td)
            manifest = {
                "status": "CANONICAL_PTO_MIRROR_CREATED",
                "source_sha256": mod.SOURCE_SHA,
                "guides": 88, "positions": 1584, "sanitized_approved": 88,
                "entries": []
            }
            (guide_dir / "manifesto_guias_pto_v18.json").write_text(json.dumps(manifest))
            snapshot = {
                "links": 0,
                "models": [{"codigo_canonico": "A139-I-01/12", "modelo_id": 1, "empresa_id": 6,
                            "versao_matriz": "PTO-REV10-V18", "modelo_aeronave": "SK76"}],  # Mismatch!
                "aircraft": [{"id": 5, "codigo": "AW139"}, {"id": 6, "codigo": "SK76"}]
            }
            with self.assertRaises(ValueError) as ctx:
                mod.validate_source(guide_dir, snapshot)
            self.assertIn("CANONICAL_SESSION_SET_WRONG", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
