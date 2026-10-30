# Schema V2 0569 — política avaliativa por edição SCORM e aprovações de pacote

## Objetivo
`lms_cursos.scorm_assessment_policy` é global ao curso: trocá-la reclassificaria
matrículas e conclusões históricas. Esta mudança prende a política à **edição**
(`lms_scorm_package_versions`) e ao **ciclo** (`lms_matricula_ciclos`) e cria o
registro append-only da aprovação administrativa de um ZIP imutável
(`lms_scorm_package_approvals`). Nenhuma conclusão, nota, qualificação,
certificado ou matrícula é criada, alterada ou reclassificada por esta mudança.

## Mudança (somente DDL, zero backfill)
- `lms_scorm_package_versions.assessment_policy` (`SCORED|FORMATIVE`, NULL permitido) e
  `certification_profile` (`FORMATIVE_NO_EXAM_V1`, NULL permitido). Ambos são
  derivados pelo Worker a partir do manifesto validado, nunca do cliente; um perfil
  exige política `FORMATIVE`; uma vez gravados são imutáveis (trigger).
- `lms_matricula_ciclos.assessment_policy` (NULL = acompanha a edição ativa).
  Imutável após gravado. O Worker congela ciclos já iniciados **na mesma
  transação D1** que troca a edição; nenhum UPDATE em massa ocorre na migração.
- `lms_scorm_package_approvals`: UNIQUE por tenant/curso/pacote; o INSERT só é
  aceito se o pacote é `VALIDATED`, do mesmo tenant/curso/SHA, com o mesmo perfil e
  o curso é SCORM não excluído; UPDATE e DELETE são proibidos.

## Pré-condições, ordem e postchecks
**Ordem obrigatória: schema ANTES do Worker.** O Worker desta mudança consulta as
novas colunas; aplicá-lo antes do schema quebra upload e leitura de conclusão.
Preflight somente leitura: baseline Schema V2, tabelas `lms_cursos`,
`lms_scorm_package_versions`, `lms_matricula_ciclos`, `lms_scorm_package_audit_log`
presentes; colunas novas, tabela, índice e triggers **ausentes**; ledger limpo; SHA
exato revisado; ponto de recuperação D1/Time Travel capturado.
Postcheck: 3 colunas, 1 tabela, 1 índice e 6 triggers presentes; `COUNT(*)` de
`lms_scorm_package_approvals` = 0; contagens de cursos, edições, matrículas, ciclos,
progresso SCORM e histórico de qualificações inalteradas; nenhuma linha com
`assessment_policy` preenchida.

## Recuperação
Reverter o código do Worker (colunas extras NULL são inertes). **Nunca** `DROP`
de prova imutável nem UPDATE das colunas congeladas. Se a mudança precisar ser
desfeita antes de qualquer uso, restaurar o ponto de recuperação D1 capturado no
preflight pelo workflow governado. Nenhum SQL remoto improvisado.

## Fora do escopo
Não aplica em produção, não ativa edição, não define política de curso algum e não
substitui a autorização específica de SHA/pacote/curso exigida pelos guards.
Teste offline: `python3 scripts/__tests__/test_scorm_edition_policy_schema_0569.py`.
