// GET-only capability inventory of already provisioned GitHub staging tokens.
// Read-only probes are NOT authorization to reuse broad tokens in restricted FRMS runtime.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const id='bf9963f4-eb12-439b-a830-20bbf577ac22';
const bucket='airtrust-frms-qa-preimages-staging-private';
const kind=process.env.FRMS_PROBE_KIND;
const endpoints=[
  ['d1_metadata',`/d1/database/${id}`],
  ['r2_bucket',`/r2/buckets/${bucket}`],
  ['r2_custom_domains',`/r2/buckets/${bucket}/domains/custom`],
  ['r2_managed_domain',`/r2/buckets/${bucket}/domains/managed`],
  ['r2_lifecycle',`/r2/buckets/${bucket}/lifecycle`],
];
if(!/^[a-f0-9]{32}$/.test(account||''))throw Error('STAGING_ACCOUNT_ID_MISSING_OR_INVALID');
if(!/^(worker|pages|d1_backup|d1_migration)$/.test(kind||''))throw Error('STAGING_PROBE_KIND_INVALID');
const token=process.env.FRMS_PROBE_TOKEN;
if(!token){
  console.log(`FRMS_STAGING_GET_ONLY_CAPABILITY_${kind}=SECRET_MISSING`);
  process.exit(0);
}
const checks={};
for(const [name,path] of endpoints){
  try {
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{
      method:'GET',redirect:'manual',
      headers:{Authorization:`Bearer ${token}`},
      signal:AbortSignal.timeout(12000),
    });
    // Deliberately do not print response body or sensitive resource fields.
    checks[name]=response.status===200?'GET_200':response.status===404?'GET_404':
      response.status===403?'GET_403':response.status===401?'GET_401':'GET_OTHER';
  }catch {checks[name]='GET_NETWORK_ERROR';}
}
console.log(`FRMS_STAGING_GET_ONLY_CAPABILITY_${kind}=`+JSON.stringify(checks));
console.log('No WRITE/DELETE/PUT/POST, no token values, no grant, no permission escalation.');
// A failed or missing permission is diagnostic data, never a claim of readiness.
