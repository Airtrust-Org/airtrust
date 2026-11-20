/** CSV import for controlled ADMIN draft creation. No answers are sent outside
 * the existing tenant-scoped Worker question bank write API. */
export type ImportQuestion={
 questionId:string;content:{moduleId:string;topicId:string;sourceUnitId:string;
 sourceSha256:string;difficulty:'BASICA'|'INTERMEDIARIA'|'AVANCADA';
 prompt:string;choices:{id:string;text:string}[];correctChoiceId:string;explanation:string};
};
const HEAD=['id','modulo','assunto','unidade','dificuldade','enunciado','a','b','c','d','correta','explicacao'];
export const examQuestionTemplate=HEAD.join(';')+'\r\n' +
 'q-exemplo-01;M1;Segurança;U1;BASICA;Qual conduta é correta?;Opção A;Opção B;Opção C;Opção D;A;Justifique a resposta.\r\n';
function matrix(src:string):string[][]{
 const lines:string[][]=[];let row:string[]=[],value='',quoted=false;
 const separator=src.slice(0,src.indexOf('\n')<0?src.length:src.indexOf('\n')).includes(';')?';':',';
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(c==='"'){if(quoted&&src[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&c===separator){row.push(value.trim());value='';}
  else if(!quoted&&(c==='\n'||c==='\r')){
   if(c==='\r'&&src[i+1]==='\n')i++;
   row.push(value.trim());value='';
   if(row.some(x=>x.length))lines.push(row);
   row=[];
  }else value+=c;
 }
 if(quoted)throw Error('O arquivo contém aspas não fechadas.');
 row.push(value.trim());if(row.some(x=>x.length))lines.push(row);
 return lines;
}
export function parseQuestionCsv(text:string,sourceSha256:string):ImportQuestion[]{
 if(!/^[a-f0-9]{64}$/.test(sourceSha256))throw Error('Selecione uma edição válida.');
 if(text.length>200000)throw Error('Arquivo acima de 200 KB. Divida em lotes.');
 const rows=matrix(text.replace(/^\uFEFF/,''));
 if(!rows.length||rows[0].map(x=>x.toLowerCase()).join('|')!==HEAD.join('|'))
  throw Error('Cabeçalho inválido. Use o modelo de importação disponibilizado.');
 if(rows.length<2||rows.length>31)throw Error('Cada lote precisa conter entre 1 e 30 questões.');
 const seen=new Set<string>();
 return rows.slice(1).map((row,i)=>{
  const index=i+2;
  if(row.length!==HEAD.length)throw Error('Linha '+index+': quantidade de colunas incorreta.');
  const [questionId,moduleId,topicId,sourceUnitId,difficulty,prompt,a,b,c,d,correct,explanation]=row;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(questionId)||seen.has(questionId))
   throw Error('Linha '+index+': código inválido ou repetido.');
  seen.add(questionId);
  if(!moduleId||!topicId||!sourceUnitId||!prompt||!explanation||![a,b,c,d].every(Boolean))
   throw Error('Linha '+index+': preencha módulo, assunto, unidade, enunciado, alternativas e explicação.');
  if(!['BASICA','INTERMEDIARIA','AVANCADA'].includes(difficulty))
   throw Error('Linha '+index+': dificuldade deve ser BASICA, INTERMEDIARIA ou AVANCADA.');
  if(!['A','B','C','D'].includes(correct.toUpperCase()))
   throw Error('Linha '+index+': escolha A, B, C ou D como gabarito.');
  return {questionId,content:{
   moduleId,topicId,sourceUnitId,sourceSha256,
   difficulty:difficulty as ImportQuestion['content']['difficulty'],
   prompt,choices:[a,b,c,d].map((value,j)=>({id:'o'+(j+1),text:value})),
   correctChoiceId:'o'+(['A','B','C','D'].indexOf(correct.toUpperCase())+1),explanation,
  }};
 });
}
