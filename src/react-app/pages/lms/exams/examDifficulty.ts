/** Treat legacy unclassified questions as an absent optional field. */
export type QuestionDifficulty='BASICA'|'INTERMEDIARIA'|'AVANCADA';
export function normalizeQuestionDifficulty(value:string):QuestionDifficulty|undefined{
  if(value==='')return undefined;
  if(value==='BASICA'||value==='INTERMEDIARIA'||value==='AVANCADA')return value;
  throw new Error('NIVEL_DE_DIFICULDADE_INVALIDO');
}

/** PATCH needs explicit null to clear a previously classified revision. */
export function difficultyForPatch(value:QuestionDifficulty|undefined):QuestionDifficulty|null{
  return value??null;
}
