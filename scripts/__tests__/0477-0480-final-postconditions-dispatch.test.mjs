import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const SHARED = "scripts/staging/validate-edb-0477-0480-postconditions.sh";
const CASES = [
  ["0477", "0477_edb_operational_core.sql"],
  ["0478", "0478_edb_anac_receipt_integrity.sql"],
  ["0479", "0479_edb_relational_integrity.sql"],
  ["0480", "0480_edb_diary_lifecycle_integrity.sql"],
];

const read = (relativePath) => readFileSync(path.join(ROOT, relativePath), "utf8");

test("generic Deploy Staging postcondition lookup has explicit eDB 0477-0480 wrappers", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  assert.match(workflow, /validator="scripts\/staging\/validate-\$\{prefix\}-postconditions\.sh"/);

  for (const [prefix, migration] of CASES) {
    const wrapperPath = `scripts/staging/validate-${prefix}-postconditions.sh`;
    const wrapper = read(wrapperPath);
    assert.match(wrapper, /validate-edb-0477-0480-postconditions\.sh/);
    assert.match(wrapper, new RegExp(`--migration="${migration.replaceAll(".", "\\.")}"`));
    assert.match(wrapper, /"\$@"/);
    execFileSync("bash", ["-n", path.join(ROOT, wrapperPath)]);
  }
});

test("eDB final postcondition wrappers fail closed on a production target", () => {
  for (const [prefix] of CASES) {
    const wrapperPath = path.join(ROOT, `scripts/staging/validate-${prefix}-postconditions.sh`);
    assert.throws(() =>
      execFileSync("bash", [wrapperPath, "--target=airtrust-db"], { stdio: "pipe" }),
    );
  }
});

test("shared eDB postcondition validator remains present", () => {
  assert.match(read(SHARED), /EDB_STAGING_POSTCONDITIONS=PASS/);
});
