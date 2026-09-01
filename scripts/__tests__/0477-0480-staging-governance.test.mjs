import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const MIGRATIONS = [
  "0477_edb_operational_core.sql",
  "0478_edb_anac_receipt_integrity.sql",
  "0479_edb_relational_integrity.sql",
  "0480_edb_diary_lifecycle_integrity.sql",
];
const VALIDATOR = "scripts/staging/validate-edb-0477-0480-postconditions.sh";

const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

test("0477-0480 are in the staging apply allowlist (apply-approved-migrations.sh)", () => {
  const script = read("scripts/staging/apply-approved-migrations.sh");
  for (const migration of MIGRATIONS) {
    assert.match(script, new RegExp(`APPROVED_MIGRATIONS=\\([^)]*"${migration}"[^)]*\\)`));
  }
});

test("RELEASE_PREFLIGHT_SCOPE includes 0477, 0478, 0479, 0480", () => {
  const script = read("scripts/staging/apply-approved-migrations.sh");
  assert.match(script, /RELEASE_PREFLIGHT_SCOPE="[^"]*,0476,0477,0478,0479,0480/);
});

test("0477-0480 route through the recovery-point runner (D1 Time Travel point captured)", () => {
  const script = read("scripts/staging/apply-approved-migrations.sh");
  const block = script.slice(script.indexOf('if [[ "$migration_basename"'));
  for (const migration of MIGRATIONS) {
    assert.match(block, new RegExp(migration.replace(".", "\\.")));
  }
});

test("0477-0480 are in the recovery-point allowlist and postcondition dispatch", () => {
  const script = read("scripts/staging/apply-approved-migration-with-recovery-point.sh");
  for (const migration of MIGRATIONS) {
    assert.match(script, new RegExp(`"${migration}"`));
  }
  assert.match(
    script,
    /0477_edb_operational_core\.sql\|0478_edb_anac_receipt_integrity\.sql\|0479_edb_relational_integrity\.sql\|0480_edb_diary_lifecycle_integrity\.sql\)\s*\n\s*bash scripts\/staging\/validate-edb-0477-0480-postconditions\.sh/,
  );
});

test('deploy-staging.yml ledger preflight derives the exact approved migration scope from the release checkout', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');
  assert.match(workflow, /APPROVED_MIGRATIONS: \$\{\{ inputs\.approved_migrations \}\}/);
  assert.match(workflow, /--migrations-dir=release\/worker-airtrust\/migrations/);
  assert.match(workflow, /--scope="\$scope_csv"/);
  assert.match(workflow, /release\/worker-airtrust\/migrations\/\$migration/);
  assert.doesNotMatch(
    workflow,
    /migration-ledger-preflight\.mjs --scope=0467,0468,0469,0470,0472,0475,0476,0477,0478,0479,0480/,
  );
});

test("validate-edb-0477-0480-postconditions.sh targets only staging and performs zero writes", () => {
  const script = read(VALIDATOR);
  assert.match(script, /airtrust-db-staging-baseline-20260701/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE|DROP)\b/i);
  execFileSync("bash", ["-n", path.join(ROOT, VALIDATOR)]);
});

test("validate-edb-0477-0480-postconditions.sh refuses a non-staging --target", () => {
  assert.throws(() =>
    execFileSync("bash", [path.join(ROOT, VALIDATOR), "--target=airtrust-db"], { stdio: "pipe" }),
  );
});

test("0477-0480 postcondition trigger names are backed by their reviewed migrations", () => {
  const validator = read(VALIDATOR);
  const triggersByMigration = new Map([
    [
      "0477_edb_operational_core.sql",
      [
        "trg_edb_ciencia_require_snapshot_binding",
        "trg_edb_revisao_require_scope_and_chain",
        "trg_edb_assinatura_require_lifecycle",
        "trg_edb_estado_transition_guard",
        "trg_edb_anac_outbox_require_operator_signed",
      ],
    ],
    [
      "0478_edb_anac_receipt_integrity.sql",
      [
        "trg_edb_anac_outbox_identity_immutable",
        "trg_edb_anac_outbox_no_delete",
        "trg_edb_anac_recibo_require_outbox_scope",
        "trg_edb_anac_recibos_no_update",
        "trg_edb_anac_recibos_no_delete",
      ],
    ],
    [
      "0479_edb_relational_integrity.sql",
      [
        "trg_edb_volume_require_diary_scope",
        "trg_edb_discrepancia_require_revision_scope",
        "trg_edb_acao_manutencao_require_discrepancy_scope",
        "trg_edb_auditoria_require_scope_and_chain",
        "trg_edb_incidente_require_diary_scope",
      ],
    ],
    [
      "0480_edb_diary_lifecycle_integrity.sql",
      [
        "trg_edb_diario_identity_immutable",
        "trg_edb_diario_status_transition_guard",
        "trg_edb_diario_no_delete",
        "trg_edb_volume_status_transition_guard",
        "trg_edb_volume_closure_shape_guard",
        "trg_edb_volume_closed_evidence_immutable",
        "trg_edb_volume_no_delete",
        "trg_edb_incidente_progress_guard",
        "trg_edb_incidente_status_transition_guard",
        "trg_edb_incidente_no_delete",
      ],
    ],
  ]);

  for (const [migrationName, triggers] of triggersByMigration) {
    const migration = read(`worker-airtrust/migrations/${migrationName}`);
    for (const trigger of triggers) {
      assert.match(validator, new RegExp(`\\b${trigger}\\b`));
      assert.match(migration, new RegExp(`CREATE TRIGGER IF NOT EXISTS ${trigger}\\b`));
    }
  }

  assert.doesNotMatch(validator, /trg_edb_anac_recibo_no_update/);
  assert.doesNotMatch(validator, /trg_edb_anac_recibo_no_delete/);
  assert.doesNotMatch(validator, /trg_edb_volume_closing_evidence_immutable/);
  assert.doesNotMatch(validator, /trg_edb_incidente_evidence_write_once/);
});

test("migration-ledger-preflight.mjs discovers migrations in release/worker-airtrust/migrations", () => {
  const script = read("scripts/staging/migration-ledger-preflight.mjs");
  assert.match(script, /release.*worker-airtrust.*migrations/);
});
