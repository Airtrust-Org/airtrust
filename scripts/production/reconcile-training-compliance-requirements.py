#!/usr/bin/env python3
"""Governed reconciliation of Costa do Sol training-compliance requirements.

Dry-run is read-only. Apply inserts requirement rows only; it never creates LMS enrollments.
Production apply requires exact clean origin/main SHA, reviewed candidate hash/count and a D1
Time Travel recovery point.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
DB_NAME = "airtrust-db"
DB_ID = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
EMPRESA_ID = 6
EMPRESA_NOME = "Costa do Sol Táxi Aéreo"
CONFIRM_APPLY = "APLICAR-REQUISITOS-COMPLIANCE-SEM-MATRICULAS"
BATCH_NOTE = "Reconciliação matriz Compliance 2026-09-28; sem auto-matrícula"

COMPANY_MANDATORY = {
    "D2", "INTRO_SGQ", "COL_SEL", "INTEGRA", "PETRO-OURO",
    "JUST_CULTURE", "STOP_WORK", "PRE", "OUT_LGPD",
}

TRIPULATION_GENERIC = {
    "D1", "P", "D3", "CMA", "D4", "CA-EBS", "CRM-LOS-T", "CRM-LOS-P",
    "A", "B", "C", "E1", "E2", "E3", "E5", "E6", "E7", "E8", "EN-ASSES",
    "LOFT", "N", "Q", "REG-ANAC",
}

AW139_SPECIFIC = {
    "F1", "G1", "G1-SEM", "SOP_AW139", "CHT-IFR-A139", "CHT-TIPO-A139",
    "FAP05.2-139", "FAP6-139", "FAP6-139-SEM", "FAP14-139", "OPC",
}
SK76_SPECIFIC = {
    "F2", "G2", "G2-SEM", "SOP_S76", "CHT-IFR-76", "CHT-TIPO-S76",
    "FAP05.2-76", "FAP06-76", "FAP6-76-SEM", "FAP14-76", "OPC-SK76",
}

MAINT_HISTORY_FUNCTION = {
    "MNT_ARRIEL2", "MNT_ARRIEL2_DESM_MOD", "MNT_ARTIGOS_PERIGOSOS",
    "MNT_FATORES_HUMANOS_CRM", "MNT_IRM", "MNT_INGLES_TECNICO",
    "MNT_IIO_APRS", "MNT_S76AC",
}

DESIGNATED_FROM_HISTORY = {
    "AUD_COMP", "MUDA", "GATEKEEPER", "PPSP_SUP", "LOSA",
    "L", "M", "I", "J", "FAP07-139", "FAP07-76", "FAP13-139", "FAP13-76",
    "IOS-T", "IOS-P", "VM-SOLO", "VM-VOO", "T", "S", "R",
    "OUT_AUDITOR_INT", "OUT_COMBATE_INCENDIO", "OUT_CORR_AERONAVES",
    "OUT_DIDATICA_ENSINO", "OUT_EXT_S76", "OUT_FAMMA", "OUT_GERIR_AUDIT",
    "OUT_H160_SAFETY", "OUT_H175_SAFETY", "OUT_VIBDAS",
    "MNT_AS350B2", "MNT_ALLISON250", "MNT_MI171A1",
}

# Canonical replacements exist; keep old historical types explicit but non-mandatory.
SUPERSEDED_NA = {"OUT_AUDIT_COMPORT", "OUT_CULTURA_JUSTA", "OUT_PPSP_ARSO"}

FOD_SECTORS = {"TRI", "MAN", "OPERACOES_CS", "SEGURANCA", "QSMS", "LOGISTICA"}
PPSP_SECTORS = set(FOD_SECTORS)
FDM_FUNCTIONS = {
    "MEC", "ORG_AUX_MAN", "ORG_COORD_ENG", "ORG_AN_CTM_I", "ORG_AUX_CTM_I",
    "ORG_GER_OPS", "ORG_ASSIST_SEG_OP", "ORG_AUX_QSMS", "ORG_TEC_SEG_TRAB",
}
FOD_EXTRA_FUNCTIONS = {"ORG_GER_BASES"}
PPSP_EXTRA_FUNCTIONS = {"ORG_GER_BASES"}


def run(cmd: list[str], cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=True)


def wrangler_query(sql: str) -> list[dict]:
    cmd = ["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
           "--env", "production", "--remote", "--json", "--command", sql]
    payload = json.loads(run(cmd, WORKER).stdout)
    return [row for block in payload for row in block.get("results", [])]


def normalize_model(value: object) -> str | None:
    text = " ".join(str(value or "").strip().upper().split())
    return text or None


def key_for(row: dict) -> tuple:
    return (
        int(row["qualificacao_tipo_id"]), str(row["escopo"]),
        int(row["setor_id"] or 0), int(row["funcao_id"] or 0),
        int(row["funcionario_id"] or 0), normalize_model(row.get("aeronave_modelo")) or "",
    )


def load_state() -> dict:
    company = wrangler_query(
        f"SELECT id,nome,ativo,deleted_at FROM empresas WHERE id={EMPRESA_ID}"
    )
    if len(company) != 1 or company[0]["nome"] != EMPRESA_NOME or int(company[0]["ativo"] or 0) != 1 or company[0]["deleted_at"] is not None:
        raise RuntimeError("Costa do Sol production tenant identity mismatch")
    types = wrangler_query(
        "SELECT id,codigo,nome,categoria,area_id,dominio_codigo,ativo,deleted_at "
        f"FROM qualificacoes_tipos WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL "
        "AND COALESCE(ativo,1)=1 ORDER BY id"
    )
    sectors = wrangler_query(
        "SELECT id,codigo,nome FROM setores "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND COALESCE(ativo,1)=1 ORDER BY id"
    )
    functions = wrangler_query(
        "SELECT id,codigo,nome FROM funcoes "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND COALESCE(ativo,1)=1 ORDER BY id"
    )
    rules = wrangler_query(
        "SELECT id,qualificacao_tipo_id,escopo,setor_id,funcao_id,funcionario_id,aeronave_modelo,"
        "obrigatoriedade,origem,referencia_normativa,observacoes,auto_matricular_ead "
        f"FROM treinamento_requisitos WHERE empresa_id={EMPRESA_ID} AND ativo=1 AND deleted_at IS NULL ORDER BY id"
    )
    holders = wrangler_query(
        "SELECT DISTINCT qh.funcionario_id,qt.codigo AS qualificacao_codigo,f.funcao_id "
        "FROM qualificacoes_historico qh "
        "JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id "
        "JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id "
        f"WHERE qh.empresa_id={EMPRESA_ID} AND qh.deleted_at IS NULL AND qt.deleted_at IS NULL "
        "AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1 "
        "AND UPPER(COALESCE(qh.status,'')) NOT IN ('PLANEJADA','PLANEJADO','CANCELADA','CANCELADO')"
    )
    enrollments = wrangler_query(
        f"SELECT COUNT(*) AS total FROM lms_matriculas WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL"
    )
    lms_courses = wrangler_query(
        "SELECT id,titulo,qualificacao_tipo_id FROM lms_cursos "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND COALESCE(ativo,1)=1 ORDER BY id"
    )
    training_programs = wrangler_query(
        "SELECT id,codigo,nome,qualificacao_tipo_id FROM treinamento_programas "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND COALESCE(ativo,1)=1 ORDER BY id"
    )
    qualification_session_models = wrangler_query(
        "SELECT id,codigo,nome,qualificacao_tipo_id FROM modelos_sessao "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND COALESCE(ativo,1)=1 "
        "AND COALESCE(gera_qualificacao,0)=1 ORDER BY id"
    )
    return {
        "types": types, "sectors": sectors, "functions": functions, "rules": rules,
        "holders": holders, "enrollments": int(enrollments[0]["total"] if enrollments else 0),
        "lms_courses": lms_courses, "training_programs": training_programs,
        "qualification_session_models": qualification_session_models,
    }


def desired_rule(type_id: int, scope: str, *, sector_id: int | None = None,
                 function_id: int | None = None, employee_id: int | None = None,
                 aircraft: str | None = None, obligation: str = "OBRIGATORIA",
                 origin: str = "EMPRESA", observation: str | None = None) -> dict:
    return {
        "qualificacao_tipo_id": type_id, "escopo": scope, "setor_id": sector_id,
        "funcao_id": function_id, "funcionario_id": employee_id,
        "aeronave_modelo": normalize_model(aircraft), "obrigatoriedade": obligation,
        "origem": origin, "referencia_normativa": None,
        "observacoes": observation or BATCH_NOTE, "auto_matricular_ead": 0,
    }


def plan(state: dict) -> tuple[list[dict], dict]:
    types = state["types"]
    codes = [str(t.get("codigo") or "").upper() for t in types]
    duplicates = sorted({c for c in codes if c and codes.count(c) > 1})
    if duplicates:
        raise RuntimeError(f"duplicate active qualification codes: {duplicates}")
    type_by_code = {str(t["codigo"]).upper(): t for t in types if t.get("codigo")}
    sector_by_code = {str(s.get("codigo") or "").upper(): s for s in state["sectors"] if s.get("codigo")}
    function_by_code = {str(f.get("codigo") or "").upper(): f for f in state["functions"] if f.get("codigo")}
    holders_by_code: dict[str, list[dict]] = defaultdict(list)
    for h in state["holders"]:
        holders_by_code[str(h.get("qualificacao_codigo") or "").upper()].append(h)

    desired: dict[tuple, dict] = {}
    existing_by_key = {key_for(r): r for r in state["rules"]}

    def add(code: str, scope: str, **kwargs) -> None:
        t = type_by_code.get(code)
        if not t:
            raise RuntimeError(f"policy references missing active qualification code {code}")
        rule = desired_rule(int(t["id"]), scope, **kwargs)
        desired[key_for(rule)] = {**rule, "codigo": code, "nome": t["nome"]}

    # Company-wide obligations are explicit. Absence of a matching rule already means
    # "not required"; do not materialize generic NAO_APLICA fallback rows.
    for code, t in type_by_code.items():
        company_key = (int(t["id"]), "EMPRESA", 0, 0, 0, "")
        existing_company = existing_by_key.get(company_key)
        if code in COMPANY_MANDATORY:
            if existing_company and existing_company.get("obrigatoriedade") != "OBRIGATORIA":
                raise RuntimeError(f"company rule conflicts with mandatory policy for {code}")
            if not existing_company:
                add(code, "EMPRESA", obligation="OBRIGATORIA", origin="EMPRESA")

    # Non-tripulant corporate CRM: company mandatory, tripulation override N/A.
    add("CRM_CORP", "EMPRESA", obligation="OBRIGATORIA", origin="EMPRESA")
    tri = sector_by_code["TRI"]
    add("CRM_CORP", "SETOR", sector_id=int(tri["id"]), obligation="NAO_APLICA", origin="EMPRESA",
        observation=f"{BATCH_NOTE}; CRM Corporativo não se aplica à Tripulação")

    # General flight-crew requirements.
    for code in sorted(TRIPULATION_GENERIC):
        add(code, "SETOR", sector_id=int(tri["id"]), obligation="OBRIGATORIA", origin="PTO")

    # Aircraft-specific flight requirements. Legacy employee aircraft field is consumed by runtime fallback.
    for code in sorted(AW139_SPECIFIC):
        add(code, "SETOR", sector_id=int(tri["id"]), aircraft="AW139", obligation="OBRIGATORIA", origin="PTO")
    for code in sorted(SK76_SPECIFIC):
        add(code, "SETOR", sector_id=int(tri["id"]), aircraft="SK76", obligation="OBRIGATORIA", origin="PTO")

    # Maintenance specialized qualifications: infer current function audience from active holders.
    for code in sorted(MAINT_HISTORY_FUNCTION):
        function_ids = sorted({int(h["funcao_id"]) for h in holders_by_code.get(code, []) if h.get("funcao_id")})
        for function_id in function_ids:
            add(code, "FUNCAO", function_id=function_id, obligation="OBRIGATORIA", origin="EMPRESA",
                observation=f"{BATCH_NOTE}; público inferido do histórico ativo por função")

    # Designated qualifications: only current active holders become individually required.
    for code in sorted(DESIGNATED_FROM_HISTORY):
        employee_ids = sorted({int(h["funcionario_id"]) for h in holders_by_code.get(code, [])})
        for employee_id in employee_ids:
            add(code, "FUNCIONARIO", employee_id=employee_id, obligation="OBRIGATORIA", origin="EMPRESA",
                observation=f"{BATCH_NOTE}; designação individual inferida de histórico ativo")

    # Safety operational audiences accepted from historical/role analysis.
    for sector_code in sorted(FOD_SECTORS):
        s = sector_by_code[sector_code]
        add("FOD", "SETOR", sector_id=int(s["id"]), obligation="OBRIGATORIA", origin="SGSO")
    for fn_code in sorted(FOD_EXTRA_FUNCTIONS):
        fn = function_by_code[fn_code]
        add("FOD", "FUNCAO", function_id=int(fn["id"]), obligation="OBRIGATORIA", origin="SGSO")

    for sector_code in sorted(PPSP_SECTORS):
        s = sector_by_code[sector_code]
        add("PPSP", "SETOR", sector_id=int(s["id"]), obligation="OBRIGATORIA", origin="SGSO")
    for fn_code in sorted(PPSP_EXTRA_FUNCTIONS):
        fn = function_by_code[fn_code]
        add("PPSP", "FUNCAO", function_id=int(fn["id"]), obligation="OBRIGATORIA", origin="SGSO")

    add("FDM-EAD", "SETOR", sector_id=int(tri["id"]), obligation="OBRIGATORIA", origin="SGSO")
    for fn_code in sorted(FDM_FUNCTIONS):
        fn = function_by_code[fn_code]
        add("FDM-EAD", "FUNCAO", function_id=int(fn["id"]), obligation="OBRIGATORIA", origin="SGSO")

    # Explicitly superseded historical types remain N/A only; no inferred designated rule is added.
    for code in SUPERSEDED_NA:
        if code not in type_by_code:
            raise RuntimeError(f"superseded type missing: {code}")

    actions: list[dict] = []
    conflicts: list[dict] = []
    for k, rule in sorted(desired.items(), key=lambda item: item[0]):
        existing = existing_by_key.get(k)
        if existing:
            if existing.get("obrigatoriedade") != rule["obrigatoriedade"]:
                conflicts.append({"codigo": rule["codigo"], "scope": rule["escopo"], "existing": existing.get("obrigatoriedade"), "desired": rule["obrigatoriedade"]})
            continue
        actions.append(rule)
    if conflicts:
        raise RuntimeError(f"existing rule conflicts require manual review: {conflicts}")

    active_type_ids = {int(t["id"]) for t in types}
    covered = {int(r["qualificacao_tipo_id"]) for r in state["rules"] if int(r["qualificacao_tipo_id"]) in active_type_ids}
    covered.update(int(a["qualificacao_tipo_id"]) for a in actions)
    uncovered = [t for t in types if int(t["id"]) not in covered]
    if uncovered:
        raise RuntimeError(f"active qualifications remain uncovered: {[t['codigo'] for t in uncovered]}")

    linked_surfaces = {
        "LMS course": state["lms_courses"],
        "training program": state["training_programs"],
        "qualification-generating session model": state["qualification_session_models"],
    }
    for label, rows in linked_surfaces.items():
        missing_link = [row for row in rows if not row.get("qualificacao_tipo_id")]
        if missing_link:
            raise RuntimeError(f"active {label} remains without qualification link: {[row['id'] for row in missing_link]}")
        linked_type_ids = {int(row["qualificacao_tipo_id"]) for row in rows}
        if not linked_type_ids.issubset(covered):
            raise RuntimeError(f"active {label} remains without a covered qualification requirement")

    func_names = {int(f["id"]): f["nome"] for f in state["functions"]}
    sector_names = {int(s["id"]): s["nome"] for s in state["sectors"]}
    cargo_rules: dict[str, set[str]] = defaultdict(set)
    sector_rules: dict[str, set[str]] = defaultdict(set)
    individual_counts: dict[str, int] = defaultdict(int)
    for a in actions:
        if a["funcao_id"]:
            cargo_rules[a["codigo"]].add(func_names[int(a["funcao_id"])])
        if a["setor_id"]:
            label = sector_names[int(a["setor_id"])] + (f" / {a['aeronave_modelo']}" if a["aeronave_modelo"] else "")
            sector_rules[a["codigo"]].add(label)
        if a["funcionario_id"]:
            individual_counts[a["codigo"]] += 1
    meta = {
        "active_types": len(types),
        "existing_active_rules": len(state["rules"]),
        "planned_inserts": len(actions),
        "covered_after": len(covered),
        "active_lms_courses": len(state["lms_courses"]),
        "active_training_programs": len(state["training_programs"]),
        "qualification_generating_session_models": len(state["qualification_session_models"]),
        "enrollments_before": state["enrollments"],
        "cargo_rules": {k: sorted(v) for k, v in sorted(cargo_rules.items())},
        "sector_rules": {k: sorted(v) for k, v in sorted(sector_rules.items())},
        "individual_rule_counts": dict(sorted(individual_counts.items())),
    }
    return actions, meta


def canonical_hash(actions: list[dict]) -> str:
    rows = []
    for a in actions:
        rows.append("|".join(str(a.get(k) or "") for k in (
            "qualificacao_tipo_id", "escopo", "setor_id", "funcao_id", "funcionario_id",
            "aeronave_modelo", "obrigatoriedade", "origem", "auto_matricular_ead"
        )))
    return hashlib.sha256("\n".join(sorted(rows)).encode()).hexdigest()


def sql_text(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def build_sql(actions: list[dict]) -> str:
    lines = ["PRAGMA foreign_keys=ON;"]
    for a in actions:
        values = [
            EMPRESA_ID, a["qualificacao_tipo_id"], a["escopo"], a["setor_id"], a["funcao_id"],
            a["funcionario_id"], a["aeronave_modelo"], a["obrigatoriedade"], 0, a["origem"],
            None, a["observacoes"], None, None, None, 0, 1,
        ]
        quoted = ",".join(str(v) if isinstance(v, int) else sql_text(v) for v in values)
        k = key_for(a)
        lines.append(
            "INSERT INTO treinamento_requisitos "
            "(empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,funcionario_id,aeronave_modelo,obrigatoriedade,critico_operacional,origem,referencia_normativa,observacoes,vigencia_inicio,vigencia_fim,prazo_inicial_dias,auto_matricular_ead,ativo) "
            f"SELECT {quoted} WHERE NOT EXISTS (SELECT 1 FROM treinamento_requisitos WHERE empresa_id={EMPRESA_ID} "
            f"AND qualificacao_tipo_id={k[0]} AND escopo={sql_text(k[1])} "
            f"AND COALESCE(setor_id,0)={k[2]} AND COALESCE(funcao_id,0)={k[3]} "
            f"AND COALESCE(funcionario_id,0)={k[4]} AND COALESCE(UPPER(TRIM(aeronave_modelo)),'')={sql_text(k[5])} "
            "AND ativo=1 AND deleted_at IS NULL);"
        )
    return "\n".join(lines) + "\n"


def verify_production_target() -> None:
    cmd = ["npx", "--no-install", "wrangler", "d1", "info", DB_NAME, "--env", "production", "--json"]
    info = json.loads(run(cmd, WORKER).stdout)
    if info.get("uuid") != DB_ID or info.get("name") != DB_NAME:
        raise RuntimeError("production D1 target identity mismatch")


def git_state() -> tuple[str, str, str]:
    return (
        run(["git", "rev-parse", "HEAD"]).stdout.strip(),
        run(["git", "rev-parse", "origin/main"]).stdout.strip(),
        run(["git", "branch", "--show-current"]).stdout.strip(),
    )


def capture_recovery_point() -> str:
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    cmd = ["npx", "--no-install", "wrangler", "d1", "time-travel", "info", DB_NAME,
           "--env", "production", f"--timestamp={timestamp}", "--json"]
    result = run(cmd, WORKER)
    if not result.stdout.strip():
        raise RuntimeError("D1 recovery point could not be verified")
    return timestamp


def apply_sql(sql: str) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql)
        path = Path(f.name)
    try:
        run(["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
             "--env", "production", "--remote", f"--file={path}"], WORKER)
    finally:
        path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-sha")
    parser.add_argument("--expected-count", type=int)
    parser.add_argument("--expected-hash")
    parser.add_argument("--confirmation")
    args = parser.parse_args()

    head, origin_main, branch = git_state()
    state = load_state()
    actions, meta = plan(state)
    candidate_hash = canonical_hash(actions)
    summary = {"mode": "apply" if args.apply else "dry-run", "head": head, "origin_main": origin_main,
               "candidate_hash": candidate_hash, **meta}
    if not args.apply:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    if head != origin_main or branch != "main" or run(["git", "status", "--porcelain"]).stdout.strip():
        raise RuntimeError("apply requires exact clean origin/main SHA on branch main")
    if args.expected_sha != head:
        raise RuntimeError("expected SHA mismatch")
    if args.expected_count != len(actions) or args.expected_hash != candidate_hash:
        raise RuntimeError("reviewed candidate set mismatch")
    if args.confirmation != CONFIRM_APPLY:
        raise RuntimeError("apply confirmation mismatch")
    verify_production_target()
    recovery = capture_recovery_point()
    enrollments_before = state["enrollments"]
    apply_sql(build_sql(actions))
    after = load_state()
    after_actions, after_meta = plan(after)
    if after_actions:
        raise RuntimeError(f"post-validation still proposes {len(after_actions)} requirement inserts")
    if after["enrollments"] != enrollments_before:
        raise RuntimeError("LMS enrollment count changed; requirement-only contract violated")
    result = {**summary, "recovery_point": recovery, "post_planned_inserts": 0,
              "enrollments_after": after["enrollments"], "covered_after": after_meta["covered_after"]}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
