import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,AlertCircle,CheckCircle2} from 'lucide-react';
/** AppLayout owns the only main landmark and viewport gutters. */
export const examPage='mx-auto w-full max-w-7xl space-y-6 pb-12';
export const examCard='rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6';
export const examInput='min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
export const examPrimary='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';
export const examSecondary='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
export const examMuted='text-sm text-slate-600 dark:text-slate-300';
export const examSmall='text-xs text-slate-600 dark:text-slate-400';
export const examDanger='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200';
export const examSuccess='rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
export const examWarning='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
export const statusLabel:Record<string,string>={DRAFT:'Rascunho',REVIEWED:'Em revisão',PUBLISHED:'Publicada',ACTIVE:'Ativa',VALIDATED:'Validada',SUPERSEDED:'Substituída',IN_PROGRESS:'Em andamento',SUBMITTED:'Enviada'};
export function ExamPageHeader({title,description,back,actions}:{title:string;description?:string;back?:string;actions?:ReactNode}){
 return <header className="flex flex-wrap items-start justify-between gap-3">
  <div className="min-w-0 flex-1 space-y-2">
   {back?<Link className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-primary-800 hover:underline dark:text-primary-100" to={back}><ArrowLeft size={16}/> Gestão de Avaliações</Link>:
    <p className="text-xs font-semibold uppercase tracking-wider text-primary-800 dark:text-primary-100">Treinamentos / Gestão</p>}
   <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{title}</h1>
   {description?<p className={examMuted}>{description}</p>:null}
  </div>
  {actions?<div className="flex flex-wrap items-center gap-2">{actions}</div>:null}
 </header>;
}
export function ExamStateMessage({type='info',children}:{type?:'info'|'error'|'success'|'warning';children:ReactNode}){
 const style=type==='error'?examDanger:type==='success'?examSuccess:type==='warning'?examWarning:examCard;
 const Icon=type==='success'?CheckCircle2:AlertCircle;
 return <div role={type==='error'?'alert':'status'} className={style+' flex items-start gap-2'}><Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0"/><div>{children}</div></div>;
}
export function ExamEmpty({title,details}:{title:string;details?:string}){
 return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-600">
  <p className="font-semibold">{title}</p>{details?<p className={examMuted+' mt-1'}>{details}</p>:null}
 </div>;
}
