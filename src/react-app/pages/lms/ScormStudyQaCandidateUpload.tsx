import {useState} from 'react';
import {fetchWithAuth} from '@/react-app/config/api';

/**
 * Manual staging-only immutable candidate intake. This component deliberately
 * does NOT call conformance, activation, enrollment, or certificate endpoints.
 */
export default function ScormStudyQaCandidateUpload({cursoId}:{cursoId:number}){
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [error,setError]=useState('');
 const valid=Number.isSafeInteger(cursoId)&&cursoId>0;
 async function upload(){
   if(!file||!valid||busy)return;
   setBusy(true);setError('');setStatus('');
   try{
     if(!file.name.toLowerCase().endsWith('.zip')||file.size>32*1024*1024)
       throw Error('Escolha um ZIP SCORM individual de até 32 MiB.');
     const bytes=await file.arrayBuffer();
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
       .map(v=>v.toString(16).padStart(2,'0')).join('');
     const form=new FormData();
     form.append('arquivo',new Blob([bytes],{type:'application/zip'}),file.name);
     const response=await fetchWithAuth(
       '/api/lms/cursos/'+cursoId+'/scorm-study-qa-candidate',{
         method:'POST',body:form,headers:{'x-airtrust-expected-zip-sha256':hash},
       });
     const body=await response.json() as {success?:boolean;code?:string;data?:{
       packageId?:string;packageSha256?:string;status?:string;
       studyOnlyQaCandidate?:boolean;activeCourseUnchanged?:boolean;
     }};
     if(!response.ok||body.success!==true||
       body.data?.packageSha256!==hash||
       body.data?.studyOnlyQaCandidate!==true||
       body.data.activeCourseUnchanged!==true||
       !body.data.packageId){
       throw Error(body.code||'O servidor não confirmou o candidato.');
     }
     setStatus('Candidato QA '+body.data.status+' · SHA '+hash.slice(0,16)+
       '. O pacote ativo foi preservado. Nenhum aluno foi migrado.');
   }catch(e){
     setError(e instanceof Error?e.message:'Upload QA não confirmado.');
   }finally{setBusy(false);}
 }
 return <section aria-label="Upload SCORM apenas para QA" className="space-y-3 rounded-xl border border-amber-300 p-4">
   <h3 className="font-semibold">Enviar SCORM V3 como candidato inativo</h3>
   <p className="text-sm">Somente staging autorizado. Selecione o ZIP individual do curso correspondente; este botão não publica, não substitui o conteúdo ativo e não certifica alunos.</p>
   <input type="file" accept=".zip,application/zip" disabled={busy}
     aria-label="Selecionar ZIP SCORM individual" onChange={e=>setFile(e.target.files?.[0]||null)}/>
   <button type="button" className="rounded border px-4 py-2 disabled:opacity-50"
     disabled={!valid||!file||busy} onClick={()=>void upload()}>
     {busy?'Registrando candidato…':'Enviar candidato para QA, sem ativar'}
   </button>
   {status&&<p role="status" className="text-sm">{status}</p>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
