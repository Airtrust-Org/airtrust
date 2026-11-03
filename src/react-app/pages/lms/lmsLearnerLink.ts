/**
 * Aviso a quem matricula: sem usuário ativo vinculado ao funcionário nesta
 * empresa, o aluno recebe 409 em "meus treinamentos" e não vê o curso.
 * Apenas informa; não vincula contas nem altera o fluxo de matrícula.
 */
export interface LmsLearnerLinkSubject {
  aluno_vinculado?: 0 | 1;
}

export function countWithoutLinkedAccount(rows: readonly LmsLearnerLinkSubject[]): number {
  return rows.filter((row) => row.aluno_vinculado === 0).length;
}

export const LMS_UNLINKED_ACCOUNT_HINT =
  'Sem usuário ativo vinculado a este funcionário nesta empresa: o aluno não verá o curso na própria área até o cadastro ser conferido.';

export function buildUnlinkedAccountToast(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const quem = count === 1 ? '1 funcionário matriculado não tem' : `${count} funcionários matriculados não têm`;
  return `${quem} usuário ativo vinculado: o curso não aparecerá na área do aluno. Confira o cadastro de usuários.`;
}
