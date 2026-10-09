import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {findTarget,validateActor} from '../ops/production-coordination-profile-activation.mjs';
const email='role-test@airtrust.invalid',hash=createHash('sha256').update(email).digest('hex');
const u={id:77,email,empresa_id:6,perfil:'USER',active:1};
describe('Scoped coordination role production safety',()=>{
  it('requires exactly one active matching account within tenant 6',()=>{
    assert.equal(findTarget([u,{...u,id:33,empresa_id:99}],hash).id,77);
    assert.throws(()=>findTarget([{...u,empresa_id:5}],hash),/TARGET_MISSING/);
    assert.throws(()=>findTarget([u,{...u,id:88}],hash),/AMBIGUOUS/);
    assert.throws(()=>findTarget([{...u,active:0}],hash),/INACTIVE/);
  });
  it('requires immutable expected release SHA and privileged session',()=>{
    const good={mode:'apply',tenant:6,role:'ADMINISTRADOR',liveSha:'a'.repeat(40),expectedSha:'a'.repeat(40)};
    assert.doesNotThrow(()=>validateActor(good));
    assert.throws(()=>validateActor({...good,role:'GESTOR'}),/PLATFORM_ADMIN_REQUIRED/);
    assert.throws(()=>validateActor({...good,tenant:7}),/TENANT_MISMATCH/);
    assert.throws(()=>validateActor({...good,liveSha:'b'.repeat(40)}),/LIVE_SHA_MISMATCH/);
  });
});
