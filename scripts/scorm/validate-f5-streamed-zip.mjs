#!/usr/bin/env node
// AirTrust F5. READ-ONLY streaming validation proof for immutable large ZIPs.
// Never uploads to R2, changes D1, approves courses or activates packages.
// Validates central directory, local headers, path safety, original ZIP SHA,
// per-member CRC32 / SHA256 via bounded inflate streams, no full ZIP buffering.
import {createReadStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createInflateRaw} from 'node:zlib';
import {Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const MiB=1024*1024;
const LIMIT={zip:80*MiB,expanded:250*MiB,member:32*MiB,entries:2000,pathBytes:512,pathDepth:20,ratio:200};
const bad=(code)=>{throw Error('F5_STREAMED_ZIP_'+code)};
const SHA=/^[0-9a-f]{64}$/;
const decoder=new TextDecoder('utf-8',{fatal:true});
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let v=i;for(let bit=0;bit<8;bit++)v=v&1?(v>>>1)^0xedb88320:v>>>1;return v>>>0;
});
const crcAdd=(sum,bytes)=>{for(const v of bytes)sum=crcTable[(sum^v)&255]^(sum>>>8);return sum>>>0};
const u16=(b,i)=>b.readUInt16LE(i),u32=(b,i)=>b.readUInt32LE(i);
async function read(fd,start,len,size){
 if(start<0||len<0||start+len>size)bad('INVALID_RANGE');
 const b=Buffer.allocUnsafe(len);
 const {bytesRead}=await fd.read(b,0,len,start);
 if(bytesRead!==len)bad('TRUNCATED');
 return b;
}
function safeName(raw){
 let s;
 try{s=decoder.decode(raw)}catch{bad('ZIP_NAME_UTF8_INVALID')}
 if(!s||s.startsWith('/')||s.includes('\\')||s.includes('\0')||/^[A-Za-z]:/.test(s)||s!==s.normalize('NFC'))bad('ZIP_PATH_UNSAFE');
 let decoded=s;try{decoded=decodeURIComponent(s)}catch{bad('ZIP_PERCENT_ENCODING')}
 if(decoded.startsWith('/')||decoded.includes('\\')||decoded.split('/').some(x=>x==='.'||x==='..'||x===''))bad('ZIP_PATH_TRAVERSAL');
 if(Buffer.byteLength(s,'utf8')>LIMIT.pathBytes||s.split('/').length>LIMIT.pathDepth)bad('ZIP_PATH_LIMIT');
 return s;
}
async function checksumZip(path){
 const h=createHash('sha256');let count=0;
 for await(const data of createReadStream(path,{highWaterMark:128*1024})){count+=data.length;h.update(data)}
 return {sha:h.digest('hex'),bytes:count};
}
export async function validateStreamedZip(path,expectedSha){
 if(!SHA.test(expectedSha))bad('EXPECTED_SHA_REQUIRED');
 const fp=resolve(path),fd=await open(fp,'r');
 try{
  const {size}=await fd.stat();
  if(size<22||size>LIMIT.zip)bad('COMPRESSED_LIMIT');
  const tailStart=Math.max(0,size-65557);
  const tail=await read(fd,tailStart,size-tailStart,size);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--){
   if(u32(tail,i)===0x06054b50&&i+22+u16(tail,i+20)===tail.length){eocd=i;break}
  }
  if(eocd<0)bad('EOCD_MISSING');
  if(u16(tail,eocd+4)!==0||u16(tail,eocd+6)!==0||u16(tail,eocd+8)!==u16(tail,eocd+10))bad('MULTI_VOLUME');
  const count=u16(tail,eocd+10),cdSize=u32(tail,eocd+12),cdOffset=u32(tail,eocd+16);
  if(count<1||count>LIMIT.entries||count===0xffff||cdOffset===0xffffffff||cdSize===0xffffffff)bad('ZIP64_OR_ENTRIES');
  if(cdSize>6*MiB||cdOffset+cdSize>tailStart+eocd)bad('CENTRAL_DIRECTORY_LIMIT');
  const cd=await read(fd,cdOffset,cdSize,size);let pos=0,total=0;
  const entries=[],paths=new Set();
  for(let j=0;j<count;j++){
   if(pos+46>cd.length||u32(cd,pos)!==0x02014b50)bad('CENTRAL_SIGNATURE');
   const flags=u16(cd,pos+8),method=u16(cd,pos+10),crc=u32(cd,pos+16),
    compressed=u32(cd,pos+20),expanded=u32(cd,pos+24),
    nlen=u16(cd,pos+28),extra=u16(cd,pos+30),comment=u16(cd,pos+32),
    localOffset=u32(cd,pos+42);
   const end=pos+46+nlen+extra+comment;
   if(end>cd.length||nlen===0||flags&1||![0,8].includes(method))bad('ENTRY_UNSUPPORTED');
   const name=safeName(cd.subarray(pos+46,pos+46+nlen));
   if(name.endsWith('/')){pos=end;continue}
   const k=name.toLocaleLowerCase('en-US');
   if(paths.has(k))bad('ZIP_DUPLICATE_PATH');
   paths.add(k);
   const unixMode=u32(cd,pos+38)>>>16;
   if((unixMode&0xf000)===0xa000)bad('ZIP_SYMLINK');
   total+=expanded;
   if(expanded>LIMIT.member||total>LIMIT.expanded||compressed===0&&expanded!==0)bad('EXPANDED_LIMIT');
   if(expanded>1024&&expanded/Math.max(1,compressed)>LIMIT.ratio)bad('COMPRESSION_RATIO');
   if(localOffset>=cdOffset)bad('LOCAL_HEADER_AFTER_CENTRAL');
   entries.push({name,flags,method,crc,compressed,expanded,localOffset});
   pos=end;
  }
  if(pos!==cd.length)bad('CENTRAL_TRAILING_BYTES');
  for(const e of entries){
   const h=await read(fd,e.localOffset,30,size);
   if(u32(h,0)!==0x04034b50||u16(h,8)!==e.method||u16(h,6)!==e.flags)bad('LOCAL_MISMATCH');
   const len=u16(h,26),ext=u16(h,28);
   if(len<1)bad('LOCAL_NAME_MISSING');
   const localName=await read(fd,e.localOffset+30,len,size);
   if(safeName(localName)!==e.name)bad('LOCAL_NAME_MISMATCH');
   e.start=e.localOffset+30+len+ext;e.end=e.start+e.compressed;
   if(e.end>cdOffset)bad('LOCAL_PAYLOAD_RANGE');
  }
  const intervals=entries.map(e=>[e.start,e.end]).sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<intervals.length;i++)if(intervals[i][0]<intervals[i-1][1])bad('OVERLAPPING_PAYLOAD');
  const actual=await checksumZip(fp);
  if(actual.bytes!==size||actual.sha!==expectedSha)bad('ZIP_SHA256_MISMATCH');
  const summaries=[];
  for(const e of entries){
   const h=createHash('sha256');let length=0,crc=0xffffffff;
   const sink=new Writable({write(chunk,_enc,done){
    length+=chunk.length;
    if(length>e.expanded||length>LIMIT.member)return done(Error('F5_STREAMED_ZIP_MEMBER_OVERFLOW'));
    h.update(chunk);crc=crcAdd(crc,chunk);done();
   }});
   if(e.compressed>0){
    const stream=createReadStream(fp,{start:e.start,end:e.end-1,highWaterMark:64*1024});
    if(e.method===8)await pipeline(stream,createInflateRaw(),sink);
    else await pipeline(stream,sink);
   }
   if(length!==e.expanded||((crc^0xffffffff)>>>0)!==e.crc)bad('ZIP_CRC_OR_SIZE_MISMATCH');
   summaries.push({path:e.name,sha256:h.digest('hex'),bytes:length});
  }
  return {status:'STREAMED_READ_ONLY_PASS_NOT_UPLOAD',zipSha256:actual.sha,zipBytes:actual.bytes,
   expandedBytes:total,members:summaries.length,items:summaries,
   r2Writes:0,d1Writes:0,certificationAuthorized:false};
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
