# Schema V2 0571 — banco de questões independente (autoria, revisão, publicação)

## Objetivo
Criar o armazenamento de revisões de questões de prova (`lms_exam_question_revisions`) e
sua trilha de auditoria append-only (`lms_exam_question_audit`), escopadas por
`empresa_id` + `curso_id`. Nenhuma prova, tentativa, nota, conclusão, qualificação ou
certificado é criada ou alterada por esta mudança (issue #1661, PR #1662).

## Mudança (somente DDL, zero backfill)
- `lms_exam_question_revisions`: PK `(empresa_id,curso_id,question_key,revision)`;
  `DRAFT` editável com `edit_version` otimista; `REVIEWED` por pessoa diferente do último
  editor; `PUBLISHED` imutável com `content_sha256`. Gatilhos validam que o curso pertence
  ao tenant, bloqueiam UPDATE de publicadas, DELETE e transições ilegais, e exigem que uma
  nova revisão tenha a anterior publicada.
- `lms_exam_question_audit`: UPDATE e DELETE proibidos; não guarda enunciado, alternativas
  nem gabarito.
- O gabarito fica em `content_json` e nunca é exposto por esta mudança (sem rota de aluno).

## Pré-condições, ordem e postchecks
**Ordem: schema ANTES do Worker que lê as tabelas** (a rota está montada, mas responde 503
fora de staging com a flag `LMS_EXAM_QUESTION_ADMIN_STAGING=REVIEWED_SCHEMA_ONLY`).
Preflight somente leitura: baseline Schema V2; `lms_cursos` com `id`, `empresa_id`,
`deleted_at`; tabelas, índice e gatilhos desta mudança **ausentes**; change_id ausente do
ledger; SHA exato revisado; ponto de recuperação D1/Time Travel capturado.
Postcheck: 2 tabelas, 1 índice de revisões, 1 índice de auditoria e 7 gatilhos presentes;
`COUNT(*)` das duas tabelas = 0; contagens de cursos, matrículas, ciclos, progresso SCORM e
histórico de qualificações inalteradas.

## Recuperação
Reverter o código do Worker (tabelas vazias são inertes). **Nunca** `DROP` depois que
existirem questões publicadas. Antes de qualquer uso, restaurar o ponto de recuperação D1
capturado no preflight pelo workflow governado. Nenhum SQL remoto improvisado.

## Fora do escopo
Não aplica nada por si só. A aplicação em staging é feita pelo workflow governado
`staging-apply-schema-v2.yml`, que fixa estes hashes e exige confirmação, os oito gates do
SHA exato e ator autorizado; produção exige autorização separada. Provas, tentativas, correção,
vínculo curso/edição e ligação ao writer `completeLmsMatricula` são a mudança 0572 e lotes
seguintes.
Teste offline: `python3 scripts/__tests__/test_lms_exam_question_schema_0571.py`.
