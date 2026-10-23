/**
 * Private FRMS Worker preflight: reject unpinned or non-Ed25519 approval
 * authorities before consuming a one-use caller nonce or preparing R2 data.
 * This is a cryptographic configuration check, NOT proof of an independent
 * signer, a deployment grant or permission to apply D1 changes.
 */
import {createHash,createPublicKey,timingSafeEqual} from 'node:crypto';

const HEX64=/^[a-f0-9]{64}$/;
const deny=()=>{throw Error('QA_DEPLOYMENT_NOT_READY');};

export function assertPrivateApprovalAnchor({publicKeyPem,expectedSha256}={}){
  if(typeof publicKeyPem!=='string'||!publicKeyPem.trim()||
     !HEX64.test(expectedSha256||''))deny();
  let digest;
  try{
    const key=createPublicKey(publicKeyPem);
    if(key.asymmetricKeyType!=='ed25519')deny();
    digest=createHash('sha256')
      .update(key.export({type:'spki',format:'der'})).digest();
  }catch{deny();}
  const expected=Buffer.from(expectedSha256,'hex');
  if(expected.length!==digest.length||!timingSafeEqual(digest,expected))deny();
}
