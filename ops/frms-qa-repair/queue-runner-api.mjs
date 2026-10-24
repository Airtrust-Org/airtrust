/**
 * Inactive protected-runner Cloudflare Queues REST transport.
 * No automatic workflow, credentials, provisioning or staging operation.
 * The caller must pin the queue IDs from an independently verified account
 * inventory and hold the global staging mutex through external signer/readback.
 * Cloudflare bearer tokens exist only in the ephemeral runner (never Worker).
 */
import {createHmac,timingSafeEqual} from 'node:crypto';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import {verifyPrivateQueueReply} from './queue-prepare-transport.mjs';

const HEX32=/^[0-9a-f]{32}$/,HEX40=/^[0-9a-f]{40}$/,HEX64=/^[0-9a-f]{64}$/;
const SCHEMAS=['AIRTRUST_FRMS_QA_QUEUE_PREPARE_V1','AIRTRUST_FRMS_QA_QUEUE_APPLY_V1'];
const MESSAGE_FIELDS=['schema','sha','dbId','tenantId','grantId','runId',
  'runAttempt','issuedAt','expiresAt','callerAuth','payloadEnvelope','mac'];
const ENVELOPE_FIELDS=['version','iv','ciphertext','tag'];
const deny=()=>{throw Error('FRMS_QA_QUEUE_RUNNER_API_DENIED');};
const exact=(value,keys)=>value&&typeof value==='object'&&
  !Array.isArray(value)&&
  Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
const canonical64=(value,maxLength)=>typeof value==='string'&&
  value.length>0&&value.length<=maxLength&&
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)&&
  Buffer.from(value,'base64').toString('base64')===value;

/** Restricted to a reviewed Queue UUID; accepts no arbitrary endpoint or verb. */
export function privateQueueRunnerApi({accountId,queueId,releaseSha,keyHex,
  token,fetcher=fetch}={}){
  if(!HEX32.test(accountId||'')||!HEX32.test(queueId||'')||
     !HEX40.test(releaseSha||'')||!HEX64.test(keyHex||'')||
     typeof token!=='string'||!token.trim()||typeof fetcher!=='function')deny();
  const endpoint='https://api.cloudflare.com/client/v4/accounts/'+accountId+
    '/queues/'+queueId+'/messages';
  const request=async(path,payload)=>{
    let response,doc;
    try{
      response=await fetcher(endpoint+path,{
        method:'POST',redirect:'manual',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',
          Accept:'application/json'},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
      });
      if(response?.status!==200||response.redirected===true)deny();
      doc=await response.json();
    }catch{deny();}
    if(!doc||doc.success!==true||!doc.result||typeof doc.result!=='object')
      deny();
    return doc.result;
  };
  // Not exposed as a public method: callers cannot acknowledge a Queue lease
  // without passing the authenticated correlation check below.
  const ackVerified=async leaseId=>{
    if(typeof leaseId!=='string'||leaseId.length<16||leaseId.length>4096)deny();
    const result=await request('/ack',{acks:[{lease_id:leaseId}],retries:[]});
    if(result.ackCount!==1||result.retryCount!==0||
       (result.warnings&&Object.keys(result.warnings).length))deny();
  };
  return Object.freeze({
    /** One signed request produced only by an independently verified F0 grant. */
    async pushSigned(message){
      // The Queue itself is not an encryption boundary. Reject all extra
      // fields, including accidentally forwarded tokens, raw manifest,
      // receipts, recovery bookmarks or arbitrary input.
      if(!exact(message,MESSAGE_FIELDS)||
         !SCHEMAS.includes(message.schema)||!HEX64.test(message.mac||'')||
         message.sha!==releaseSha||
         message.dbId!==TARGET.db_id||message.tenantId!==999013||
         !exact(message.payloadEnvelope,ENVELOPE_FIELDS)||
         message.payloadEnvelope.version!==1||
         !canonical64(message.payloadEnvelope.iv,16)||
         Buffer.from(message.payloadEnvelope.iv,'base64').length!==12||
         !canonical64(message.payloadEnvelope.tag,24)||
         Buffer.from(message.payloadEnvelope.tag,'base64').length!==16||
         !canonical64(message.payloadEnvelope.ciphertext,100000)||
         Buffer.from(message.payloadEnvelope.ciphertext,'base64').length===0)
        deny();
      const toSign=Object.fromEntries(MESSAGE_FIELDS.filter(k=>k!=='mac')
        .map(k=>[k,message[k]]));
      const expectedMac=createHmac('sha256',Buffer.from(keyHex,'hex'))
        .update(JSON.stringify(toSign)).digest();
      const gotMac=Buffer.from(message.mac,'hex');
      if(gotMac.length!==expectedMac.length||
         !timingSafeEqual(gotMac,expectedMac))deny();
      const result=await request('',{body:message,content_type:'json'});
      // Push success never proves a private Worker executed the operation.
      return Object.freeze({queued:true,queueMessagesWritten:1,d1Writes:0,
        receiptConfirmed:false,remoteMessageMetadataPresent:!!result.metadata});
    },
    /** Exactly one result at a time. Cloudflare lease is never logged. */
    async pullOne(){
      const result=await request('/pull',
        {batch_size:1,visibility_timeout_ms:30000});
      if(!Array.isArray(result.messages)||result.messages.length>1)deny();
      if(result.messages.length===0)return null;
      const item=result.messages[0];
      if(!item||typeof item.lease_id!=='string'||
         item.lease_id.length<16||item.lease_id.length>4096||
         typeof item.body!=='string'||item.body.length>100000)deny();
      // Cloudflare HTTP pull serializes content_type=json as RFC4648 Base64,
      // not a raw JSON body. A UTF-8 JSON.parse directly on item.body would
      // quarantine every legitimate result even when HMAC/AES-GCM are valid.
      if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.body))deny();
      let reply;
      try{
        const decoded=Buffer.from(item.body,'base64');
        if(!decoded.length||decoded.toString('base64')!==item.body||
           decoded.length>75000)deny();
        const text=decoded.toString('utf8');
        if(!Buffer.from(text,'utf8').equals(decoded))deny();
        reply=JSON.parse(text);
      }catch{deny();}
      if(!reply||typeof reply!=='object'||Array.isArray(reply))deny();
      return Object.freeze({leaseId:item.lease_id,reply});
    },
    /**
     * No response is acked unless it matches run, operation, grant, nonce,
     * SHA, receipt digest and TTL. Malformed replies require reconciliation.
     * This does NOT assert physical R2 readback or D1 4/4 acceptance.
     */
    async consumeExpectedReply({keyHex,expected,now=Date.now()}={}){
      // Do not even lease a result before the trusted runner has pinned the
      // exact correlation. Otherwise an invalid invocation could hide a
      // legitimate one-use receipt until Cloudflare's visibility timeout.
      if(!HEX64.test(keyHex||'')||
         !exact(expected,['operation','sha','runId','runAttempt',
           'grantId','requestNonce'])||
         expected.sha!==releaseSha||
         !['prepare','apply'].includes(expected.operation)||
         !/^[1-9][0-9]{5,13}$/.test(expected.grantId||'')||
         !/^[1-9][0-9]{7,13}$/.test(String(expected.runId||''))||
         !Number.isSafeInteger(expected.runAttempt)||expected.runAttempt<1||
         !HEX64.test(expected.requestNonce||'')||
         !Number.isFinite(now))deny();
      const pulled=await this.pullOne();
      if(!pulled)return null;
      const validated=verifyPrivateQueueReply({
        reply:pulled.reply,keyHex,expected,now});
      await ackVerified(pulled.leaseId);
      return validated;
    },
  });
}
