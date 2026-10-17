# Schema V2 0557 — Evidências imutáveis por ciclo LMS

## Objetivo e alcance
Adicionar uma trilha de retenção para o snapshot completo SCORM de cada ciclo encerrado por renovação, e atribuir statements xAPI antigos ao ciclo anterior sem excluí-los. A matrícula operacional conserva ID único (empresa, funcionário, curso), mas seu progresso pertence somente ao ciclo ativo.

## Objeto da mudança
A SQL aditiva cria `lms_ciclo_evidencias`, os índices por tenant/matrícula/ciclo e `lms_xapi_statements.archived_cycle_id`. A SQL cria triggers que impedem alteração/exclusão de snapshots de ciclo e de statements xAPI já arquivados, além de validar a correspondência de empresa/matrícula/ciclo ao arquivar. Não inclui backfill, updates em matrículas reais, alteração de certificados ou conteúdo R2. Statements xAPI preexistentes permanecem ativos até que uma transação de renovação atribua seu ciclo histórico. Os snapshots não devem ser usados como prova de conclusão de novo ciclo.

## Ordem segura de publicação
A aplicação da mudança de schema deve preceder a disponibilização do Worker que filtra por `archived_cycle_id` e exige `lms_ciclo_evidencias`. Não publicar Worker dependente antes da confirmação de postconditions. Aplicar somente via workflow Schema V2, com SHA candidato, baseline, hashes, backup/Time Travel, revisão humana, oito gates e autorização de produção especificamente correspondente. Não executar via SQL remoto avulso. Staging segue seu fluxo governado.

## Preflight, pós-condições e recovery
Preflight read-only: baseline atual, existência das tabelas `lms_matriculas`, `lms_matricula_ciclos`, `lms_progresso_scorm`, `lms_xapi_statements`, ausência da coluna `archived_cycle_id` e da tabela `lms_ciclo_evidencias`, ausência do change_id no ledger. Pós-condições read-only: coluna e índices presentes, tabela e UNIQUE (empresa_id,matricula_id,ciclo_id), zero arquivos perdidos, linhas xAPI e matrículas anteriores preservadas. Capture recovery point D1 antes do apply. Reversão não deve apagar evidências novas: operar por compensação governada, não DROP ou reset.

## Segurança, idempotência e testes
Runtime exige `db.batch` atômico com guarda tenant/status/ciclo, snapshot antes de zerar CMI, atualização de `archived_cycle_id` sem DELETE, criação de ciclo único, auditoria e pós-check. Queries de conclusão e listagem operacional xAPI aceitam somente `archived_cycle_id IS NULL`. Registros históricos seguem disponíveis para leitura auditada, nunca contam como evidência para finalizar novo ciclo. Testar corrida, rollback por falha, repetição, zero-histórico, fronteira tenant, conclusão/cancelamento e disponibilidade do schema. Dados sensíveis permanecem no D1 protegido, sem publicação de artefato nominal.

**Autorização:** este plano não autoriza apply em D1 de produção, backfill, seed ou deploy.

## Retenção do diagnóstico e isolamento do novo ciclo

Na renovação terminal, a transação grava o snapshot anterior com CMI, curso, datas, cursor e diagnósticos por tentativa; somente depois limpa a tabela de diagnósticos correntes junto do estado SCORM. Esses dados correntes são incompatíveis com tentativas do novo ciclo e não podem influenciar o novo aluno. O histórico imutável permanece preservado em `lms_ciclo_evidencias`. A falha em qualquer escrita aborta todo o `db.batch` e mantém a linha original de diagnóstico.
