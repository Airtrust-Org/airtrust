/** Private, independently approved pedagogical review: no answer is exported to the attestation. */
import {readFileSync} from 'node:fs';
import {createHash,createPublicKey,verify} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const isSha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fixedCounts={
  cdc5a3cf30e4d37697c1f411977d87e16538bc75a6c03379252bbc2c8c06f6d2:80,
  '8c15a73984591fcea71a4957e306dc8676c40d937537058f2440e52a3748baa7':45,
};
const assert=(v,msg)=>{if(!v)throw Error('SCORM_PEDAGOGICAL_'+msg);};
export function validatePedagogicalReview({reviewFile,driverFile,candidate,
  approvalFile,trustedReviewerKeys}){
  assert(typeof reviewFile==='string'&&typeof driverFile==='string'&&reviewFile!==driverFile,
    'PRIVATE_DOCUMENTS_REQUIRED');
  const bytes=readFileSync(reviewFile),driverBytes=readFileSync(driverFile);
  const r=JSON.parse(bytes.toString('utf8')),driver=JSON.parse(driverBytes.toString('utf8'));
  const expected=fixedCounts[candidate.packageSha256]??candidate.reviewItemCount;
  assert(r?.kind==='AIRTRUST_SCORM_INDEPENDENT_PEDAGOGICAL_REVIEW_V1'&&
    r.packageSha256===candidate.packageSha256&&
    r.approved===true&&r.independentOfPackageAuthor===true,
    'APPROVAL_MISSING_OR_ZIP_DRIFT');
  assert(typeof r.reviewerReference==='string'&&
    /^[a-zA-Z0-9._:-]{6,128}$/.test(r.reviewerReference)&&
    typeof r.approvalReference==='string'&&r.approvalReference.trim().length>=10&&
    r.approvalReference.length<=128,'REVIEWER_IDENTITY_OR_APPROVAL_MISSING');
  assert(typeof r.approvedAt==='string'&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.approvedAt)&&
    Number.isFinite(Date.parse(r.approvedAt))&&
    Date.parse(r.approvedAt)<=Date.now()+60000&&
    Date.now()-Date.parse(r.approvedAt)<365*86400_000,
    'APPROVAL_DATE_INVALID');
  assert(Number.isSafeInteger(expected)&&expected>0&&expected<=2500&&
    r.items?.length===expected,'REVIEW_INVENTORY_INCOMPLETE');
  const seen=new Set();
  for(const item of r.items){
    assert(typeof item?.itemId==='string'&&item.itemId.length>0&&item.itemId.length<=128&&
      !seen.has(item.itemId),'REVIEW_ITEM_DUPLICATED');
    seen.add(item.itemId);
    assert(item.status==='APPROVED'&&
      Number.isSafeInteger(item.selectedIndex)&&item.selectedIndex>=0&&
      item.selectedIndex<=50&&typeof item.rationale==='string'&&
      item.rationale.trim().length>=24&&
      item.reviewerReference===r.reviewerReference,
      'REVIEW_ITEM_UNAPPROVED');
  }
  assert(driver?.packageSha256===candidate.packageSha256&&
    driver.authorReviewed===true&&driver.reviewArtifactSha256===hash(bytes)&&
    driver.schemaVersion===1,'DRIVER_NOT_APPROVED_BY_REVIEW');
  const driverSha256=hash(driverBytes);
  assert(isSha(driverSha256),'DRIVER_SHA_INVALID');
  // A claimed identity in review.json is NOT authorization. A detached Ed25519
  // signature must come from a public key provisioned independently by the
  // protected CI/environment, never shipped alongside the package or driver.
  assert(typeof approvalFile==='string'&&approvalFile!==reviewFile&&
    approvalFile!==driverFile&&trustedReviewerKeys&&
    typeof trustedReviewerKeys==='object'&&!Array.isArray(trustedReviewerKeys),
    'TRUSTED_REVIEW_AUTHORITY_MISSING');
  const approvalBytes=readFileSync(approvalFile);
  const signed=JSON.parse(approvalBytes.toString('utf8'));
  assert(signed&&Object.keys(signed).length===8&&
    ['kind','reviewerKeyId','packageSha256','reviewSha256','driverSha256',
      'reviewerReference','approvedAt','signature'].every(k=>Object.hasOwn(signed,k))&&
    signed.kind==='AIRTRUST_SCORM_PEDAGOGICAL_APPROVAL_ED25519_V1'&&
    typeof signed.reviewerKeyId==='string'&&
    /^[a-zA-Z0-9._:-]{6,128}$/.test(signed.reviewerKeyId)&&
    Object.hasOwn(trustedReviewerKeys,signed.reviewerKeyId)&&
    signed.packageSha256===candidate.packageSha256&&
    signed.reviewSha256===hash(bytes)&&signed.driverSha256===driverSha256&&
    signed.reviewerReference===r.reviewerReference&&
    signed.approvedAt===r.approvedAt&&
    typeof signed.signature==='string'&&
    /^[A-Za-z0-9+/]{86}==$/.test(signed.signature),
    'REVIEW_SIGNATURE_SCOPE_INVALID');
  const trustedIdentity=trustedReviewerKeys[signed.reviewerKeyId];
  assert(trustedIdentity&&typeof trustedIdentity==='object'&&
    Object.keys(trustedIdentity).length===3&&
    trustedIdentity.reviewerReference===r.reviewerReference&&
    trustedIdentity.role==='INDEPENDENT_PEDAGOGICAL_REVIEWER'&&
    typeof trustedIdentity.publicKeyPem==='string'&&
    trustedIdentity.publicKeyPem.includes('BEGIN PUBLIC KEY'),
    'REVIEWER_IDENTITY_NOT_IN_TRUSTED_REGISTRY');
  const publicKey=trustedIdentity.publicKeyPem;
  let key,valid=false,signature;
  const approvalMessage=[
    signed.kind,signed.reviewerKeyId,signed.packageSha256,
    signed.reviewSha256,signed.driverSha256,signed.reviewerReference,
    r.approvalReference,signed.approvedAt,
  ].join('\n');
  try {
    key=createPublicKey(publicKey);
    signature=Buffer.from(signed.signature,'base64');
    valid=key.asymmetricKeyType==='ed25519'&&signature.length===64&&
      verify(null,Buffer.from(approvalMessage,'utf8'),key,signature);
  } catch { valid=false; }
  assert(valid,'INDEPENDENT_REVIEW_SIGNATURE_INVALID');
  return {artifactSha256:hash(bytes),driverSha256,
    reviewerReference:r.reviewerReference,approvalReference:r.approvalReference,
    approvedAt:r.approvedAt,itemCount:expected,
    reviewerKeyId:signed.reviewerKeyId,
    reviewerPublicKeySha256:hash(key.export({type:'spki',format:'der'})),
    approvalSignatureSha256:hash(signature)};
}
