# LMS/SCORM — procedimento canônico de conclusão e recuperação (2026-10-08)

## Incidente rastreado

Curso **CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)**, matrícula **863**: o pacote indicava 45/45 telas visitadas e mensagem “Treinamento concluído”, mas o LMS manteve 99% com `SCORE_MISSING`. O encerramento funcional da matrícula **ainda exige pós-teste autenticado em produção**; não inferir resolução por CI, commit ou deploy.

## Contrato do produto

1. **Ação explícita:** `Concluir curso` do AirTrust é a evidência de solicitação de conclusão pelo aluno. Se o pacote não trouxer comando próprio, o player exibe botão e janela de confirmação.
2. **Elegibilidade:** o botão permanece bloqueado enquanto faltarem slides obrigatórios efetivamente vistos. Não presumir cobertura completa de um marcador máximo `45/45`: validar índices visitados. Para avaliações, verificar todos os questionários/interações requeridos e, em curso `SCORED`, pontuação mínima.
3. **Persistência e autoridade:** concluir somente após `SCORM_USER_FINALIZE` de sessão legítima, verificações backend de tenant/RBAC, integridade SCORM e persistência; sem emitir qualificação por progresso, `LMSFinish`, eventos xAPI intermediários ou erro de rede.
4. **Curso formativo:** `FORMATIVE` não exige nota, mas exige conclusão explícita e evidências. O padrão da coluna `scorm_assessment_policy` é `SCORED`; não alterar outros cursos/tenants para escapar de `SCORE_MISSING`.
5. **Falha de emissão:** manter 99%/pendente até servidor confirmar `CONCLUIDO` e qualificação. Expor motivo acionável, permitir nova confirmação sem duplicar qualificações.

## Fluxo de correção e verificação

- Verificar `main`, PR equivalentes, HEAD, oito checks e delta real. Consertar a menor causa suficiente, executar testes focados e suíte afetada; nunca adulterar baseline/ratchet.
- Migrar por **Schema V2** com manifest, hashes, baseline, preflight, recovery point, postconditions, tenant 6; arquivo versionado não prova coluna aplicada. Migration 0542 altera apenas política autorizada.
- Publicar staging pelo workflow oficial, com **Worker e Pages no mesmo SHA**, schema atualizado e smoke autenticado. O SHA fica fixado no início do QA.
- Workflow **Staging LMS SCORM QA** verifica SHA real de Worker e Pages, publica cursos sintéticos temporários, avalia upload/quality gate/timeout e remove todos os fixtures. Não interpretar sucesso de upload como sucesso de conclusão do aluno.
- Fluxos de **deploy de staging**, **Schema D1 staging** e **SCORM QA staging** compartilham o grupo de concorrência `airtrust-staging-mutations-and-scorm-qa`, `cancel-in-progress: false`, para impedir modificações concorrentes. Atenção: GitHub Actions pode substituir um run *pendente* por outro do mesmo grupo; conferir conclusões e reabrir o run cancelado quando aplicável, sem sobrepor o ambiente.
- Completar **QA funcional de conclusão** com matrícula de teste: slides incompletos → botão bloqueado; questionário pendente/nota insuficiente → bloqueado; slides e interações completos + confirmação → request final, `CONCLUIDO` canônico, qualificação única e reabertura idempotente.
- Produção: autorização explícita **para SHA/artefatos/escopo exatos**, gates válidos e Schema V2 aplicado conforme fluxo oficial. Deploy Worker/Pages somente pelo workflow `deploy-airtrust.yml`.
- Pós-produção: confirmar health/version/provenance, comportamento de curso formativo e avaliado, tela de matrículas, qualificações, logs de erro, e **matrícula 863** sem manipular conclusão sem evidência ou assumir que visualização 45/45 substitui clique. Se bloqueada por dados históricos, diagnosticar evidência e oferecer retomada/revisão em vez de backfill indevido.

## Evidência até esta revisão

- PR #1278 integrada em `466eaf2710f25da32f7d35d2e602e48dcd688e4b`, oito gates verdes; Schema 0542, Worker e Pages publicados em staging (execuções oficiais #37815623115 e #37824117852).
- QA #37825149593 encontrou primeiro um problema transitório no login e depois seletor obsoleto; corrigido pela PR #1283, integrada em `cf83204f374705484cd44614155c8eec234ca7b3`.
- QA #37832990769 interrompido com proteção de provenance após deploy concorrente Worker SHA `1c370428...` com Pages ainda `466eaf27...`. Não comprova falha nem sucesso do botão de conclusão. Próxima ação: publicar/validar snapshot único antes de repetir QA.
- **Não está autorizado afirmar “resolvido em produção” nem “matrícula 863 concluída” antes do pós-teste real.**
