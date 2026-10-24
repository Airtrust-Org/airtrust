// Narrow, audited delegation: one admin comment in issue #776 authorizes only
// an official staging Worker+Pages dispatch on the exact F4 PR HEAD.
// This is NOT a grant for D1/R2 data write, production or bypass of reviewers.
export function validateF0DelegatedStaging({
  actor,commentId,releaseSha,prNumber,deployWorker,deployFrontend,
  applyMigrations,approvedMigrations,runSmoke,comment,adminPermission,
  nowMs=Date.now()
}) {
  const denied=(reason)=>{throw Error('F0_STAGING_DELEGATION_'+reason);};
  if(actor!=='github-actions[bot]' || !/^[1-9][0-9]*$/.test(String(commentId||'')))
    denied('IDENTITY_OR_COMMENT_ID_DENIED');
  if(!/^[0-9a-f]{40}$/.test(releaseSha||'')||
     String(prNumber)!=='1389'||
     String(deployWorker)!=='true'||String(deployFrontend)!=='true'||
     String(runSmoke)!=='true'||String(applyMigrations)!=='false'||
     String(approvedMigrations||'')!=='')
    denied('RELEASE_SCOPE_DENIED');
  if(String(comment?.id)!==String(commentId)||
     comment?.issue_url!=='https://api.github.com/repos/Airtrust-Org/airtrust/issues/776'||
     comment?.user?.type!=='User'||
     comment?.body!=='AIRTRUST_F0_PLAYER3_STAGING_V1 '+releaseSha||
     comment?.created_at!==comment?.updated_at)
    denied('IMMUTABLE_ADMIN_ISSUE_COMMAND_REQUIRED');
  if(adminPermission!=='admin')denied('COMMENT_AUTHOR_ADMIN_REQUIRED');
  const creation=Date.parse(comment.created_at);
  if(!Number.isFinite(creation) || !Number.isFinite(nowMs)||
     creation>nowMs+120000 || nowMs-creation>4*60*60*1000)
    denied('COMMENT_TOO_OLD_OR_FUTURE');
  return {adminLogin:comment.user.login,commentId:Number(commentId),releaseSha};
}
