import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const STALE = [
  "0477_edb_operational_core.sql",
  "0478_edb_anac_receipt_integrity.sql",
  "0479_edb_relational_integrity.sql",
  "0480_edb_diary_lifecycle_integrity.sql",
];

const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

test("historical eDB 0477-0480 placeholders are not staging-approved", () => {
  const outer = read("scripts/staging/apply-approved-migrations.sh");
  const recovery = read("scripts/staging/apply-approved-migration-with-recovery-point.sh");

  for (const migration of STALE) {
    assert.doesNotMatch(
      outer,
      new RegExp(`APPROVED_MIGRATIONS=\\([^)]*"${migration.replace(".", "\\.")}"[^)]*\\)`),
    );
    assert.doesNotMatch(
      recovery,
      new RegExp(`APPROVED_MIGRATIONS=\\([^)]*"${migration.replace(".", "\\.")}"[^)]*\\)`),
    );
  }
});

test("release ledger scope does not pretend 0477-0480 exist on current main", () => {
  const script = read("scripts/staging/apply-approved-migrations.sh");
  const match = /RELEASE_PREFLIGHT_SCOPE="([^"]+)"/.exec(script);
  assert.ok(match);
  const scope = new Set(match[1].split(","));
  for (const prefix of ["0477", "0478", "0479", "0480"]) {
    assert.equal(scope.has(prefix), false);
  }
  assert.equal(scope.has("0481"), true);
  assert.equal(scope.has("0482"), true);
});

test("recovery-point dispatcher has no reachable 0477-0480 postcondition route", () => {
  const script = read("scripts/staging/apply-approved-migration-with-recovery-point.sh");
  assert.doesNotMatch(
    script,
    /0477_edb_operational_core\.sql\|0478_edb_anac_receipt_integrity\.sql\|0479_edb_relational_integrity\.sql\|0480_edb_diary_lifecycle_integrity\.sql\)/,
  );
});

test("new eDB persistence work must use a monotonic post-0482 migration identity", () => {
  const governance = read("worker-airtrust/src/__tests__/migrations/migration-governance.test.ts");
  assert.doesNotMatch(governance, /expectedLatest\s*=\s*(477|478|479|480)\b/);
});
