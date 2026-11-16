#!/usr/bin/env python3
"""Deterministic, fail-closed D1/R2 release plan for PTO V18 canonical guides.

No network or database mutations. All source files are checked by SHA-256.
Production application is a separately authorized, guarded operation.
"""
import argparse
import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path

SOURCE_SHA = "040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912"
TENANT = 6
MATRIX = "PTO-REV10-V18"
PROGRAMS = {
    "Inicial": "INICIAL",
    "Transição": "TRANSICAO",
    "Periódico": "PERIODICO",
    "Semestral": "SEMESTRAL",
    "Requalificação": "REQUALIFICACAO",
    "Reaquisição de experiência recente": "RECENTE",
    "Treinamento noturno": "NOTURNO",
}
ALLOWED = frozenset(PROGRAMS.values()) | {"INSTRUTOR", "EXAMINADOR"}
ROOT = Path(__file__).resolve().parent
CANON = ROOT / "pto-v18-canonical"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def sql(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    if not isinstance(value, str) or "\x00" in value:
        raise ValueError("INVALID_SQL_VALUE")
    return "'" + value.replace("'", "''") + "'"


def key_slug(text):
    deaccent = unicodedata.normalize("NFD", text)
    deaccent = "".join(c for c in deaccent if not unicodedata.combining(c))
    return re.sub(r"^-+|-+$", "", re.sub("[^a-zA-Z0-9]+", "-", deaccent)).upper()


def session_metadata(session, functional):
    code = session["codigo"]
    if functional:
        program = "INSTRUTOR" if code.startswith("INST-") else "EXAMINADOR" if code.startswith("EXA-") else None
        aircraft = "FUNCIONAL"
    else:
        program = PROGRAMS.get(session["programa"])
        aircraft = session["aeronave"]
    if program not in ALLOWED or aircraft not in {"FUNCIONAL", "AW139", "S76"}:
        raise ValueError("PROGRAM_OR_AIRCRAFT_NOT_CANONICAL:" + code)
    m = re.search(r"(\d+)/(\d+)", code)
    if m:
        sess, total = int(m.group(1)), int(m.group(2))
    elif code.startswith("INST-E"):
        sess, total = int(code.rsplit("E", 1)[1]), 2
    elif code.startswith("S76-NOT-"):
        sess, total = int(code.rsplit("-", 1)[1]), 2
    elif code.endswith("-REC-01"):
        sess, total = 1, 1
    else:
        raise ValueError("SESSION_NUMBER_UNMAPPED:" + code)
    cyc = re.search(r"-C(\d+)$", code)
    return {
        "codigo": code, "titulo": session["titulo"], "programa": program,
        "aeronave": aircraft, "ciclo": int(cyc.group(1)) if cyc else None,
        "sessao_numero": sess, "sessao_total": total,
    }


def validate_source(guide_dir, snapshot):
    guide_dir = Path(guide_dir)
    manifest = json.loads((guide_dir / "manifesto_guias_pto_v18.json").read_text())
    if (manifest.get("status") != "CANONICAL_PTO_MIRROR_CREATED"
            or manifest.get("source_sha256") != SOURCE_SHA
            or manifest.get("guides") != 88
            or manifest.get("positions") != 1584
            or manifest.get("sanitized_approved") != 88):
        raise ValueError("MANIFEST_NOT_88_CANONICAL_SANITIZED")
    if snapshot.get("links") != 0:
        raise ValueError("CURRENT_V18_LINKS_EXIST_REQUIRE_RECONCILIATION")
    cm = json.loads((CANON / "sessoes_pto_v18.json").read_text())
    cf = json.loads((CANON / "funcionais_pto_v18.json").read_text())
    canon = {x["codigo"]: (x, False) for x in cm}
    canon.update({x["codigo"]: (x, True) for x in cf})
    if len(canon) != 88 or len(manifest["entries"]) != 88:
        raise ValueError("CANONICAL_SESSION_SET_WRONG")
    models = {x["codigo_canonico"]: x for x in snapshot["models"]}
    if set(models) != set(canon) or len(snapshot["models"]) != 88:
        raise ValueError("D1_CURRENT_MODEL_SET_DIFFERENT_FROM_APPROVED_PTO")
    aircraft_ids = {x["codigo"]: x["id"] for x in snapshot["aircraft"]}
    if set(aircraft_ids) != {"AW139", "SK76"}:
        raise ValueError("D1_AIRCRAFT_VARIANTS_DIFFERENT")
    normalized = []
    seen = set()
    for entry in manifest["entries"]:
        code = entry["codigo"]
        if code in seen or code not in canon:
            raise ValueError("GUIDE_DUPLICATE_OR_NONCANONICAL_CODE:" + code)
        seen.add(code)
        session, functional = canon[code]
        meta = session_metadata(session, functional)
        if (entry["titulo"] != session["titulo"] or entry["posicoes"] != len(session["itens"])
                or entry["notechs"] != 15
                or entry["aeronave"] != ("FUNCIONAL" if functional else session["aeronave"])):
            raise ValueError("GUIDE_CONTENT_IDENTITY_MISMATCH:" + code)
        model = models[code]
        if (model["empresa_id"] != TENANT or model["versao_matriz"] != MATRIX
                or model["modelo_aeronave"] != ("AW139" if meta["aeronave"] == "AW139" else
                     "SK76" if meta["aeronave"] == "S76" else None)):
            raise ValueError("D1_MODEL_TENANT_AIRCRAFT_MISMATCH:" + code)
        expected_file = code.replace("/", "_") + ".html"
        if entry["arquivo"] != expected_file:
            raise ValueError("GUIDE_FILENAME_MISMATCH:" + code)
        html_path = guide_dir / entry["arquivo"]
        san_path = guide_dir / entry["sanitized_html"]
        pdf_path = guide_dir / entry["pdf"]
        if (not html_path.is_file() or not san_path.is_file() or not pdf_path.is_file()
                or san_path.parent != guide_dir / "sanitizado"
                or pdf_path.parent != guide_dir / "pdf"):
            raise ValueError("MISSING_OR_UNSAFE_SOURCE_FILES:" + code)
        html_raw = html_path.read_bytes()
        html_san = san_path.read_bytes()
        pdf = pdf_path.read_bytes()
        if (sha(html_raw) != entry["html_sha256"]
                or sha(html_san) != entry["sanitized_html_sha256"]
                or sha(pdf) != entry["pdf_sha256"]):
            raise ValueError("SOURCE_FILE_HASH_MISMATCH:" + code)
        if not pdf.startswith(b"%PDF") or b"<script" in html_san.lower() or b"<iframe" in html_san.lower():
            raise ValueError("SOURCE_INVALID_PDF_OR_HTML:" + code)
        out = html_san.decode("utf-8")
        if (SOURCE_SHA not in out or code not in out
                or not all(html.escape(x["nome"], quote=True) in out for x in session["itens"])
                or not all(x["codigo"] in out for x in session["itens"])):
            raise ValueError("SANITIZED_HTML_LOST_PTO_CONTENT:" + code)
        if model["modelo_id"] <= 0:
            raise ValueError("INVALID_D1_MODEL_ID:" + code)
        normalized.append({
            **meta, "modelo_sessao_id": model["modelo_id"],
            "modelo_aeronave_id": None if functional else aircraft_ids["AW139" if meta["aeronave"] == "AW139" else "SK76"],
            "html_path": str(san_path), "pdf_path": str(pdf_path),
            "html_sha256": sha(html_san), "pdf_sha256": sha(pdf),
            "html_bytes": len(html_san), "pdf_bytes": len(pdf),
        })
    if len(normalized) != 88 or len(set(x["modelo_sessao_id"] for x in normalized)) != 88:
        raise ValueError("GUIDE_MODEL_NOT_BIJECTIVE")
    return sorted(normalized, key=lambda x: x["codigo"])


def make_plan(guide_dir, snapshot):
    guides = validate_source(guide_dir, snapshot)
    content_sha = sha(json.dumps(
        [[g[k] for k in ("codigo", "html_sha256", "pdf_sha256")] for g in guides],
        sort_keys=True, ensure_ascii=False,
    ).encode())
    version = "1.0." + content_sha[:12].upper()
    for g in guides:
        guide_code = g["codigo"] + "@PTO-REV10-V18"
        aircraft_key = "SK76" if g["aeronave"] == "S76" else g["aeronave"]
        base = (
            f"guias-instrutor/{TENANT}/{aircraft_key}/{g['programa']}/"
            f"{key_slug(guide_code)}/{key_slug(version).replace('-', '.')}"
        )
        g["guia_codigo_versionado"] = guide_code
        g["r2_html"] = base + "/index.html"
        g["r2_pdf"] = base + "/guia.pdf"
    return {
        "status": "READY_FOR_GOVERNED_RELEASE_NOT_YET_APPLIED",
        "tenant": TENANT, "matrix": MATRIX, "source_sha256": SOURCE_SHA,
        "content_sha256": content_sha, "version": version,
        "guide_count": 88, "positions": 1584, "guides": guides,
    }


def make_sql(plan):
    """Two-phase resilient import; initial records VALIDACAO, activate only if 88 links exist."""
    version = plan["version"]
    ref = "PRG-OPS-001_PTO_Rev10_V18.docx SHA-256 " + SOURCE_SHA
    rows = []
    rows.append("-- GUARD: 88 current models read back before execution; source SHA " + SOURCE_SHA)
    rows.append("-- R2 upload and hash readback MUST complete before this D1 script.")
    for g in plan["guides"]:
        code, mid = g["guia_codigo_versionado"], g["modelo_sessao_id"]
        fields = [
            "empresa_id", "modelo_aeronave_id", "programa", "ciclo",
            "sessao_numero", "sessao_total", "codigo", "titulo", "descricao",
            "versao", "status", "html_r2_key", "html_nome", "html_mime_type",
            "html_tamanho_bytes", "html_sha256", "html_status_validacao",
            "pdf_r2_key", "pdf_nome", "pdf_mime_type", "pdf_tamanho_bytes",
            "pdf_sha256", "versao_curriculo", "documento_referencia", "created_by", "updated_by"
        ]
        vals = [
            TENANT, g["modelo_aeronave_id"], g["programa"], g["ciclo"],
            g["sessao_numero"], g["sessao_total"], code,
            "Guia curricular — " + g["titulo"],
            "Espelho literal do currículo aprovado, sem adicionar procedimentos ou parâmetros operacionais.",
            version, "VALIDACAO",
            g["r2_html"], g["codigo"].replace("/", "_") + ".html", "text/html", g["html_bytes"],
            g["html_sha256"], "VALIDO", g["r2_pdf"],
            g["codigo"].replace("/", "_") + ".pdf", "application/pdf", g["pdf_bytes"],
            g["pdf_sha256"], MATRIX, ref, 0, 0
        ]
        sql_code = sql(code)
        rows.append(
            f"INSERT INTO simuladores_guias_instrutor_v2 ({', '.join(fields)}) "
            f"SELECT {', '.join(map(sql,vals))} "
            f"WHERE (SELECT COUNT(*) FROM modelos_sessao_versionamento v "
            f"WHERE v.empresa_id={TENANT} AND v.is_current=1 AND v.versao_matriz={sql(MATRIX)} "
            f"AND v.codigo_canonico={sql(g['codigo'])} AND v.modelo_id={mid})=1 "
            f"AND NOT EXISTS(SELECT 1 FROM simuladores_guias_instrutor_v2 "
            f"WHERE empresa_id={TENANT} AND codigo={sql_code} AND versao={sql(version)} AND deleted_at IS NULL);"
        )
        rows.append(
            "INSERT INTO simuladores_modelos_sessao_guias_v2 "
            "(empresa_id,modelo_sessao_id,guia_id,principal,ordem) "
            f"SELECT {TENANT},{mid},g.id,1,1 FROM simuladores_guias_instrutor_v2 g "
            f"WHERE g.empresa_id={TENANT} AND g.codigo={sql_code} AND g.versao={sql(version)} "
            "AND g.deleted_at IS NULL "
            f"AND EXISTS(SELECT 1 FROM modelos_sessao_versionamento v WHERE v.empresa_id={TENANT} "
            f"AND v.modelo_id={mid} AND v.is_current=1 AND v.versao_matriz={sql(MATRIX)}) "
            f"AND NOT EXISTS(SELECT 1 FROM simuladores_modelos_sessao_guias_v2 l WHERE "
            f"l.empresa_id={TENANT} AND l.modelo_sessao_id={mid} AND l.guia_id=g.id AND l.deleted_at IS NULL);"
        )
    coverage = (
        f"(SELECT COUNT(*) FROM simuladores_guias_instrutor_v2 g "
        f"WHERE g.empresa_id={TENANT} AND g.versao={sql(version)} "
        f"AND g.versao_curriculo={sql(MATRIX)} AND g.deleted_at IS NULL)=88 "
        f"AND (SELECT COUNT(DISTINCT l.modelo_sessao_id) "
        f"FROM simuladores_modelos_sessao_guias_v2 l JOIN simuladores_guias_instrutor_v2 g "
        f"ON g.id=l.guia_id WHERE l.empresa_id={TENANT} AND l.deleted_at IS NULL "
        f"AND g.empresa_id={TENANT} AND g.versao={sql(version)} AND g.versao_curriculo={sql(MATRIX)})=88"
    )
    # Existing legacy guide rows remain untouched. Activate only after full link set.
    rows.append(
        f"UPDATE simuladores_guias_instrutor_v2 SET status='ATIVO',"
        f"publicado_em=COALESCE(publicado_em,datetime('now')),updated_at=datetime('now') "
        f"WHERE empresa_id={TENANT} AND versao={sql(version)} AND versao_curriculo={sql(MATRIX)} "
        f"AND status='VALIDACAO' AND deleted_at IS NULL AND {coverage};"
    )
    rows.append(
        "INSERT INTO simuladores_guias_instrutor_auditoria_v2 "
        "(empresa_id,guia_id,usuario_id,acao,valores_novos) "
        f"SELECT {TENANT},g.id,0,'IMPORTACAO_AUTOMATIZADA_ESPÉLHO_PTO',"
        f"json_object('PTO','PTO-REV10-V18','source_sha256',{sql(SOURCE_SHA)},"
        f"'pdf_sha256',g.pdf_sha256,'html_sha256',g.html_sha256,"
        f"'ator','execucao_tecnica_automatizada_sem_assinatura_RT') "
        "FROM simuladores_guias_instrutor_v2 g "
        f"WHERE g.empresa_id={TENANT} AND g.versao={sql(version)} "
        "AND g.status='ATIVO' AND g.deleted_at IS NULL AND NOT EXISTS("
        "SELECT 1 FROM simuladores_guias_instrutor_auditoria_v2 a "
        "WHERE a.guia_id=g.id AND a.acao='IMPORTACAO_AUTOMATIZADA_ESPÉLHO_PTO');"
    )
    return "\n".join(rows) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--guides", type=Path, required=True)
    ap.add_argument("--snapshot", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    a = ap.parse_args()
    plan = make_plan(a.guides, json.loads(a.snapshot.read_text()))
    a.output.mkdir(parents=True, exist_ok=True)
    (a.output / "plano_importacao_v18.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    )
    (a.output / "importacao_v18.sql").write_text(make_sql(plan))
    print(json.dumps({
        "status": plan["status"], "guides": plan["guide_count"], "positions": plan["positions"],
        "content_sha256": plan["content_sha256"], "version": plan["version"],
        "sql_sha256": sha((a.output / "importacao_v18.sql").read_bytes()),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
