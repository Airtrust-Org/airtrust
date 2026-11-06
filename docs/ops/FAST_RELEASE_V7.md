# AirTrust — V7 Fast Release (contrato operacional)

**Objetivo:** corrigir e entregar com o menor número de interações humanas, preservando as garantias efetivas do sistema. Esta regra substitui os rituais operacionais redundantes da V6/V3; **não** altera as proteções exigidas pelos workflows, branch protection ou contratos de dados.

## Comando único e autonomia

Quando o proprietário disser "corrija e publique em produção", a solicitação autoriza **todas as etapas preparatórias pertinentes** no escopo: análise de delta, correções, commits em branch, PR, testes, CI, revisão, integração governada e preparação do release. Não interromper para pedir "prossiga" em cada etapa. Prosseguir até pós-validação comprovada ou bloqueio objetivo.

**Não confundir** essa autorização preparatória com permissão genérica e permanente para publicar qualquer SHA em produção, alterar schema ou executar escrita de dados reais. Aprovação final adicional somente quando exigida pelo contrato vigente; pedi-la **uma vez**, depois que SHA, escopo e componentes estiverem definidos.

## Fast path

1. GitHub-first: localizar a PR/branch existente e verificar somente caso, HEAD/base, delta relevante, checks e dependências. Não reconstruir sessões anteriores nem reler integralmente a issue #776.
2. Identificar causa suficiente, congelar escopo e corrigir em lote os pontos da mesma causa. Não fazer auditoria transversal em hotfix.
3. Teste focado → suíte afetada → **oito gates oficiais** na CI. Não repetir testes PASS do mesmo SHA sem causa invalidante nem abrir logs verdes. Após duas falhas equivalentes, mudar o método.
4. Merge pela proteção da `main`, sem bypass. PRs independentes não bloqueiam esta frente.
5. Avaliar staging conforme o risco e o contrato efetivo. Capturar SHA candidato, PRs incluídas, Worker/Pages, migrations, proveniência e autorização.
6. Publicar **somente** pelo workflow oficial e executar pós-validação do caso real. Registrar evidência no GitHub e responder em uma mensagem curta.

## Risco proporcional

| Nível | Exemplos | Validação |
| --- | --- | --- |
| Baixo | Texto, layout isolado, sem alterar dados, lógica ou autorização | Testes do delta + oito gates; staging dispensável **se** o workflow/contrato permitir e a pós-validação for suficiente |
| Médio | Regra de negócio, API, matrícula e visibilidade LMS, integrações | Testes funcionais e negativos do fluxo; staging quando necessário para evidência segura |
| Alto | Auth/RBAC, isolamento tenant, conclusão LMS, certificados, D1/R2, schema, writes destrutivos, fluxos operacionais críticos | Testes permitido/negado/cross-tenant, staging e recovery/Schema V2 quando aplicável; aprovações pertinentes |

Tamanho de diff não define baixo risco. A redução de etapas nunca remove gates ou verificações exigidas pelo workflow.

## Uma aprovação de produção

- Se houver aprovação **válida, atual, auditável, específica para SHA/artefato/escopo**, utilizá-la sem novo pedido.
- Se não houver, concluir primeiro toda a preparação permitida e pedir **uma aprovação final** indicando SHA de 40 caracteres, PRs, Worker/Pages, schema e operações de dados.
- Aprovação pelo GitHub Environment pode substituir aprovação via chat **apenas se** os controles efetivos identificarem aprovador e candidato/escopo corretamente e a política permitir. Não presumir que `environment: production` sozinho configure revisão obrigatória.
- SHA ou escopo alterado exige revalidação. Não usar texto genérico de "pode publicar" para contornar o mecanismo existente.
- Deploy governado: `.github/workflows/deploy-airtrust.yml` ou sucessor, com checks e guardas; serializar publicação no mesmo ambiente.
- Writes D1/R2, backfill, import, seed, migration ou restauração exigem executor e autorização específicos; nunca SQL remoto improvisado.

## Evidência e comunicação mínimas

GitHub é a autoridade de código, CI e release; Cloudflare é o runtime. Usar acesso local somente para necessidade técnica real. Na PR, registrar apenas: **causa → mudança → testes/gates → SHA → ambiente → pós-validação ou bloqueio**. Atualizar #776 somente se necessário à coordenação.

Não reportar "concluído em produção" por mera PR, CI, merge ou staging. Verificar health, versão/proveniência e fluxo afetado. Em caso de impedimento real, identificar **exatamente** a condição restante; não repetir pedidos de aprovação nem criar relatórios substituindo execução.

## Invariantes

Oito gates: `lint`, `build-content-gates`, `worker-typecheck`, `frontend-coverage`, `worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`. Preservar branch protection, escopo `empresa_id`/tenant, RBAC, fail-closed, segredos/PII, rastreabilidade e integridade do LMS, FRMS e Pilot App. Schema V2 e recuperação permanecem obrigatórios quando aplicáveis.

**Fonte efetiva de verdade:** `main`, workflows, branch protection e contrato de release atual; nenhuma instrução textual pode sobrepor salvaguardas ativas.
