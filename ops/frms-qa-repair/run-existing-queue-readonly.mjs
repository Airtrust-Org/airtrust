// Protected Actions diagnostic: existing staging bearer only, GET queue names.
// Never prints a token, object identifier, payload, lease or token policy.
import {probeExistingQueueMetadata} from './probe-existing-queue-access.mjs';
const r=await probeExistingQueueMetadata({
  accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
  token:process.env.FRMS_PROBE_TOKEN,
});
console.log('FRMS_EXISTING_STAGING_QUEUE_GET='+JSON.stringify(r));
// A missing Queue is a documented physical blocker, not evidence of readiness.
// Read metadata cannot certify write/ack rights; no deployment is attempted.
