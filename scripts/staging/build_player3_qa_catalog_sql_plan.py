#!/usr/bin/env python3
"""Offline, two-phase governed synthetic Native catalog plan for staging QA.

source_reference: Schema V2 0558/0559/0561/0562, Player3 Technical First
 Acceptance, and scripts/learning-factory/build_player3_qa_publication_plan.py.
operational_decision: generate STRICT tenant-scoped SQL for a synthetic QA
 course and immutable published edition; only the trusted staging coordinator
 may review/execute these statements through the governed staging writer.
dry_run_required: no database, Cloudflare client, network or remote mutation.
rollback_plan_required: physical course/marker and published Native evidence
 may be immutable. Do not delete or silently undo; obtain D1 recovery point,
 and use approved retirement/compensation after documenting downstream rows.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FACTORY = ROOT / "scripts/learning-factory"
blueprint = SourceFileLoader(
    "player3_qa_blueprint_sql",
    str(FACTORY / "build_player3_qa_publication_plan.py"),
).load_module()
SHA = re.compile(r"^[a-f0-9]{64}$")
GIT = re.compile(r"^[a-f0-9]{40}$")
TENANT = 999006
CATEGORY = "QA-PLAYER3-NATIVE-CAT"
TYPE = "QA-PLAYER3-NATIVE-TYPE"
COURSE_TITLE = "QA-PLAYER3-NATIVE-ONLY-SYNTHETIC"
COURSE_VERSION = "qa-player3-native-synthetic-v1"
ADMIN_EMAIL = "qa-examiner-admin@staging.airtrust.invalid"
DB = "airtrust-db-staging-baseline-20260701"
DB_UUID = "bf9963f4-eb12-439b-a830-20bbf577ac22"


class Denied(ValueError):
    pass


def guard(ok, code):
    if not ok:
        raise Denied(code)


def sql(value):
    guard(isinstance(value, str) and len(value) < 301 and "\x00" not in value,
          "QA_SQL_INPUT_UNSAFE")
    return "'" + value.replace("'", "''") + "'"


def assertion(expr: str, code: str, expected: int = 1):
    guard(re.fullmatch(r"[A-Z][A-Z0-9_]+", code) is not None,
          "QA_ASSERTION_CODE_INVALID")
    # SQLite json(non-json) raises an error. Unlike SELECT CASE 1 ELSE 0,
    # this fails the staging D1 batch before the first write.
    guard(expected in (0, 1), "QA_ASSERTION_EXPECTED_INVALID")
    return f"SELECT json(CASE WHEN ({expr}) = {expected} THEN 'null' ELSE '{code}' END);"


def tenant():
    return f"(SELECT id FROM empresas WHERE codigo='qa_examiner_training' AND id={TENANT} AND deleted_at IS NULL AND ativo=1)"


def bootstrap(candidate: Path, release_sha: str):
    guard(GIT.fullmatch(release_sha) is not None, "QA_RELEASE_SHA_INVALID")
    guard(candidate.is_dir() and not candidate.is_symlink(),
          "QA_PRIVATE_CANDIDATE_MISSING")
    manifest = json.loads((candidate / "manifest.json").read_text())
    guard(manifest.get("courseId") == "qa-player3-synthetic"
          and manifest.get("status") ==
          "OFFLINE_TECHNICAL_CANDIDATE_NOT_APPROVED_FOR_STAGING_OR_PRODUCTION"
          and manifest.get("remoteWrites") is False,
          "QA_SYNTHETIC_MANIFEST_REQUIRED")
    artifact_hash = manifest.get("editionSha256")
    guard(isinstance(artifact_hash, str) and SHA.fullmatch(artifact_hash),
          "QA_NATIVE_EDITION_HASH_REQUIRED")
    # Validates all private hashes, ZIP contents, crosswalk, browser no-keys.
    # Physical course ID is unknown here; 1 is validation-only, never a D1 ID.
    blueprint.compose(candidate, TENANT, 1, release_sha,
                      "https://qa-player3-staging.pages.dev")
    # Check artifact itself, not merely the manifest's asserted hash.
    source = candidate / "private/native-private-candidate.json"
    guard(source.is_file() and not source.is_symlink() and
          hashlib.sha256(source.read_bytes()).hexdigest() == artifact_hash,
          "QA_NATIVE_ARTIFACT_HASH_DRIFT")

    t = tenant()
    category = f"(SELECT id FROM qualificacoes_categorias WHERE empresa_id={t} AND codigo={sql(CATEGORY)} AND deleted_at IS NULL)"
    qual_type = f"(SELECT id FROM qualificacoes_tipos WHERE empresa_id={t} AND codigo={sql(TYPE)} AND ativo=1 AND deleted_at IS NULL)"
    course = f"(SELECT id FROM lms_cursos WHERE empresa_id={t} AND titulo={sql(COURSE_TITLE)} AND version_tag={sql(COURSE_VERSION)} AND deleted_at IS NULL)"
    preflight = [
        assertion("SELECT COUNT(*) FROM empresas WHERE codigo='qa_examiner_training' AND id=999006 AND ativo=1 AND deleted_at IS NULL", "QA_TENANT_NOT_EXACT"),
        assertion(f"SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='lms-native-catalog-activation-0561'", "QA_SCHEMA_0561_NOT_APPLIED_ONCE"),
        assertion(f"SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='lms-player3-canonical-terminal-0562'", "QA_SCHEMA_0562_NOT_APPLIED_ONCE"),
        assertion(f"SELECT COUNT(*) FROM qualificacoes_categorias WHERE empresa_id={t} AND codigo={sql(CATEGORY)}", "QA_CATEGORY_ALREADY_EXISTS", 0),
        assertion(f"SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id={t} AND codigo={sql(TYPE)}", "QA_TYPE_ALREADY_EXISTS", 0),
        assertion(f"SELECT COUNT(*) FROM lms_cursos WHERE empresa_id={t} AND titulo={sql(COURSE_TITLE)}", "QA_COURSE_ALREADY_EXISTS", 0),
    ]
    statements = [
        f"""INSERT INTO qualificacoes_categorias
(nome,codigo,descricao,cor,ativo,empresa_id,dominio_codigo,lms_integrada,created_at,updated_at,deleted_at)
VALUES ('TREINAMENTO EAD',{sql(CATEGORY)},'QA_ONLY_PLAYER3_SYNTHETIC','#64748b',1,{t},'OPERACOES',1,datetime('now'),datetime('now'),NULL);""",
        assertion(f"SELECT COUNT(*) FROM qualificacoes_categorias WHERE id={category} AND empresa_id=999006 AND lms_integrada=1", "QA_CATEGORY_POSTCONDITION_FAILED"),
        f"""INSERT INTO qualificacoes_tipos
(tipo,codigo,nome,descricao,categoria_id,categoria,carga_horaria,validade,vencimento_fim_mes,observacoes,ativo,empresa_id,created_at,updated_at,deleted_at)
VALUES ('TREINAMENTO',{sql(TYPE)},{sql(COURSE_TITLE)},'QA_ONLY_PLAYER3_SYNTHETIC',
{category},'TREINAMENTO EAD',1,12,0,'QA_ONLY_PLAYER3_SYNTHETIC',1,{t},datetime('now'),datetime('now'),NULL);""",
        assertion(f"SELECT COUNT(*) FROM qualificacoes_tipos WHERE id={qual_type} AND categoria_id={category} AND empresa_id=999006", "QA_TYPE_POSTCONDITION_FAILED"),
        f"""INSERT INTO lms_cursos
(empresa_id,titulo,descricao,categoria,carga_horaria_minutos,qualificacao_tipo_id,
gerar_qualificacao_ao_concluir,ativo,publicado,version_tag,tipo_conteudo,
scorm_package_r2_prefix,scorm_launch_file,observacoes,created_at,updated_at,deleted_at)
VALUES ({t},{sql(COURSE_TITLE)},'QA_ONLY_PLAYER3_SYNTHETIC','QA',60,{qual_type},
1,1,1,{sql(COURSE_VERSION)},'scorm',NULL,NULL,'QA_ONLY_PLAYER3_SYNTHETIC',
datetime('now'),datetime('now'),NULL);""",
        assertion(f"SELECT COUNT(*) FROM lms_cursos WHERE id={course} AND empresa_id=999006 AND tipo_conteudo='scorm' AND scorm_package_r2_prefix IS NULL AND scorm_launch_file IS NULL", "QA_COURSE_POSTCONDITION_FAILED"),
        f"INSERT INTO lms_native_catalog_activation(curso_id,empresa_id) VALUES ({course},{t});",
        assertion(f"SELECT COUNT(*) FROM lms_native_catalog_activation WHERE empresa_id=999006 AND curso_id={course}", "QA_MARKER_POSTCONDITION_FAILED"),
        f"SELECT id AS synthetic_qa_course_id, empresa_id FROM lms_cursos WHERE id={course};",
    ]
    # The two stage SQL files are NOT executable unless a separate protected
    # workflow checks approval/lock, D1 Time Travel, SHA and exact plan hash.
    return "\n".join(["-- REVIEW_ONLY; NO REMOTE APPLY; PHASE BOOTSTRAP",
                      "-- staging D1 "+DB+" uuid="+DB_UUID,
                      "-- reviewed SHA "+release_sha,
                      *preflight, *statements, ""])


def edition(candidate: Path, plan_file: Path, approver_user_id: int):
    guard(type(approver_user_id) is int and approver_user_id > 0,
          "QA_APPROVER_USER_ID_REQUIRED")
    guard(plan_file.is_file() and not plan_file.is_symlink(),
          "QA_PUBLICATION_PLAN_REQUIRED")
    plan = json.loads(plan_file.read_text())
    guard(isinstance(plan, dict) and
          plan == blueprint.compose(candidate, plan.get("targetTenantId"),
                                    plan.get("targetCourseId"), plan.get("releaseSha"),
                                    plan.get("publicHtml5Origin")),
          "QA_PUBLICATION_PLAN_MISMATCH")
    curso = plan["targetCourseId"]
    dig = plan["artifactSha256"]
    version = plan["expectedNativePackageVersion"]
    source = plan["sourceZipSha256"]
    objects = {o["key"].rsplit("/", 1)[-1]: o for o in plan["privateR2Objects"]}
    psha = objects["player3-approved-policy.json"]["sha256"]
    bsha = objects["player3-server-private-bank.json"]["sha256"]
    prefix = plan["stagedR2Prefix"]
    course_where = f"empresa_id=999006 AND id={curso} AND titulo={sql(COURSE_TITLE)} AND version_tag={sql(COURSE_VERSION)} AND tipo_conteudo='scorm' AND ativo=1 AND publicado=1 AND deleted_at IS NULL"
    edition_where = f"empresa_id=999006 AND curso_id={curso} AND artifact_sha256={sql(dig)}"
    edition_id = f"(SELECT id FROM lms_native_edicoes WHERE {edition_where})"
    approval_where = f"u.id={approver_user_id} AND u.deleted_at IS NULL AND COALESCE(u.active,1)=1"
    checks = [
        assertion(f"SELECT COUNT(*) FROM lms_cursos WHERE {course_where}", "QA_EXPECTED_SYNTHETIC_COURSE_MISSING"),
        assertion(f"SELECT COUNT(*) FROM lms_native_catalog_activation WHERE empresa_id=999006 AND curso_id={curso}", "QA_MARKER_MISSING"),
        assertion(f"SELECT COUNT(*) FROM lms_native_edicoes WHERE empresa_id=999006 AND curso_id={curso}", "QA_EDITION_PREEXISTS", 0),
        assertion(f"SELECT COUNT(*) FROM lms_player3_politicas WHERE empresa_id=999006 AND curso_id={curso}", "QA_POLICY_PREEXISTS", 0),
        assertion(f"SELECT COUNT(*) FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=999006 WHERE {approval_where} AND LOWER(TRIM(u.email))={sql(ADMIN_EMAIL)} AND LOWER(TRIM(ue.role)) IN ('admin','administrador','gestor','manager')", "QA_APPROVER_NOT_TENANT_ADMIN"),
    ]
    return "\n".join([
        "-- REVIEW_ONLY; NO REMOTE APPLY; PHASE EDITION AFTER R2+HTTPS HASH VERIFY",
        "-- staging D1 "+DB+" uuid="+DB_UUID,
        "-- EXACT PRIVATE R2 AND PUBLIC HTTPS READBACK REQUIRED OUTSIDE SQL",
        "-- reviewed SHA "+plan["releaseSha"], *checks,
        f"""INSERT INTO lms_native_edicoes(empresa_id,curso_id,artifact_sha256,package_version,r2_prefix,status)
VALUES (999006,{curso},{sql(dig)},{sql(version)},{sql(prefix)},'DRAFT');""",
        assertion(f"SELECT COUNT(*) FROM lms_native_edicoes WHERE {edition_where} AND status='DRAFT'", "QA_DRAFT_EDITION_FAILED"),
        f"UPDATE lms_native_edicoes SET status='REVIEWED',reviewed_at=datetime('now') WHERE {edition_where} AND status='DRAFT';",
        assertion(f"SELECT COUNT(*) FROM lms_native_edicoes WHERE {edition_where} AND status='REVIEWED' AND reviewed_at IS NOT NULL", "QA_EDITION_REVIEW_FAILED"),
        f"UPDATE lms_native_edicoes SET status='PUBLISHED',published_at=datetime('now') WHERE {edition_where} AND status='REVIEWED';",
        assertion(f"SELECT COUNT(*) FROM lms_native_edicoes WHERE {edition_where} AND status='PUBLISHED' AND published_at IS NOT NULL", "QA_EDITION_PUBLISH_FAILED"),
        f"""INSERT INTO lms_player3_politicas(edicao_id,empresa_id,curso_id,source_sha256,policy_sha256,bank_sha256,estado)
VALUES ({edition_id},999006,{curso},{sql(source)},{sql(psha)},{sql(bsha)},'DRAFT');""",
        f"""UPDATE lms_player3_politicas SET estado='APPROVED',approved_at=datetime('now'),approver_user_id={approver_user_id}
WHERE edicao_id={edition_id} AND empresa_id=999006 AND curso_id={curso} AND estado='DRAFT';""",
        assertion(f"SELECT COUNT(*) FROM lms_player3_politicas WHERE edicao_id={edition_id} AND empresa_id=999006 AND curso_id={curso} AND estado='APPROVED' AND approver_user_id={approver_user_id}", "QA_POLICY_APPROVAL_FAILED"),
        f"SELECT id AS synthetic_qa_edition_id,empresa_id,curso_id FROM lms_native_edicoes WHERE {edition_where};",
        "",
    ])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase",choices=["bootstrap","edition"],required=True)
    parser.add_argument("--candidate",type=Path,required=True)
    parser.add_argument("--release-sha")
    parser.add_argument("--publication-plan",type=Path)
    parser.add_argument("--approver-user-id",type=int)
    parser.add_argument("--out",type=Path,required=True)
    options=parser.parse_args()
    try:
        if options.phase=="bootstrap":
            guard(options.release_sha is not None and
                  options.publication_plan is None and
                  options.approver_user_id is None, "QA_BOOTSTRAP_ARGS_INVALID")
            body=bootstrap(options.candidate,options.release_sha)
        else:
            guard(options.release_sha is None and
                  options.publication_plan is not None and
                  options.approver_user_id is not None, "QA_EDITION_ARGS_INVALID")
            body=edition(options.candidate,options.publication_plan,options.approver_user_id)
        target=options.out
        guard(not target.exists() and not target.is_symlink() and
              not target.resolve().is_relative_to(ROOT),
              "QA_SQL_PLAN_OUTPUT_MUST_BE_PRIVATE_NEW")
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"w",encoding="utf8") as file:
            file.write(body)
        os.chmod(target,0o600)
        print(json.dumps({"status":"REVIEW_ONLY_NO_REMOTE_APPLY",
                          "phase":options.phase,
                          "sqlSha256":hashlib.sha256(body.encode()).hexdigest(),
                          "remoteWrites":0},sort_keys=True))
    except (Denied, ValueError, OSError, KeyError, TypeError,
            json.JSONDecodeError, blueprint.PublicationDenied):
        parser.exit(1,"QA_SQL_PLAN_GENERATION_DENIED\n")


if __name__=="__main__":
    main()
