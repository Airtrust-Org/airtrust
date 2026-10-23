#!/usr/bin/env node
/** Exact-ZIP, local-only synthetic navigation diagnostic. Not a certification. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {validateNavigationDiagnostic} from './scorm-navigation-diagnostic-driver.mjs';
export const RESUME_ZIP_SHA='a66beb51033394e8ea736e76d1c644a4b2e37e1e7926c37b37b63b5cc0f10d6f';
export function buildResumeDriver(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>1048576)throw Error('RESUME_ZIP_INVALID');
 const sha=createHash('sha256').update(bytes).digest('hex');
 if(sha!==RESUME_ZIP_SHA)throw Error('RESUME_ZIP_SHA_DRIFT');
 const driver={
  kind:'LOCAL_NAVIGATION_DIAGNOSTIC_ONLY',activationAuthorized:false,
  packageSha256:sha,launchFile:'index.html',
  requiredContent:[{selector:'#position-title[data-qa-position="1"]'},{selector:'#next'}],
  resume:{actions:[{op:'click',selector:'#next'},{op:'click',selector:'#finish'}],
   assertion:{selector:'#position-title[data-qa-position="2"]',state:'visible'}}
 };
 validateNavigationDiagnostic(driver,sha,unzipSync(bytes));
 return driver;
}
function main(){
 if(process.env.CLOUDFLARE_API_TOKEN||process.env.AIRTRUST_REMOTE_DB)throw Error('RESUME_REMOTE_DENIED');
 if(process.argv.length!==4)throw Error('USAGE_ZIP_DRIVER');
 const zip=resolve(process.argv[2]),out=resolve(process.argv[3]);
 const driver=buildResumeDriver(new Uint8Array(readFileSync(zip)));
 mkdirSync(dirname(out),{recursive:true});
 writeFileSync(out,JSON.stringify(driver,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({sha:driver.packageSha256,scope:driver.kind,activationAuthorized:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)main();
