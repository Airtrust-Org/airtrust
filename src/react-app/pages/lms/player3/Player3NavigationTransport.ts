/**
 * Authenticated Player3 authored navigation evidence, not certification.
 * The iframe supplies only a unit hint. All scope, order and sequence come
 * from the Worker ledger and a previously approved immutable edition.
 * Any ambiguous POST locks this instance; no automatic replays.
 */
import {API_BASE_URL,fetchWithAuth} from '@/react-app/config/api';

export type Player3NavigationScope=Readonly<{
  matriculaId:number;empresaId:number;cicloId:number;editionSha256:string;
  nextUnitId:string;checkpointUnitIds:readonly string[];
  lastVisitedUnitId:string|null;
}>;
type Authorized=(url:string,init:RequestInit)=>Promise<Response>;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA=/^[a-f0-9]{64}$/;
const pos=(x:number)=>Number.isSafeInteger(x)&&x>0;
export function validNavigationScope(s:Player3NavigationScope):boolean{
  return !!s&&[s.matriculaId,s.empresaId,s.cicloId].every(pos)&&
    SHA.test(s.editionSha256)&&ID.test(s.nextUnitId)&&
    Array.isArray(s.checkpointUnitIds)&&s.checkpointUnitIds.length>=1&&
    s.checkpointUnitIds.length<=500&&
    s.checkpointUnitIds.every(id=>ID.test(id))&&
    new Set(s.checkpointUnitIds).size===s.checkpointUnitIds.length&&
    s.checkpointUnitIds.includes(s.nextUnitId)&&
    (s.lastVisitedUnitId===null||
      s.checkpointUnitIds.includes(s.lastVisitedUnitId));
}
export function makePlayer3NavigationRecorder(
  s:Player3NavigationScope,
  request:Authorized=fetchWithAuth,
  apiBase=API_BASE_URL,
):(unitId:string)=>Promise<boolean>{
  if(!validNavigationScope(s)||!request||
     (apiBase!==API_BASE_URL&&!(import.meta.env.MODE==='test'&&apiBase==='/api'))){
    throw Error('PLAYER3_NAV_SCOPE_NOT_AUTHORIZED');
  }
  const base=apiBase.replace(/\/$/,'')+'/lms/native/matriculas/'+s.matriculaId;
  let locked=false;
  async function session(){
    const response=await request(base+'/sessao',{method:'GET',cache:'no-store'});
    if(!response.ok)throw Error('PLAYER3_NAV_SESSION_UNAVAILABLE');
    const body=await response.json() as {success?:boolean;data?:{
      matricula_id:number;ciclo_id:number;edition_sha256:string;
      mode:string;next_sequence:number;seen_lesson_ids:string[];
      last_visited_unit_id:string|null;
    }};
    const row=body?.data;
    if(body.success!==true||!row||
       row.matricula_id!==s.matriculaId||row.ciclo_id!==s.cicloId||
       row.edition_sha256!==s.editionSha256||row.mode!=='LEARN'||
       !Number.isSafeInteger(row.next_sequence)||row.next_sequence<1||
       row.next_sequence>10001||!Array.isArray(row.seen_lesson_ids)||
       row.seen_lesson_ids.length>s.checkpointUnitIds.length||
       row.seen_lesson_ids.some(id=>!s.checkpointUnitIds.includes(id))||
       new Set(row.seen_lesson_ids).size!==row.seen_lesson_ids.length||
       (row.last_visited_unit_id!==null&&
         (!s.checkpointUnitIds.includes(row.last_visited_unit_id)||
          !row.seen_lesson_ids.includes(row.last_visited_unit_id)))){
      throw Error('PLAYER3_NAV_LEDGER_SCOPE_CONFLICT');
    }
    return row;
  }
  return async unitId=>{
    if(locked)throw Error('PLAYER3_NAV_REOPEN_TO_RECONCILE');
    if(!s.checkpointUnitIds.includes(unitId))return false;
    locked=true;
    const before=await session();
    // A revisited lesson is not a new unit-completion checkpoint. Ledger
    // entries remain unique by lesson even after back/forward navigation.
    if(before.seen_lesson_ids.includes(unitId)){
      locked=false;return true;
    }
    // Only the edition-pinned next unit may create fresh navigation evidence.
    // Revisits above are read-only; a later allowlisted unit cannot skip ahead.
    if(unitId!==s.nextUnitId)throw Error('PLAYER3_NAV_OUT_OF_ORDER');
    if(before.next_sequence>10000)throw Error('PLAYER3_NAV_LEDGER_FULL');
    const random=crypto.getRandomValues(new Uint8Array(16));
    const eventId='p3v-'+[...random].map(v=>v.toString(16).padStart(2,'0')).join('');
    const result=await request(base+'/checkpoints',{
      method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({eventId,sequence:before.next_sequence,unitId}),
    });
    if(!result.ok)throw Error('PLAYER3_NAV_COMMIT_UNCERTAIN');
    const receipt=await result.json() as {success?:boolean;data?:{
      committed_sequence:number;edition_sha256:string;
      state:string;completion_supported:false;
    }};
    if(receipt.success!==true||!receipt.data||
       receipt.data.committed_sequence!==before.next_sequence||
       receipt.data.edition_sha256!==s.editionSha256||
       !['APPLIED','IDEMPOTENT_REPLAY'].includes(receipt.data.state)||
       receipt.data.completion_supported!==false){
      throw Error('PLAYER3_NAV_COMMIT_UNVERIFIED');
    }
    const after=await session();
    if(after.next_sequence!==before.next_sequence+1||
       after.last_visited_unit_id!==unitId||
       !after.seen_lesson_ids.includes(unitId)){
      throw Error('PLAYER3_NAV_RECHECK_FAILED');
    }
    locked=false;return true;
  };
}
