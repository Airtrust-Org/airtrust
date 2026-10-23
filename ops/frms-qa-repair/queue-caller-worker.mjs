/**
 * Inactive Cloudflare Queue consumer with no public HTTP endpoint.
 * Deploy only under an exact worker/queue F0 grant, separate least-privilege
 * credentials, and an independently installed Ed25519 approval anchor.
 * The queue is at-least-once; each attempt is transactionally one-use.
 */
import {DurableObject} from 'cloudflare:workers';
import {consumeTrustedQueuePrepare} from './queue-prepare-transport.mjs';
import {TARGET} from '../../scripts/staging/frms-qa-cases-repair-plan.mjs';
const QUEUE='airtrust-frms-qa-private-prepare-staging';
const LEDGER='frms-f0-999013-one-shared-caller';

export class FrmsQaCallerLedger extends DurableObject {
  async prepareMessage(message){
    return consumeTrustedQueuePrepare({message,env:this.env,
      storage:this.ctx.storage,binding:this.env.REPAIR});
  }
}
// No fetch(), scheduled(), RPC exposed over HTTP, or user-controlled SQL.
export default {
  async queue(batch,env){
    if(batch.queue!==QUEUE||!Array.isArray(batch.messages)||
       batch.messages.length!==1||
       env.ENVIRONMENT!=='staging'||env.D1_ID!==TARGET.db_id||
       !env.CALLER_LEDGER?.idFromName||!env.CALLER_LEDGER?.get)
      throw Error('FRMS_QA_QUEUE_BINDING_DENIED');
    for(const message of batch.messages){
      try{
        const stub=env.CALLER_LEDGER.get(env.CALLER_LEDGER.idFromName(LEDGER));
        await stub.prepareMessage(message.body);
      }catch{
        // Invalid, consumed or indeterminate requests MUST NOT automatically
        // retry sensitive preparation; reconciliation needs a new exact grant.
      }finally{
        message.ack();
      }
    }
  },
};
