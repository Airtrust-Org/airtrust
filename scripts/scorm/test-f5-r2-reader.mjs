import {strict as assert} from 'node:assert';
import {createReadStream,readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateF5R2ArchiveReadOnly} from './validate-f5-r2-archive.mjs';

const scope='lms/scorm/6/42/_intake/01234567-89ab-4def-8012-112233445566/';
const key=scope+'package.zip';
const dir=mkdtempSync(join(tmpdir(),'f5-r2-read-'));
const archive=join(dir,'fixture.zip');
function makeStoredZip(){
 // Deterministic one-file ZIP: no dependencies and no hidden browser.
 const name=Buffer.from('lesson.txt'),data=Buffer.from('Sample lesson');
 let crc=0xffffffff;
 const table=Uint32Array.from({length:256},(_,i)=>{
  let n=i;for(let j=0;j<8;j++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;
 });
 for(const c of data)crc=table[(crc^c)&255]^(crc>>>8);
 crc=(crc^0xffffffff)>>>0;
 const loc=Buffer.alloc(30);loc.writeUInt32LE(0x04034b50,0);loc.writeUInt16LE(20,4);
 loc.writeUInt32LE(crc,14);loc.writeUInt32LE(data.length,18);loc.writeUInt32LE(data.length,22);loc.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
 central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);
 central.writeUInt16LE(name.length,28);
 const cd=Buffer.concat([central,name]);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);
 end.writeUInt16LE(1,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(loc.length+name.length+data.length,16);
 writeFileSync(archive,Buffer.concat([loc,name,data,cd,end]));
}
function fakeBucket({etagDrift=false,truncated=false}={}){
 const data=readFileSync(archive),size=data.length;
 let reads=0,writeCalls=0;
 return {
  counters:()=>({reads,writeCalls}),
  async head(){return {size,httpEtag:'"etag-123"'}},
  async get(requested,{range}){
   assert.equal(requested,key);
   reads++;
   const bytes=data.subarray(range.offset,range.offset+range.length-(truncated?1:0));
   const web=Readable.toWeb(Readable.from([bytes]));
   return {httpEtag:etagDrift&&reads>1?'"etag-456"':'"etag-123"',body:web};
  },
  async put(){writeCalls++;throw Error('No writes expected')}
 };
}
try{
 makeStoredZip();
 const sha=createHash('sha256').update(readFileSync(archive)).digest('hex');
 const bucket=fakeBucket();
 const result=await validateF5R2ArchiveReadOnly({bucket,key,expectedPrefix:scope,expectedSha256:sha});
 assert.equal(result.zipSha256,sha);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].path,'lesson.txt');
 assert.equal(result.items[0].bytes,13);
 assert.equal(result.r2Writes,0);
 assert.equal(bucket.counters().writeCalls,0);
 assert(bucket.counters().reads>=4);
 assert(bucket.counters().reads<=6,'R2 GET budget exceeded');
 await assert.rejects(()=>validateF5R2ArchiveReadOnly({bucket,key:'lms/scorm/6/43/_intake/other/package.zip',expectedPrefix:scope,expectedSha256:sha}),/SCOPED_KEY_REQUIRED/);
 await assert.rejects(()=>validateF5R2ArchiveReadOnly({bucket,key,expectedPrefix:'lms/scorm/6/42/',expectedSha256:sha}),/SCOPED_PREFIX_REQUIRED/);
 await assert.rejects(()=>validateF5R2ArchiveReadOnly({bucket:key?fakeBucket():null,key,expectedPrefix:scope,expectedSha256:'0'.repeat(64)}),/ZIP_SHA256_MISMATCH/);
 await assert.rejects(()=>validateF5R2ArchiveReadOnly({bucket:fakeBucket({etagDrift:true}),key,expectedPrefix:scope,expectedSha256:sha}),/OBJECT_REPLACED_OR_MISSING/);
 await assert.rejects(()=>validateF5R2ArchiveReadOnly({bucket:fakeBucket({truncated:true}),key,expectedPrefix:scope,expectedSha256:sha}),/RANGE_SHORT/);
 console.log('F5_R2_READER_SELF_TEST_PASS 6_CASES_AND_NO_WRITES');
}finally{rmSync(dir,{recursive:true,force:true})}
