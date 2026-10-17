/**
 * Read-only, learner-scoped proof of a Player3 certificate after canonical
 * completion. A committed enrollment/qualification does NOT prove a PDF.
 *
 * The document's R2 key never leaves the Worker. We check the canonical D1
 * document link, tenant-scoped object path and stored PDF magic bytes. This
 * verifies the archive HEAD only; the E2E must still GET the authenticated
 * stream and inspect the entire PDF bytes. No repair, generation or writes.
 */
import type {Env} from '../types';

export type Player3CertificateState =
  | 'ENROLLMENT_NOT_COMPLETED'
  | 'NOT_APPLICABLE'
  | 'HISTORY_NOT_LINKED'
  | 'HISTORY_INVALID'
  | 'CERTIFICATE_NOT_ARCHIVED'
  | 'CERTIFICATE_OBJECT_MISSING'
  | 'CERTIFICATE_PDF_INVALID'
  | 'PDF_HEADER_VERIFIED';

export type Player3CertificateSnapshot=Readonly<{
  matricula_id:number;
  ciclo_id:number|null;
  matricula_status:string;
  historico_id:number|null;
  certificate_state:Player3CertificateState;
  documento_id:number|null;
  /** Existing authenticated stream, not an R2 URL. */
  stream_path:string|null;
  /** False until a separate authenticated full-PDF read verifies access. */
  stream_verified:false;
}>;

type Row={
  matricula_status:string;
  ciclo_id:number|null;
  ciclo_status:string|null;
  ciclo_historico_id:number|null;
  curso_gera_qualificacao:number;
  historico_id:number|null;
  historico_validado_id:number|null;
  historico_status:string|null;
  historico_data_conclusao:string|null;
  documento_id:number|null;
  documento_r2_key:string|null;
};
const positive=(n:unknown):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>0;

export class Player3CertificateReadError extends Error{
  constructor(public readonly code:string){
    super(code);this.name='Player3CertificateReadError';
  }
}

export async function readPlayer3CertificateStatus(params:{
  env:Env;empresaId:number;matriculaId:number;funcionarioId:number;
}):Promise<Player3CertificateSnapshot>{
  const {env,empresaId,matriculaId,funcionarioId}=params;
  if(![empresaId,matriculaId,funcionarioId].every(positive)){
    throw new Player3CertificateReadError('PLAYER3_CERTIFICATE_SCOPE_INVALID');
  }
  const row=await env.DB.prepare(`
    SELECT m.status AS matricula_status,
           cy.id AS ciclo_id,cy.status AS ciclo_status,
           cy.qualificacao_historico_id AS ciclo_historico_id,
           c.gerar_qualificacao_ao_concluir AS curso_gera_qualificacao,
           m.qualificacao_historico_id AS historico_id,
           qh.id AS historico_validado_id,
           qh.status AS historico_status,
           qh.data_conclusao AS historico_data_conclusao,
           d.id AS documento_id,d.r2_key AS documento_r2_key
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
      LEFT JOIN lms_matricula_ciclos cy
        ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
       AND cy.curso_id=m.curso_id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
      LEFT JOIN qualificacoes_historico qh
        ON qh.id=m.qualificacao_historico_id
       AND qh.empresa_id=m.empresa_id
       AND qh.funcionario_id=m.funcionario_id
       AND qh.deleted_at IS NULL
      LEFT JOIN documentos d ON d.id=qh.certificado_arquivo_id
       AND d.funcionario_id=m.funcionario_id AND d.deleted_at IS NULL
     WHERE m.id=? AND m.empresa_id=? AND m.funcionario_id=?
       AND m.deleted_at IS NULL AND c.deleted_at IS NULL
     LIMIT 1`
  ).bind(matriculaId,empresaId,funcionarioId).first<Row>();
  if(!row){
    throw new Player3CertificateReadError('PLAYER3_CERTIFICATE_ENROLLMENT_NOT_FOUND');
  }
  const output=(certificate_state:Player3CertificateState,
    docId:number|null=null):Player3CertificateSnapshot=>({
      matricula_id:matriculaId,ciclo_id:row.ciclo_id,
      matricula_status:row.matricula_status,
      historico_id:positive(row.historico_validado_id)
        ?row.historico_validado_id:null,
      certificate_state,documento_id:docId,
      stream_path:docId?`/api/pasta-virtual/stream/${docId}`:null,
      stream_verified:false,
  });
  if(row.matricula_status!=='CONCLUIDO' ||
     !positive(row.ciclo_id) || row.ciclo_status!=='CONCLUIDO'){
    return output('ENROLLMENT_NOT_COMPLETED');
  }
  if(row.curso_gera_qualificacao===0)return output('NOT_APPLICABLE');
  if(row.curso_gera_qualificacao!==1||
     !positive(row.historico_id)||
     row.ciclo_historico_id!==row.historico_id){
    return output('HISTORY_NOT_LINKED');
  }
  if(row.historico_validado_id!==row.historico_id||
     row.historico_status!=='CONCLUIDA'||
     !row.historico_data_conclusao){
    return output('HISTORY_INVALID');
  }
  if(!positive(row.documento_id)||!row.documento_r2_key){
    return output('CERTIFICATE_NOT_ARCHIVED');
  }
  // Never allow a generic or another-tenant key to be used in the check.
  const prefix=`certificados/empresa-${empresaId}/funcionario-${funcionarioId}/historico-${row.historico_id}/`;
  const key=row.documento_r2_key;
  const filename=key.slice(prefix.length);
  if(!key.startsWith(prefix)||!filename.endsWith('.pdf')||
     !/^[a-zA-Z0-9_.-]+$/.test(filename)){
    return output('CERTIFICATE_PDF_INVALID');
  }
  let object:R2ObjectBody|null;
  try{
    object=await env.BUCKET.get(key,{range:{offset:0,length:5}});
  }catch{
    throw new Player3CertificateReadError('PLAYER3_CERTIFICATE_STORAGE_UNAVAILABLE');
  }
  if(!object)return output('CERTIFICATE_OBJECT_MISSING');
  if(object.size<32)return output('CERTIFICATE_PDF_INVALID');
  let header:ArrayBuffer;
  try{header=await object.arrayBuffer();}catch{
    throw new Player3CertificateReadError('PLAYER3_CERTIFICATE_STORAGE_UNAVAILABLE');
  }
  if(header.byteLength!==5 ||
    new TextDecoder().decode(header)!=='%PDF-')return output('CERTIFICATE_PDF_INVALID');
  return output('PDF_HEADER_VERIFIED',row.documento_id);
}
