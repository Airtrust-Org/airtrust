/**
 * Local contract for a trusted caller Durable Object's storage.
 * A single, atomic transaction reserves an exact F0 prepare grant permanently;
 * a crash or rejected downstream RPC must not make it reusable.
 *
 * NOT a deployed caller, grant issuer or authorizer. The storage must be the
 * same strongly consistent, persistent DO instance across all caller runs.
 * Never substitute process memory, eventual-consistency KV or GitHub outputs.
 */
const KEY=/^frms-qa-prepare-grant:([0-9a-f]{40}):([1-9][0-9]{5,13})$/;
const RUN=/^[1-9][0-9]{7,13}$/;
const deny=()=>{throw Error('QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED');};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const grantKey=k=>{
  if(typeof k!=='string')deny();
  const match=KEY.exec(k);
  if(!match)deny();
  return {sha:match[1],grantId:match[2]};
};
const validateValue=(v,identity)=>{
  if(!object(v)||Object.keys(v).sort().join('|')!=='phase|runAttempt|runId|sha'||
     v.sha!==identity.sha||v.phase!=='prepare'||!RUN.test(String(v.runId||''))||
     !Number.isSafeInteger(v.runAttempt)||v.runAttempt<1)deny();
};

/**
 * Implements the transaction/get/put contract of prepareViaPrivateServiceBinding.
 * Restricts each transaction to one exact grant key, one read, and at most one
 * write. A true result without a committed write is rejected. The underlying
 * DurableObjectStorage.transaction handles all-or-nothing commit/rollback.
 */
export function durablePrepareGrantLedger(storage){
  if(!storage||typeof storage.transaction!=='function')deny();
  return Object.freeze({
    async transaction(callback){
      if(typeof callback!=='function')deny();
      try{
        return await storage.transaction(async tx=>{
          if(!tx||typeof tx.get!=='function'||typeof tx.put!=='function')deny();
          let active=true,read=false,writes=0,current=null;
          const api=Object.freeze({
            async get(key){
              if(!active||read||writes)deny();
              grantKey(key);
              read=true;current=key;
              const existing=await tx.get(key);
              // Only an absent key is unused. A malformed or falsy stored
              // value indicates corruption, not an unspent grant.
              if(existing!==undefined)validateValue(existing,grantKey(key));
              return existing;
            },
            async put(key,value){
              if(!active||!read||writes||key!==current)deny();
              const parsed=grantKey(key);
              validateValue(value,parsed);
              // All reads/writes participate in the SAME atomic DO transaction.
              // A persisted null/false/empty value must never be overwritten.
              if((await tx.get(key))!==undefined)deny();
              await tx.put(key,{sha:value.sha,phase:'prepare',
                runId:String(value.runId),runAttempt:value.runAttempt});
              writes=1;
            },
          });
          let outcome;
          try{outcome=await callback(api);}finally{active=false;}
          if(outcome===false&&writes===0)return false;
          if(outcome!==true||writes!==1)deny();
          return true;
        });
      }catch{deny();}
    },
  });
}
