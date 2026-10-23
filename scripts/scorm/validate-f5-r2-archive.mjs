// AirTrust F5 R2 ZIP source: READ-ONLY, no R2/D1 writes, no route exposure.
// Only call after authenticated tenant/course authorization and approved
// isolated intake; this module is not itself an upload endpoint.
import {validateZipReader} from './validate-f5-streamed-zip.mjs';

const MiB=1024*1024;
function fail(code){throw Error('F5_R2_READ_'+code)}
function bounds(offset,length,size){
 if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>size)
  fail('INVALID_RANGE');
}
function asWebReader(object){
 if(!object?.body||typeof object.body.getReader!=='function')fail('MISSING_BODY');
 return object.body.getReader();
}
export async function createR2ReadOnlyZipSource({bucket,key,expectedPrefix}){
 if(!bucket||typeof bucket.head!=='function'||typeof bucket.get!=='function')
  fail('BUCKET_UNAVAILABLE');
 // Explicit caller-supplied, tenant/course scoped prefix is mandatory.
 if(typeof expectedPrefix!=='string'||!/^lms\/scorm\/[1-9]\d*\/[1-9]\d*\/_intake\/[a-z0-9-]+\/$/.test(expectedPrefix))
  fail('SCOPED_PREFIX_REQUIRED');
 if(typeof key!=='string'||!key.startsWith(expectedPrefix)||
    key.slice(expectedPrefix.length)!=='package.zip')fail('SCOPED_KEY_REQUIRED');
 const obj=await bucket.head(key);
 if(!obj||!Number.isSafeInteger(obj.size)||obj.size<22||obj.size>80*MiB)
  fail('OBJECT_SIZE_OR_MISSING');
 const size=obj.size;
 const etag=typeof obj.httpEtag==='string'&&obj.httpEtag.trim()?obj.httpEtag:null;
 if(!etag)fail('OBJECT_ETAG_REQUIRED');
 const MAX_RANGE_REQUESTS=6; // EOCD, central directory, SHA scan, sequential member scan
 let calls=0,readBytes=0;
 async function* stream(offset,length){
  bounds(offset,length,size);
  if(!length)return;
  if(calls>=MAX_RANGE_REQUESTS)fail('RANGE_REQUEST_BUDGET_EXCEEDED');
  const response=await bucket.get(key,{range:{offset,length}});
  calls++;
  if(!response||response.httpEtag!==etag)fail('OBJECT_REPLACED_OR_MISSING');
  const reader=asWebReader(response);
  let seen=0,finished=false;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done){finished=true;break}
    if(!value||!value.byteLength)fail('EMPTY_RANGE_CHUNK');
    seen+=value.byteLength;
    if(seen>length)fail('RANGE_OVERFLOW');
    readBytes+=value.byteLength;
    yield Buffer.from(value.buffer,value.byteOffset,value.byteLength);
   }
   if(seen!==length)fail('RANGE_SHORT');
  }finally{
   if(!finished)await reader.cancel().catch(()=>{});
   reader.releaseLock();
  }
 }
 async function read(offset,length){
  bounds(offset,length,size);
  if(length>6*MiB)fail('METADATA_RANGE_TOO_LARGE');
  const chunks=[];
  for await(const chunk of stream(offset,length))chunks.push(chunk);
  return Buffer.concat(chunks,length);
 }
 return {size,etag,read,stream,sequential:true,stats:()=>({rangeRequests:calls,rangeBytesRead:readBytes})};
}
export async function validateF5R2ArchiveReadOnly({bucket,key,expectedPrefix,expectedSha256}){
 if(typeof expectedSha256!=='string'||!/^[0-9a-f]{64}$/.test(expectedSha256))
  fail('EXPECTED_SHA_REQUIRED');
 const reader=await createR2ReadOnlyZipSource({bucket,key,expectedPrefix});
 const outcome=await validateZipReader(reader,expectedSha256);
 if(reader.stats().rangeRequests>6)fail('RANGE_REQUEST_BUDGET_EXCEEDED');
 // Detect mutation during validation. Never accept data from changed keys.
 const last=await bucket.head(key);
 if(!last||last.size!==reader.size||last.httpEtag!==reader.etag)fail('OBJECT_CHANGED_DURING_READ');
 return {...outcome,source:'R2_RANGE_READ_ONLY_NOT_WORKER_CERTIFIED',
   r2ReadStats:reader.stats(),r2Writes:0,d1Writes:0,
   activationAuthorized:false,stagingValidated:false};
}
