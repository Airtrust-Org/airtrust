#!/usr/bin/env node
// Local-file adapter for the shared Worker/offline bounded ZIP verifier.
// READ-ONLY: this CLI never uploads or changes D1/R2 state.
import {createReadStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {validateZipReader} from '../../worker-airtrust/src/lib/lms/lms-scorm-streamed-zip.mjs';

export async function validateStreamedZip(path,expectedSha){
 const fp=resolve(path),fd=await open(fp,'r');
 try{
  const {size}=await fd.stat();
  const source={
   size,
   async read(start,len){
    const b=Buffer.allocUnsafe(len);
    const {bytesRead}=await fd.read(b,0,len,start);
    if(bytesRead!==len)throw Error('F5_STREAMED_ZIP_TRUNCATED');
    return b;
   },
   stream(start,len){
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(len)||start<0||len<0||start+len>size)
     throw Error('F5_STREAMED_ZIP_INVALID_RANGE');
    return createReadStream(fp,{start,end:start+len-1,highWaterMark:64*1024});
   }
  };
  return await validateZipReader(source,expectedSha);
 }finally{await fd.close()}
}
const direct=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if(direct){
 const [, ,f,sha]=process.argv;
 if(!f||!sha){console.error('usage: node validate-f5-streamed-zip.mjs FILE EXPECTED_SHA256');process.exit(2)}
 try{
  const r=await validateStreamedZip(f,sha);
  console.log(JSON.stringify({status:r.status,zipSha256:r.zipSha256,zipBytes:r.zipBytes,
   expandedBytes:r.expandedBytes,members:r.members,mediaShaChecked:r.items.filter(x=>/\.(?:mp4|jpe?g|png)$/i.test(x.path)).length,
   r2Writes:r.r2Writes}));
 }catch(e){console.error(String(e?.message||e));process.exit(2)}
}
