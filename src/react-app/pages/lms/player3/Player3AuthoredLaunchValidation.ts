import type {P3LearnerQuestion} from './Player3AssessmentModal';

export type Launch=Readonly<{
  empresa_id:number;matricula_id:number;curso_id:number;ciclo_id:number;
  edition_sha256:string;content_url:string;content_origin:string;
  assessment_presentation:'authored-html5';
  resume_next_unit_id:string;checkpoint_unit_ids:string[];
  last_visited_unit_id:string|null;
  official_stages_passed:boolean;completion_supported:false;
  pending_assessment:null|Readonly<{
    stage_id:string;title:string;questions:readonly P3LearnerQuestion[];
  }>;
}>;
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;

export function validatePlayer3Launch(
  data:Launch|undefined,scope:{matriculaId:number;empresaId:number;cursoId:number},
):data is Launch{
  if(!data||data.matricula_id!==scope.matriculaId||
     data.empresa_id!==scope.empresaId||data.curso_id!==scope.cursoId||
     !positive(data.ciclo_id)||!SHA.test(data.edition_sha256)||
     data.assessment_presentation!=='authored-html5'||
     !ID.test(data.resume_next_unit_id)||
     !Array.isArray(data.checkpoint_unit_ids)||
     data.checkpoint_unit_ids.length<1||data.checkpoint_unit_ids.length>500||
     data.checkpoint_unit_ids.some(id=>!ID.test(id))||
     new Set(data.checkpoint_unit_ids).size!==data.checkpoint_unit_ids.length||
     (data.last_visited_unit_id!==null&&
       !data.checkpoint_unit_ids.includes(data.last_visited_unit_id))||
     data.completion_supported!==false||
     typeof data.official_stages_passed!=='boolean'||
     (data.official_stages_passed&&data.pending_assessment!==null))return false;
  try{
    const origin=new URL(data.content_origin);
    const url=new URL(data.content_url);
    if(origin.protocol!=='https:'||origin.href!==origin.origin+'/'||
       url.origin!==origin.origin||url.search||url.hash||
       url.username||url.password||
       !/^\/player3\/[1-9][0-9]*\/[1-9][0-9]*\/[a-f0-9]{64}\/[a-f0-9]{64}\/index\.html$/.test(url.pathname)||
       !url.pathname.startsWith('/player3/'+scope.empresaId+'/'+scope.cursoId+'/'+data.edition_sha256+'/')){
      return false;
    }
  }catch{return false;}
  const assessment=data.pending_assessment;
  // An unfinished course may be between lessons, with no stage available
  // yet. This is not a completion claim or a missing-official-stage bypass.
  if(!assessment)return true;
  if(!ID.test(assessment.stage_id)||!assessment.title?.trim()||
     !Array.isArray(assessment.questions)||assessment.questions.length<1||
     assessment.questions.length>100)return false;
  const questions=new Set<string>();
  return assessment.questions.every(q=>{
    if(!q||!ID.test(q.id)||questions.has(q.id)||!q.prompt?.trim()||
       Object.keys(q).sort().join(',')!=='id,options,prompt'||
       !Array.isArray(q.options)||q.options.length<2||q.options.length>12)return false;
    questions.add(q.id);
    const ids=new Set<string>();
    return q.options.every((o:P3LearnerQuestion['options'][number])=>{
      if(!o||!ID.test(o.id)||ids.has(o.id)||!o.text?.trim()||
         Object.keys(o).sort().join(',')!=='id,text'||
         'correctOptionId' in o||'feedbackCorrect' in o||'feedbackIncorrect' in o){
        return false;
      }
      ids.add(o.id);return true;
    });
  });
}

