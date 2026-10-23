/**
 * Inactive protected-runner Cloudflare Queues REST transport.
 * No automatic workflow, credentials, provisioning or staging operation.
 * The caller must pin the queue IDs from an independently verified account
 * inventory and hold the global staging mutex through external signer/readback.
 * Cloudflare bearer tokens exist only in the ephemeral runner (never Worker).
 */
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
import {verifyPrivateQueueReply} from './queue-prepare-transport.mjs';

const HEX32=/^[0-9a-f]{32}$/,HEX40=/^[0-9a-f]{40}$/,HEX64=/^[0-9a-f]{64}$/;
const SCHEMAS=['AIRTRUST_FRMS_QA_QUEUE_PREPARE_V1','AIRTRUST_FRMS_QA_QUEUE_APPLY_V1'];
const deny=()=>{throw Error('FRMS_QA_QUEUE_RUNNER_API_DENIED');};

/** Restricted to a reviewed Queue UUID; accepts no arbitrary endpoint or verb. */
export function privateQueueRunnerApi({accountId,queueId,releaseSha,token,fetcher=fetch}={}){
  if(!HEX32.test(accountId||'')||!HEX32.test(queueId||'')||
     !HEX40.test(releaseSha||'')||
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
      if(!message||typeof message!=='object'||Array.isArray(message)||
         !SCHEMAS.includes(message.schema)||!HEX64.test(message.mac||'')||
         message.sha!==releaseSha||
         message.dbId!==TARGET.db_id||message.tenantId!==999013||
         !message.payloadEnvelope||typeof message.payloadEnvelope!=='object')
        deny();
      const result=await request('',{body:message,content_type:'json'});
      // Push success never proves a private Worker executed the operation.
      return Object.freeze({queued:true,remoteWritesExecutedByRunner:0,
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
      let reply;
      try{reply=JSON.parse(item.body);}catch{deny();}
      if(!reply||typeof reply!=='object'||Array.isArray(reply))deny();
      return Object.freeze({leaseId:item.lease_id,reply});
    },
    /**
     * No response is acked unless it matches run, operation, grant, nonce,
     * SHA, receipt digest and TTL. Malformed replies require reconciliation.
     * This does NOT assert physical R2 readback or D1 4/4 acceptance.
     */
    async consumeExpectedReply({keyHex,expected,now=Date.now()}={}){
      const pulled=await this.pullOne();
      if(!pulled)return null;
      const validated=verifyPrivateQueueReply({
        reply:pulled.reply,keyHex,expected,now});
      await ackVerified(pulled.leaseId);
      return validated;
    },
  });
}
