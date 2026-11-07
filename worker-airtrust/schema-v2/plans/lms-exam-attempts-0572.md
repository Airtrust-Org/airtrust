# Schema V2 0572 — planos de prova publicados, vínculo com a edição e tentativas

## Objetivo
Guardar, por tenant e curso, (1) a prova publicada e imutável, (2) o vínculo append-only
entre uma edição de ZIP e uma versão de prova, (3) as tentativas do aluno por ciclo e
(4) as respostas enquanto a tentativa está aberta. A mudança é só armazenamento: nenhuma
matrícula, ciclo, nota SCORM, qualificação ou certificado é criado ou alterado. Uma tentativa
aprovada é evidência para o writer canônico (`completeLmsMatricula`), nunca conclusão.

## Mudança (somente DDL, zero backfill)
- `lms_exam_plans`: PK `(empresa_id,curso_id,exam_id,version)`; guarda as referências das
  questões (id, revisão, SHA) e os limites, sem gabarito. UPDATE e DELETE proibidos; o curso
  precisa pertencer ao tenant.
- `lms_exam_edition_bindings`: UNIQUE `(empresa_id,curso_id,package_sha256)`;
  `statutory_assessment_required` é `0|1` obrigatório (nunca NULL: a exigência regulatória
  precisa ser classificada). O pacote precisa existir no mesmo tenant/curso e não estar
  `REJECTED`. Append-only.
- `lms_exam_attempts`: uma tentativa aberta por ciclo e no máximo uma aprovada por ciclo
  (índices únicos parciais); numeração sequencial por gatilho; só `IN_PROGRESS → SUBMITTED`;
  depois de enviada fica selada; não é possível iniciar nova tentativa após aprovação; ciclo,
  matrícula e vínculo da edição são conferidos no INSERT.
- `lms_exam_attempt_responses`: grava/atualiza apenas com a tentativa aberta; sem DELETE.

## Pré-condições, ordem e postchecks
**Ordem: 0569 e 0571 aplicadas, depois esta, depois o Worker que lê as tabelas.**
Preflight somente leitura: baseline Schema V2; ledger com 0569 e 0571; `lms_cursos`,
`lms_matricula_ciclos` e `lms_scorm_package_versions` com as colunas usadas pelos gatilhos;
tabelas, índices e gatilhos desta mudança **ausentes**; change_id ausente do ledger;
SHA exato revisado; ponto de recuperação D1/Time Travel capturado.
Postcheck: 4 tabelas, 3 índices e 12 gatilhos presentes; `COUNT(*)` das quatro tabelas = 0;
contagens de cursos, matrículas, ciclos, progresso SCORM e histórico de qualificações
inalteradas.

## Recuperação
Reverter o código do Worker (tabelas vazias são inertes). **Nunca** `DROP` depois que
existirem planos, vínculos ou tentativas. Antes de qualquer uso, restaurar o ponto de
recuperação capturado no preflight pelo workflow governado. Nenhum SQL remoto improvisado.

## Fora do escopo
Não aplica nada por si só. A aplicação em staging é feita pelo workflow governado
`staging-apply-schema-v2.yml`, que fixa estes hashes e exige a 0569 e a 0571 no ledger, os oito
gates do SHA exato e ator autorizado; produção exige autorização separada. Rotas do aluno e
telas ficam atrás de flags de staging e não alteram o writer de conclusão.
Teste offline: `python3 scripts/__tests__/test_lms_exam_attempts_schema_0572.py`.
