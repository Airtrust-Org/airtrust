/** CSV export only of currently authorized/loaded report rows. */
export type CsvAssessmentRow = {
  alunoNome:string|null;matriculaId:number;cursoTitulo:string|null;cursoId:number;
  examId:string;version:number;attemptNo:number;scorePct:number|null;
  state:string;passed:boolean|null;submittedAt:string|null;
};
function cell(value:string|number|null):string{
  const plain=String(value??'').replace(/[\r\n\t]/g,' ');
  const neutral=/^[\s]*[=+@-]/.test(plain)?"'"+plain:plain;
  return '"'+neutral.replace(/"/g,'""')+'"';
}
export function buildExamResultsCsv(rows:readonly CsvAssessmentRow[]):string{
  const columns=['Aluno','Matrícula','Curso','Curso ID','Prova','Versão','Tentativa',
    'Nota (%)','Resultado','Enviada em'];
  const data=rows.map(r=>[
    r.alunoNome,r.matriculaId,r.cursoTitulo,r.cursoId,
    r.examId,r.version,r.attemptNo,r.scorePct,
    r.state==='IN_PROGRESS'?'Em andamento':r.passed===true?'Aprovado':r.passed===false?'Reprovado':'Indisponível',
    r.submittedAt,
  ]);
  return '\ufeff'+[columns,...data].map(row=>row.map(v=>cell(v)).join(';')).join('\r\n')+'\r\n';
}
