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
  assert.match(script, /RELEASE_PREFLIGHT_SCOPE="[^"]*,0476,0477,0478,0479,0480"/);
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

test('deploy-staging.yml ledger preflight scope includes 0477-0480', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');
  assert.match(workflow, /--scope=0467,0468,0469,0470,0472,0475,0476,0477,0478,0479,0480/);
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
