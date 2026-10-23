// Shared Worker and offline validator for bounded SCORM ZIP member streams.
import {createHash} from 'node:crypto';
import {createInflateRaw} from 'node:zlib';
import {Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
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
async function read(source,start,len,size){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(len)||start<0||len<0||start+len>size)bad('INVALID_RANGE');
 const b=Buffer.from(await source.read(start,len));
 if(b.length!==len)bad('TRUNCATED');
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
async function checksumZip(source){
 const h=createHash('sha256');let count=0;
 for await(const data of source.stream(0,source.size)){count+=data.length;h.update(data);if(count>source.size)bad('ZIP_SOURCE_OVERFLOW')}
 return {sha:h.digest('hex'),bytes:count};
}
// Same bounded validator works with a local file or an explicitly scoped
// read-only R2 range source. No package activation or remote writes.
// Consume local headers and compressed payloads in one sequential object
// stream. It avoids hundreds of R2 range requests for media-heavy courses.
async function createZipCursor(stream){
 const iterator=stream[Symbol.asyncIterator]();
 let pending=Buffer.alloc(0),position=0;
 async function* pull(bytes){
  if(!Number.isSafeInteger(bytes)||bytes<0)bad('CURSOR_BYTES_INVALID');
  while(bytes>0){
   if(!pending.length){
    const item=await iterator.next();
    if(item.done)bad('ZIP_STREAM_TRUNCATED');
    pending=Buffer.from(item.value);
    if(!pending.length)bad('ZIP_EMPTY_CHUNK');
   }
   const size=Math.min(bytes,pending.length);
   const piece=pending.subarray(0,size);
   pending=pending.subarray(size);
   bytes-=size;position+=size;
   yield piece;
  }
 }
 async function small(bytes){
  if(bytes>128*1024)bad('CURSOR_HEADER_LIMIT');
  const chunks=[];
  for await(const part of pull(bytes))chunks.push(part);
  return Buffer.concat(chunks,bytes);
 }
 async function skip(to){
  if(to<position)bad('ZIP_OVERLAPPING_LOCAL_HEADERS');
  for await(const ignored of pull(to-position)){}
 }
 return {pull,small,skip,position:()=>position,
  close:async()=>{await iterator.return?.()}};
}
async function validateSequentialZipSource(source,entries,cdOffset,total,expectedSha,onMember){
 const actual=await checksumZip(source);
 if(actual.bytes!==source.size||actual.sha!==expectedSha)bad('ZIP_SHA256_MISMATCH');
 const ordered=entries.slice().sort((a,b)=>a.localOffset-b.localOffset);
 const cursor=await createZipCursor(source.stream(0,cdOffset));
 const summaries=[];
 try{
  for(const e of ordered){
   await cursor.skip(e.localOffset);
   const h=await cursor.small(30);
   if(u32(h,0)!==0x04034b50||u16(h,8)!==e.method||u16(h,6)!==e.flags)bad('LOCAL_MISMATCH');
   const len=u16(h,26),ext=u16(h,28);
   if(!len)bad('LOCAL_NAME_MISSING');
   const localName=await cursor.small(len);
   if(safeName(localName)!==e.name)bad('LOCAL_NAME_MISMATCH');
   if(ext)await cursor.skip(cursor.position()+ext);
   const end=cursor.position()+e.compressed;
   if(end>cdOffset)bad('LOCAL_PAYLOAD_RANGE');
   let length=0,crc=0xffffffff;
   const hash=createHash('sha256');
   const memberData=onMember?new Uint8Array(e.expanded):null;
   let memberOffset=0;
   const sink=new Writable({write(chunk,_enc,done){
    length+=chunk.length;
    if(length>e.expanded||length>LIMIT.member)
     return done(Error('F5_STREAMED_ZIP_MEMBER_OVERFLOW'));
    hash.update(chunk);crc=crcAdd(crc,chunk);
    if(memberData){memberData.set(chunk,memberOffset);memberOffset+=chunk.length;}
    done();
   }});
   if(e.compressed>0){
    if(e.method===8)await pipeline(cursor.pull(e.compressed),createInflateRaw(),sink);
    else await pipeline(cursor.pull(e.compressed),sink);
   }
   if(length!==e.expanded||((crc^0xffffffff)>>>0)!==e.crc)bad('ZIP_CRC_OR_SIZE_MISMATCH');
   const sha256=hash.digest('hex');
   if(onMember)await onMember({path:e.name,data:memberData,sha256,bytes:length});
   summaries.push({path:e.name,sha256,bytes:length});
  }
 }finally{await cursor.close()}
 return {status:'STREAMED_READ_ONLY_PASS_NOT_UPLOAD',zipSha256:actual.sha,zipBytes:actual.bytes,
  expandedBytes:total,members:summaries.length,items:summaries,
  r2Writes:0,d1Writes:0,certificationAuthorized:false};
}
export async function validateZipReader(source,expectedSha,{onMember}={}){
 if(!SHA.test(expectedSha))bad('EXPECTED_SHA_REQUIRED');
 if(!source||!Number.isSafeInteger(source.size)||typeof source.read!=='function'||typeof source.stream!=='function')bad('READER_INVALID');
 const size=source.size;
  if(size<22||size>LIMIT.zip)bad('COMPRESSED_LIMIT');
  const tailStart=Math.max(0,size-65557);
  const tail=await read(source,tailStart,size-tailStart,size);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--){
   if(u32(tail,i)===0x06054b50&&i+22+u16(tail,i+20)===tail.length){eocd=i;break}
  }
  if(eocd<0)bad('EOCD_MISSING');
  if(u16(tail,eocd+4)!==0||u16(tail,eocd+6)!==0||u16(tail,eocd+8)!==u16(tail,eocd+10))bad('MULTI_VOLUME');
  const count=u16(tail,eocd+10),cdSize=u32(tail,eocd+12),cdOffset=u32(tail,eocd+16);
  if(count<1||count>LIMIT.entries||count===0xffff||cdOffset===0xffffffff||cdSize===0xffffffff)bad('ZIP64_OR_ENTRIES');
  if(cdSize>6*MiB||cdOffset+cdSize>tailStart+eocd)bad('CENTRAL_DIRECTORY_LIMIT');
  const cd=await read(source,cdOffset,cdSize,size);let pos=0,total=0;
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
  if(source.sequential===true){return validateSequentialZipSource(source,entries,cdOffset,total,expectedSha,onMember)}
  for(const e of entries){
   const h=await read(source,e.localOffset,30,size);
   if(u32(h,0)!==0x04034b50||u16(h,8)!==e.method||u16(h,6)!==e.flags)bad('LOCAL_MISMATCH');
   const len=u16(h,26),ext=u16(h,28);
   if(len<1)bad('LOCAL_NAME_MISSING');
   const localName=await read(source,e.localOffset+30,len,size);
   if(safeName(localName)!==e.name)bad('LOCAL_NAME_MISMATCH');
   e.start=e.localOffset+30+len+ext;e.end=e.start+e.compressed;
   if(e.end>cdOffset)bad('LOCAL_PAYLOAD_RANGE');
  }
  const intervals=entries.map(e=>[e.start,e.end]).sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<intervals.length;i++)if(intervals[i][0]<intervals[i-1][1])bad('OVERLAPPING_PAYLOAD');
  const actual=await checksumZip(source);
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
    const stream=source.stream(e.start,e.compressed);
    if(e.method===8)await pipeline(stream,createInflateRaw(),sink);
    else await pipeline(stream,sink);
   }
   if(length!==e.expanded||((crc^0xffffffff)>>>0)!==e.crc)bad('ZIP_CRC_OR_SIZE_MISMATCH');
   summaries.push({path:e.name,sha256:h.digest('hex'),bytes:length});
  }
  return {status:'STREAMED_READ_ONLY_PASS_NOT_UPLOAD',zipSha256:actual.sha,zipBytes:actual.bytes,
   expandedBytes:total,members:summaries.length,items:summaries,
   r2Writes:0,d1Writes:0,certificationAuthorized:false};
}
