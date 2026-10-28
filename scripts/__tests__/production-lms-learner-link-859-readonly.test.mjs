import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateEvidence, normalizeResults, QUERIES } from '../production/lms-learner-link-859-readonly.mjs';

describe('LMS #859 production read-only diagnostic guards', () => {
  it('only static SELECTs scoped to tenant 6, course 67 and case 859', () => {
    for(const sql of Object.values(QUERIES)){
      assert.match(sql.trim(), /^SELECT\\s/);
      assert.match(sql,/m\\.empresa_id=6/);
      assert.match(sql,/m\\.id=859/);
      assert.match(sql,/m\\.curso_id=67/);
      assert.doesNotMatch(sql,/\\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE|CREATE)\\b/i);
    }
    const source=readFileSync(new URL('../production/lms-learner-link-859-readonly.mjs',import.meta.url),'utf8');
    assert.match(source,/--remote/);assert.match(source,/PRODUCTION_SHA_CHANGED/);
    assert.doesNotMatch(source,/console\\.log\\(output\\)/);
  });
  it('does not infer user ownership from a coincident name', () => {
    const e={enrollment_id:859,curso_id:67,empresa_id:6,employee_id:94,
      enrollment_status:'NAO_INICIADO',enrollment_not_deleted:1,employee_active:1,
      employee_not_deleted:1,employee_status:'ATIVO',employee_company_id:6,
      linked_user_count:0,linked_tenant_user_count:0,exact_employee_email_account_count:0};
    const report=evaluateEvidence(e,[{user_id:12,current_linked_employee_id:82,user_active:1,
      membership_company_id:6,already_linked:0,exact_email_match:0,exact_name_match:1}],
      {enrollment_total:4,no_tenant_user_link:2,employee_not_eligible:0});
    assert.equal(report.diagnosis,'NO_LINKED_TENANT_ACCOUNT');
    assert.equal(report.candidates[0].current_linked_employee_id,82);
    assert.equal(report.identity_autolink_executed,false);
    assert.equal(report.writes_executed,false);
  });
  it('rejects malformed D1 responses', () => {
    assert.throws(()=>normalizeResults({results:[]}),/INVALID/);
    assert.deepEqual(normalizeResults([{success:true,results:[{n:1}]}]),[{n:1}]);
  });
});
