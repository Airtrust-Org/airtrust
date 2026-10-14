/**
 * Player 3 source-backed HTML5 launch descriptor.
 *
 * Only the independently approved, R2 hash-pinned policy may authorize the
 * authoring delivery. This never signs a URL, verifies third-party HTML bytes,
 * or makes a review ZIP publishable: staging QA must still attest the deployed
 * immutable content separately before any learner write or cutover.
 */
export type AuthoredLaunchMetadata = Readonly<{
  schema:'AIRTRUST_PLAYER3_AUTHORED_LAUNCH_V1';
  sourceSha256:string;
  contentSha256:string;
  sourceStageCrosswalkSha256:string;
  /** Hash of JSON-serialized original unit IDs in approved display order. */
  orderedUnitIdsSha256:string;
  answersStripped:true;
  legacyScormDisabled:true;
  reviewedImmutableRelease:true;
}>;

export class AuthoredLaunchError extends Error {
  constructor(readonly code:string){super(code);this.name='AuthoredLaunchError';}
}
const SHA=/^[a-f0-9]{64}$/;
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
const deny=(s:string):never=>{throw new AuthoredLaunchError(s);};
function origin(raw:string|undefined):string|null {
  if(!raw||raw.length>256)return null;
  try{
    const u=new URL(raw);
    return u.protocol==='https:'&&u.href===u.origin+'/'&&
      !u.username&&!u.password&&!u.search&&!u.hash ? u.origin : null;
  }catch{return null;}
}
export function approvedAuthoredLaunch(input:{
  environment:string;
  tenant:number;course:number;
  editionSha256:string;sourceSha256:string;
  originBinding:string|undefined;
  launchTenantAllowlist:string|undefined;
  learnerContent:unknown;
}):Readonly<{contentUrl:string;contentOrigin:string;contentSha256:string;orderedUnitIdsSha256:string}>{
  const {tenant,course,editionSha256,sourceSha256}=input;
  const originValue=origin(input.originBinding);
  const allowed=input.launchTenantAllowlist;
  if(input.environment!=='staging'||!positive(tenant)||!positive(course)||
     !SHA.test(editionSha256)||!SHA.test(sourceSha256)||!originValue||
     !allowed||allowed.includes('*')||
     !allowed.split(',').some(v=>v.trim()===String(tenant))){
    return deny('PLAYER3_AUTHORED_LAUNCH_DISABLED');
  }
  const v=input.learnerContent as Partial<AuthoredLaunchMetadata>|null;
  if(!v||typeof v!=='object'||Array.isArray(v)||
     Object.keys(v).sort().join(',')!==
       'answersStripped,contentSha256,legacyScormDisabled,orderedUnitIdsSha256,reviewedImmutableRelease,schema,sourceSha256,sourceStageCrosswalkSha256'||
     v.schema!=='AIRTRUST_PLAYER3_AUTHORED_LAUNCH_V1'||
     v.sourceSha256!==sourceSha256||!SHA.test(v.contentSha256??'')||
     !SHA.test(v.sourceStageCrosswalkSha256??'')||
     !SHA.test(v.orderedUnitIdsSha256??'')||
     v.answersStripped!==true||v.legacyScormDisabled!==true||
     v.reviewedImmutableRelease!==true){
    return deny('PLAYER3_AUTHORED_SOURCE_NOT_APPROVED');
  }
  // Construct the asset path: never accept a client/query/policy supplied URL.
  // The content delivery deployment itself must be independently attested.
  const path='/player3/'+tenant+'/'+course+'/'+editionSha256+'/'+v.contentSha256+'/index.html';
  return {
    contentOrigin:originValue,
    contentUrl:originValue+path,
    contentSha256:v.contentSha256!,
    orderedUnitIdsSha256:v.orderedUnitIdsSha256!,
  };
}
