/**
 * Shared HTTP plumbing for the LMS exam routes (admin bank/plans and learner runtime).
 * Strict, bounded JSON parsing and a single code -> status mapping.
 */
import {QuestionBankError} from '../lib/lms-exams/question-bank-domain';
import {QuestionStoreError} from '../services/lms-exams/question-bank-store';
import {ExamAttemptError} from '../services/lms-exams/exam-attempt-store';

const MAX_BODY=48*1024;

export function positive(value:string):number{
  const n=Number(value);
  if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(n)){
    throw new QuestionStoreError('EXAM_QUESTION_REFERENCE_INVALID');
  }
  return n;
}
export async function parseBoundedJson(c: {req:{raw:Request}}):Promise<Record<string,unknown>>{
  const type=c.req.raw.headers.get('content-type')||'';
  if(!/^application\/json(?:;|$)/i.test(type)) {
    throw new QuestionStoreError('EXAM_JSON_CONTENT_TYPE_REQUIRED');
  }
  const declared=Number(c.req.raw.headers.get('content-length')||0);
  if(Number.isFinite(declared) && declared>MAX_BODY){
    throw new QuestionStoreError('EXAM_JSON_BODY_TOO_LARGE');
  }
  const reader=c.req.raw.body?.getReader();
  if(!reader)throw new QuestionStoreError('EXAM_JSON_REQUIRED');
  const chunks:Uint8Array[]=[];
  let bytes=0;
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BODY){
        await reader.cancel();
        throw new QuestionStoreError('EXAM_JSON_BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const joined=new Uint8Array(bytes);
  let offset=0;
  for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
  let data:unknown;
  try{data=JSON.parse(new TextDecoder().decode(joined));}
  catch{throw new QuestionStoreError('EXAM_JSON_INVALID');}
  if(!data||typeof data!=='object'||Array.isArray(data)){
    throw new QuestionStoreError('EXAM_JSON_INVALID');
  }
  return data as Record<string,unknown>;
}
export function exact(body:Record<string,unknown>,keys:readonly string[]):void{
  if(Object.keys(body).sort().join('|')!==[...keys].sort().join('|')){
    throw new QuestionStoreError('EXAM_JSON_FIELDS_INVALID');
  }
}

/** Never returns SQL, answer keys, payloads or stack traces: only a stable code. */
export function examErrorCode(error:unknown):string|null{
  return error instanceof QuestionStoreError||error instanceof QuestionBankError||
    error instanceof ExamAttemptError?error.code:null;
}
export function examHttpStatus(code:string):404|403|409|422{
  if(code.includes('NOT_FOUND'))return 404;
  if(code.includes('INVALID')||code.includes('STATUTORY'))return 422;
  if(code.includes('RBAC')||code.includes('TENANT')||code.includes('FORBIDDEN')||
      code.includes('NOT_LINKED'))return 403;
  if(code.includes('CONCURRENT')||code.includes('IMMUTABLE')||code.includes('NOT_EDITABLE')||
      code.includes('REQUIRED')||code.includes('CONFLICT')||code.includes('SEALED')||
      code.includes('ALREADY')||code.includes('NOT_BOUND')||code.includes('NOT_COMPLETE')||
      code.includes('NOT_PUBLISHED')||code.includes('NOT_CURRENT')||
      code.includes('EDITION_CHANGED'))return 409;
  return 422;
}
