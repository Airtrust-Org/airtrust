/** Build a fresh or resumed virtual CMI snapshot for the Player 2 wrapper. */
export function buildScormLaunchState(
  rawCmiJson:string|null,
  suspendData:string|null,
  isScorm2004:boolean,
  completedReview=false,
  navigationBookmark:{position:number;total:number}|null=null,
):{initialCmiJson:string;hasResumeState:boolean}{
  let cmi:Record<string,unknown>={};
  if(rawCmiJson){
    try{
      const parsed=JSON.parse(rawCmiJson) as Record<string,unknown>;
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))cmi=parsed;
    }catch{cmi={};}
  }
  if(suspendData&&!cmi['cmi.suspend_data'])cmi['cmi.suspend_data']=suspendData;
  // A verified handoff bookmark changes navigation only; no old learner evidence is restored.
  if(!completedReview&&navigationBookmark&&
    Number.isSafeInteger(navigationBookmark.position)&&
    Number.isSafeInteger(navigationBookmark.total)&&navigationBookmark.position>=1&&
    navigationBookmark.position<=navigationBookmark.total&&
    !cmi['cmi.location']&&!cmi['cmi.core.lesson_location']){
    const location=`${navigationBookmark.position}/${navigationBookmark.total}`;
    if(isScorm2004)cmi['cmi.location']=location;
    else cmi['cmi.core.lesson_location']=location;
  }
  // Completed review is read-only and starts at the beginning.
  if(completedReview){
    delete cmi['cmi.suspend_data'];
    delete cmi['cmi.location'];
    delete cmi['cmi.core.lesson_location'];
    delete cmi['cmi.entry'];
    delete cmi['cmi.core.entry'];
    delete cmi['cmi.exit'];
    delete cmi['cmi.core.exit'];
    if(isScorm2004){
      cmi['cmi.completion_status']='completed';
      cmi['cmi.success_status']='passed';
    }else cmi['cmi.core.lesson_status']='passed';
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
