import { parseScormLocationPair } from '../lib/lms/lms-progress-guardrails';
/** Persisted lms_progresso_scorm evidence columns for the current enrollment cycle. */
export type PersistedScormEvidence = Readonly<{
  lesson_status?: string|null; completion_status?: string|null; success_status?: string|null;
  score_raw?: number|null; score_max?: number|null; score_min?: number|null; score_scaled?: number|null;
}>;

export type ScormLaunchStateOptions = Readonly<{
  /** Column evidence; the terminal status and best score are served to the package. */
  persisted?: PersistedScormEvidence|null;
  /** Completed review of a structurally different active edition: never replay old cursor. */
  reviewEditionMismatch?: boolean;
}>;

const STATUS_RANK: Readonly<Record<string,Readonly<Record<string,number>>>> = {
  'cmi.core.lesson_status': {passed:2,completed:1},
  'cmi.completion_status': {completed:1},
  'cmi.success_status': {passed:1},
};
const rank=(key:string,value:unknown)=>
  STATUS_RANK[key]?.[String(value??'').trim().toLowerCase()]??0;
const finite=(value:unknown):number|null=>{
  if(value===null||value===undefined||value==='')return null;
  const n=typeof value==='number'?value:Number(String(value));
  return Number.isFinite(n)?n:null;
};

function isTerminalCmi(cmi:Record<string,unknown>,isScorm2004:boolean):boolean{
  return isScorm2004
    ? rank('cmi.completion_status',cmi['cmi.completion_status'])>0||
      rank('cmi.success_status',cmi['cmi.success_status'])>0
    : rank('cmi.core.lesson_status',cmi['cmi.core.lesson_status'])>0;
}

/**
 * #1311: the package must receive on LMSInitialize the strongest persisted
 * status and best score of this cycle, even when the stored cmi_json is a
 * later regressive snapshot (columns are guarded monotonically server-side).
 */
function overlayPersistedEvidence(
  cmi:Record<string,unknown>,persisted:PersistedScormEvidence|null|undefined,isScorm2004:boolean,
):void{
  if(!persisted)return;
  const statusPairs:Array<[string,unknown]>=isScorm2004
    ? [['cmi.completion_status',persisted.completion_status],['cmi.success_status',persisted.success_status]]
    : [['cmi.core.lesson_status',persisted.lesson_status]];
  for(const [key,value] of statusPairs){
    if(rank(key,value)>rank(key,cmi[key]))cmi[key]=String(value).trim().toLowerCase();
  }
  const prefix=isScorm2004?'cmi.score.':'cmi.core.score.';
  const best=finite(persisted.score_raw);
  if(best!==null){
    const current=finite(cmi[prefix+'raw']);
    if(current===null||current<best){
      cmi[prefix+'raw']=String(best);
      const max=finite(persisted.score_max),min=finite(persisted.score_min);
      if(max!==null)cmi[prefix+'max']=String(max);
      if(min!==null)cmi[prefix+'min']=String(min);
    }
  }
  const scaled=finite(persisted.score_scaled);
  if(isScorm2004&&scaled!==null){
    const current=finite(cmi['cmi.score.scaled']);
    if(current===null||current<scaled)cmi['cmi.score.scaled']=String(scaled);
  }
}

/**
 * F5 packages (suspend_data v4) restore `active = max(a, location - 1)`. When the
 * cursor sits past a screen never completed (`d` has a hole), that screen opens
 * only as a preview and the learner can never finish. The cursor is rewound to
 * the first hole and the bookmark clamped to the cursor; nothing is credited.
 */
function repairStrandedCursor(cmi:Record<string,unknown>):void{
  const raw=cmi['cmi.suspend_data'];
  if(typeof raw!=='string'||!raw.trim())return;
  let state:Record<string,unknown>;
  try{
    const parsed=JSON.parse(raw) as unknown;
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return;
    state=parsed as Record<string,unknown>;
  }catch{return;}
  const cursor=state.a,done=state.d;
  if(state.v!==4||state.c===true||!Number.isInteger(cursor)||!Array.isArray(done))return;
  const locationKeys=['cmi.core.lesson_location','cmi.location'];
  const pairs=locationKeys.map(key=>parseScormLocationPair(String(cmi[key]??'')));
  const declared=Number(cmi['airtrust.total_slides']);
  const total=Number.isSafeInteger(declared)&&declared>0?declared
    :(pairs.find(Boolean)?.total??0);
  if(!Number.isSafeInteger(total)||total<1||total>1000)return;
  const completed=new Set(done.filter(n=>Number.isInteger(n)&&n>=0&&n<total));
  let firstHole=0;
  while(firstHole<total&&completed.has(firstHole))firstHole++;
  const target=Math.min(Number(cursor),firstHole>=total?total-1:firstHole);
  if(target!==cursor){
    state.a=target;
    cmi['cmi.suspend_data']=JSON.stringify(state);
  }
  // Both aliases are clamped: the wrapper prefers whichever stays ahead of the cursor.
  locationKeys.forEach((key,i)=>{
    const pair=pairs[i];
    if(pair&&pair.current>target+1)cmi[key]=`${target+1}/${pair.total}`;
  });
}

/** Build a fresh or resumed virtual CMI snapshot for the Player 2 wrapper. */
export function buildScormLaunchState(
  rawCmiJson:string|null,
  suspendData:string|null,
  isScorm2004:boolean,
  completedReview=false,
  navigationBookmark:{position:number;total:number}|null=null,
  options:ScormLaunchStateOptions={},
):{initialCmiJson:string;hasResumeState:boolean}{
  let cmi:Record<string,unknown>={};
  if(rawCmiJson){
    try{
      const parsed=JSON.parse(rawCmiJson) as Record<string,unknown>;
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))cmi=parsed;
    }catch{cmi={};}
  }
  if(suspendData&&!cmi['cmi.suspend_data'])cmi['cmi.suspend_data']=suspendData;
  // A cursor/suspend_data is only replayable in review when it was written
  // together with the terminal evidence (not a stale regressive checkpoint).
  const snapshotWasTerminal=isTerminalCmi(cmi,isScorm2004);
  overlayPersistedEvidence(cmi,options.persisted,isScorm2004);
  if(!completedReview)repairStrandedCursor(cmi);
  // A verified handoff bookmark is only a UI hint (the player shows it). It is never
  // injected as `lesson_location`: F5 packages treat a location without matching
  // suspend_data as an incompatible edition and lock themselves into preview. Only the
  // synthetic location an earlier launch seeded (exactly the anchor) is dropped; a
  // location the package authored later (any other value) is preserved.
  if(!completedReview&&navigationBookmark&&!cmi['cmi.suspend_data']){
    const synthetic=`${navigationBookmark.position}/${navigationBookmark.total}`;
    const locationKey=isScorm2004?'cmi.location':'cmi.core.lesson_location';
    if(String(cmi[locationKey]??'')===synthetic){
      delete cmi[locationKey];
      delete cmi[isScorm2004?'cmi.entry':'cmi.core.entry'];
    }
  }
  if(completedReview){
    // Review resumes the terminal snapshot when it is consistent; otherwise
    // (stale incomplete checkpoint or another edition) it starts at the beginning.
    if(!snapshotWasTerminal||options.reviewEditionMismatch){
      delete cmi['cmi.suspend_data'];
      delete cmi['cmi.location'];
      delete cmi['cmi.core.lesson_location'];
      delete cmi['cmi.entry'];
      delete cmi['cmi.core.entry'];
    }
    delete cmi['cmi.exit'];
    delete cmi['cmi.core.exit'];
    if(isScorm2004){
      cmi['cmi.completion_status']='completed';
      cmi['cmi.success_status']='passed';
    }else if(!isTerminalCmi(cmi,false))cmi['cmi.core.lesson_status']='passed';
  }
  // SCORM RTE: review/no-credit tells the package the attempt is read-only.
  if(isScorm2004){
    cmi['cmi.mode']=completedReview?'review':'normal';
    cmi['cmi.credit']=completedReview?'no-credit':'credit';
  }else{
    cmi['cmi.core.lesson_mode']=completedReview?'review':'normal';
    cmi['cmi.core.credit']=completedReview?'no-credit':'credit';
  }
  const hasResumeState=Boolean(cmi['cmi.suspend_data']||cmi['cmi.location']||cmi['cmi.core.lesson_location']);
  if(hasResumeState){
    if(isScorm2004)cmi['cmi.entry']='resume';
    else cmi['cmi.core.entry']='resume';
  }
  return {initialCmiJson:JSON.stringify(cmi),hasResumeState};
}

/** Only accepts non-completing, non-scoring server plans as navigation anchors. */
export function readScormNavigationBookmark(rawPlan:string):{position:number;total:number}|null{
  try{
    const plan=JSON.parse(rawPlan) as Record<string,unknown>;
    if(!plan||typeof plan!=='object'||Array.isArray(plan)||
      plan.canMarkComplete!==false||plan.canTransferScore!==false||
      !['MATCHED_ANCHOR','SUGGESTED_ANCHOR','START_ACTIVE'].includes(String(plan.status)))return null;
    const position=Number(plan.targetPosition),total=Number(plan.activeTotal);
    if(!Number.isSafeInteger(position)||!Number.isSafeInteger(total)||
      position<1||total<position||total>1000)return null;
    return {position,total};
  }catch{return null;}
}
