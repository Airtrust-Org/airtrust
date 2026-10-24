import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {assertPrivateApprovalAnchor} from '../../ops/frms-qa-repair/assert-private-approval-anchor.mjs';

const ed=generateKeyPairSync('ed25519');
const pem=ed.publicKey.export({type:'spki',format:'pem'});
const sha=createHash('sha256').update(ed.publicKey.export({type:'spki',format:'der'})).digest('hex');
const check=opts=>assertPrivateApprovalAnchor({publicKeyPem:pem,expectedSha256:sha,...opts});

test('pins exact Ed25519 SPKI fingerprint without weakening other approval gates',()=>{
  assert.equal(check(),undefined);
});
test('rejects missing, malformed and altered Ed25519 signer authority',()=>{
  for(const publicKeyPem of ['',null,undefined,'synthetic PEM',pem.replace('BEGIN PUBLIC KEY','BEGIN PRIVATE KEY')]){
    assert.throws(()=>check({publicKeyPem}),/QA_DEPLOYMENT_NOT_READY/);
  }
  const another=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
  assert.throws(()=>check({publicKeyPem:another}),/QA_DEPLOYMENT_NOT_READY/);
});
test('rejects non-Ed25519 keys even with their own matching SHA-256 pins',()=>{
  const keys=[
    generateKeyPairSync('rsa',{modulusLength:2048}).publicKey,
    generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey,
  ];
  for(const key of keys){
    const publicKeyPem=key.export({type:'spki',format:'pem'});
    const expectedSha256=createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
    assert.throws(()=>check({publicKeyPem,expectedSha256}),/QA_DEPLOYMENT_NOT_READY/);
  }
});
test('rejects wrong fingerprint and malformed hex without exposing secret or key',()=>{
  for(const expectedSha256 of ['0'.repeat(64),'INVALID',null,undefined,'f'.repeat(63)]){
    assert.throws(()=>check({expectedSha256}),err=>{
      assert.equal(err.message,'QA_DEPLOYMENT_NOT_READY');
      assert.equal(err.message.includes(pem),false);
      return true;
    });
  }
});
