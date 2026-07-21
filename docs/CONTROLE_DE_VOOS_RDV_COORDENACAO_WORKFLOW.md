# Controle de Voos — Fluxo Piloto → Coordenação do RDV (Relatório de Voo)

**Data:** 2026-07-20
**Branch:** `feat/controle-voos-rdv-sigvoos-reinicio`
**SHA-base:** `e37caed2ea250eff8c1bccec7c87e4ab93c4211b` (origin/main)
**Classificação:** Interno — NÃO submeter à ANAC. Módulo não regulado, não substitui SIGVOOS/eDB/SDRMe.

Este documento descreve **apenas a entrega desta branch**: o fluxo de revisão/aprovação
Piloto → Coordenação do RDV. Para o panorama estratégico mais amplo (SIGVOOS, FRMS, ANAC),
ver `AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md` — **partes dele estão desatualizadas**
(ex.: "atribuição de tripulantes ausente" e "Lista de RDV lista voos, não RDVs" já foram
resolvidas antes desta entrega; ver auditoria na seção 1).

---

## 1. O que já existia antes desta entrega (auditoria)

Auditoria de `origin/main` encontrou uma base **muito mais madura** do que a documentação
histórica sugeria:

| Item                                                                                            | Estado antes desta entrega                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema `cv_voos`, `cv_rdv_operacional`, `cv_voo_etapas`, `cv_voo_tripulantes`, `cv_voo_eventos` | ✅ Migrations 0410/0411, tenant-scoped, indexado, com triggers de guarda de tenant                                                                                                                   |
| Rotas CRUD de voos/RDV, transições de status operacional, dashboard                             | ✅ `worker-airtrust/src/routes/controle-voos.ts`                                                                                                                                                     |
| RDV: estados                                                                                    | ⚠️ Só `rascunho` / `preenchimento_finalizado` / `cancelado` — **sem fluxo de revisão/aprovação da Coordenação**                                                                                      |
| Tripulação                                                                                      | ⚠️ Schema existia, **sem rota de CRUD**                                                                                                                                                              |
| Abastecimentos                                                                                  | ❌ Ausente                                                                                                                                                                                           |
| Alertas                                                                                         | ⚠️ Só contadores agregados no dashboard, sem motor de regras                                                                                                                                         |
| Aprovações / histórico de revisão campo-a-campo                                                 | ❌ Ausente                                                                                                                                                                                           |
| PDF do relatório                                                                                | ❌ Ausente                                                                                                                                                                                           |
| RBAC `voos.rdv.*`                                                                               | ❌ Ausente (só hierarquia genérica de role)                                                                                                                                                          |
| SIGVOOS importer                                                                                | ✅ Read-only confirmado, sem qualquer escrita de volta                                                                                                                                               |
| FRMS                                                                                            | ⚠️ Ainda lê SIGVOOS diretamente em produção (`services/sigvoos-frms.ts`); o caminho canônico `controle-voos-source.ts` existe mas está **dormente** (shadow mode, feature-flag desligada por padrão) |
| Frontend RDV (piloto)                                                                           | ✅ Real, não-mock, com create/edit/finalize                                                                                                                                                          |
| Frontend Coordenação                                                                            | ❌ Ausente                                                                                                                                                                                           |

## 2. O que esta entrega adiciona (estritamente aditivo)

- **Migration `0438_controle_voos_rdv_coordenacao_workflow.sql`** (+ rollback documentado):
  **15** novas colunas em `cv_rdv_operacional` (`workflow_status`, `versao`,
  `enviado_por`/`enviado_em`, `revisao_iniciada_por`/`revisao_iniciada_em`,
  `devolvido_por`/`devolvido_em`, `aprovado_coordenacao_por`/`aprovado_coordenacao_em`,
  `finalizado_workflow_em`, `reaberto_por`/`reaberto_em`, `motivo_devolucao`,
  `motivo_cancelamento`) e 3 tabelas novas (`cv_rdv_aprovacoes`, `cv_rdv_revisoes`,
  `cv_rdv_alertas`) + 1 tabela operacional nova (`cv_voo_abastecimentos`). Nenhuma tabela ou
  coluna existente foi removida, renomeada ou teve seu CHECK alterado.
  A segunda execução da migration é **fail-closed** (guarda `_rollback_0438_column_guard`
  aborta se `workflow_status` já existir) — **não é idempotente**.
- **Máquina de estados do fluxo** (backend):
  `rascunho → enviado → em_revisao → aprovado_coordenacao → finalizado → reaberto → em_revisao`,
  com estados explícitos **`devolvido`** e **`reaberto`** (não colapsados em
  `rascunho`/`em_revisao`), devolução (`em_revisao → devolvido`, justificativa obrigatória)
  e cancelamento (justificativa obrigatória). Concorrência otimista via coluna `versao`.
- **Código modular** (extração WIP): rotas em
  `worker-airtrust/src/routes/controle-voos-rdv-workflow.ts`, RBAC/estados em
  `services/controle-voos/rdv-workflow.ts`, alertas em `rdv-alertas.ts`, acesso a dados em
  `repositories/controle-voos/rdv-repository.ts`. O CRUD operacional pré-existente permanece em
  `controle-voos.ts` (inclui `finalizar-preenchimento`, que grava aprovação tipo
  **`COMANDANTE`**).
- **Endpoints novos**: `enviar`, `iniciar-revisao`, `devolver`, `corrigir` (Coordenação, com
  diff campo-a-campo + justificativa), `aprovar`, `finalizar`, `reabrir`, `cancelar`,
  `GET .../alertas`, `GET .../revisoes`, `GET .../aprovacoes`, `GET /rdv/fila` (fila da
  Coordenação com filtros), `GET /voos/meus` (piloto), CRUD de `tripulantes` e
  `abastecimentos`, CRUD de **etapas/trechos** (`controle-voos-rdv-etapas.ts`),
  `GET .../rdv/relatorio-petrobras` (PDF).
- **Motor de alertas** (`syncRdvAlerts`): regras auto-contidas (campos obrigatórios
  ausentes, tripulação ausente, comandante duplicado, trechos ausentes/incompletos/
  sobrepostos/continuidade ICAO, combustível incoerente, abastecimento sem trecho ou
  com etapa inválida), persistidas em `cv_rdv_alertas` com resolução automática quando
  a regra deixa de se aplicar.
- **RBAC real por capability `voos.rdv.*`**: resolve via `usuario_permissoes`
  (DENY > GRANT > default de role) em `hasRdvCapability` — **não** é só wrapper de
  `checkPermission(role)`. Sem elevar globalmente `student`: acesso próprio do piloto
  sempre exige vínculo de tripulação (`usuarios.funcionario_id` → `cv_voo_tripulantes`).
- **PDF do relatório Petrobras** (`services/controle-voos/rdv-pdf.ts`, pdf-lib): layout de
  referência, totais vindos do backend, multi-página com cabeçalho repetido, e marca d'água
  **"TESTE — NÃO ENVIAR À PETROBRAS"** em 100% das páginas (sem flag para suprimir nesta
  entrega).
- **Frontend**: painel de workflow no detalhe do RDV (`ControleVoosRdvWorkflowPanel`),
  página **Meus voos** (piloto, escopo próprio) e **Fila da Coordenação** (com filtros).

## 3. Arquitetura (transição e definitiva) — inalterada por esta entrega

```
SIGVOOS → adaptador/importador (read-only) → Controle de Voos → dados normalizados → FRMS (shadow mode)
```

Esta entrega **não altera** a integração SIGVOOS nem a source policy do FRMS:

- `services/sigvoos-frms.ts` continua sendo o caminho legado real em produção.
- `lib/frms/controle-voos-source.ts` continua dormente (shadow mode, flag desligada).
- Nenhuma jornada do FRMS foi reprocessada ou regravada.

O RDV agora tem um fluxo de aprovação completo, mas seu **modelo de dados operacional**
(`cv_voos`, `cv_rdv_operacional`, `cv_voo_etapas`) já era, antes desta entrega, a fonte
"AirTrust-owned" preparada para futuramente alimentar o FRMS via `controle-voos-source.ts`
— este trabalho apenas adiciona o ciclo de vida de revisão/aprovação em cima dela.

## 3.1 CRUD de etapas (`cv_voo_etapas`) — realizado vs programado

Rotas em `worker-airtrust/src/routes/controle-voos-rdv-etapas.ts` + serviço
`services/controle-voos/rdv-etapas.ts` (não em `controle-voos.ts`).

| Método | Path                                 | Notas                                                                                   |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------- |
| GET    | `/voos/:id/etapas`                   | Lista etapas **realizadas**; `meta.programado` vem do voo (`horario_previsto_*` + ICAO) |
| POST   | `/voos/:id/etapas`                   | Cria etapa `origem_dados='MANUAL'`; body exige `versao` (RDV)                           |
| PATCH  | `/voos/:id/etapas/:etapaId`          | Atualiza campos operacionais; preserva `origem_dados` SIGVOOS                           |
| DELETE | `/voos/:id/etapas/:etapaId`          | Soft delete (`deleted_at`); sem restore                                                 |
| POST   | `/voos/:id/etapas/:etapaId/duplicar` | Nova linha com próximo `numero_etapa`                                                   |
| PUT    | `/voos/:id/etapas/ordem`             | Body `{ versao, ordem: number[] }`                                                      |

**Programado vs realizado:** não há colunas dual nas etapas. Horários/combustível em
`cv_voo_etapas` = realizado; `cv_voos.horario_previsto_*` = programado.

**Edição:** piloto em `workflow_status` ∈ {`rascunho`,`devolvido`}; Coordenação em
`em_revisao` com capability `corrigir` + justificativa (grava diffs em `cv_rdv_revisoes`
com `entidade='etapa'`). Toda mutação incrementa `cv_rdv_operacional.versao`, sincroniza
agregados do RDV a partir das etapas e recalcula alertas.

**FRMS (futuro, read-only note):** quando a transformação FRMS for ativada, deve preferir
etapas persistidas em `cv_voo_etapas` sobre campos agregados de `cv_rdv_operacional`
quando houver pernas. Esta entrega **não** altera write paths do FRMS nem ativa a flag.

Índice aditivo em 0438: `UNIQUE (empresa_id, voo_id, numero_etapa) WHERE deleted_at IS NULL`.

## 4. Máquina de estados

```
RASCUNHO --enviar (requer status=preenchimento_finalizado)--> ENVIADO
ENVIADO --iniciar-revisao--> EM_REVISAO
EM_REVISAO --devolver (justificativa obrigatória)--> DEVOLVIDO
EM_REVISAO --corrigir (justificativa obrigatória, não muda o estado)--> EM_REVISAO
EM_REVISAO --aprovar--> APROVADO_COORDENACAO
APROVADO_COORDENACAO --finalizar--> FINALIZADO
FINALIZADO --reabrir (justificativa obrigatória)--> REABERTO
REABERTO --iniciar-revisao--> EM_REVISAO
DEVOLVIDO --enviar (após re-finalizar preenchimento)--> ENVIADO
{RASCUNHO, ENVIADO, EM_REVISAO, DEVOLVIDO, REABERTO} --cancelar (justificativa obrigatória)--> CANCELADO
```

`DEVOLVIDO` e `REABERTO` são **estados reais e independentemente consultáveis**
(`workflow_status`); o eixo operacional `status` pode voltar a `rascunho` para destrancar
edição do piloto, sem colapsar o eixo de workflow.

Em `finalizar-preenchimento`, o backend grava em `cv_rdv_aprovacoes` um registro
`tipo_aprovacao='COMANDANTE'` / `status='APROVADO'` (confirmação do piloto responsável —
**não** é assinatura digital).

Decisão de escopo: os estados `APROVADO_CONTRATANTE`/`APROVADO_COMERCIAL` do enunciado
("quando exigido") **não são um gate obrigatório nesta entrega** — o enum
`cv_rdv_aprovacoes.tipo_aprovacao` já suporta `CONTRATANTE`/`COMERCIAL` para uso futuro,
mas hoje só `COMANDANTE` e `COORDENACAO` são gravados. Documentado como item de backlog
(seção 8).

Toda transição é validada no backend (`assertRdvWorkflowTransition`) — nunca depende só da
UI. Cada transição de fluxo grava um registro em `cv_rdv_aprovacoes` e incrementa `versao`
(concorrência otimista: toda mutação exige o `versao` esperado ou retorna 409).
Separação de funções: `assertNotSelfApproval` impede que o responsável pelo preenchimento
aprove o mesmo RDV na Coordenação.

## 5. RBAC — capabilities `voos.rdv.*`

Implementadas em `hasRdvCapability` / `requireRdvCapability` com a mesma precedência do
resto do backend:

1. **DENY** explícito em `usuario_permissoes` → nega
2. **GRANT** explícito em `usuario_permissoes` → concede
3. default por role (não é só `checkPermission` / wrapper de hierarquia)

| Capability                                                                                                             | Default de role                      | Escopo adicional                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `voos.rdv.visualizar_proprio`, `criar_proprio`, `editar_rascunho_proprio`, `enviar`, `cancelar`                        | ≥ `student`                          | piloto: exige vínculo de tripulação no voo |
| `voos.rdv.visualizar_todos`, `revisar`, `corrigir`, `devolver`, `aprovar_coordenacao`, `reabrir`, `exportar_petrobras` | ≥ `manager` (Coordenação)            | sem vínculo de tripulação                  |
| `voos.rdv.aprovar_comercial`                                                                                           | **sem default** — só GRANT explícito | gate futuro                                |

Testado: student/viewer sem capability → 403; piloto com capability + crew → OK; piloto com
capability sem crew → 403 `CONTROLE_VOOS_RDV_NOT_CREW`; Coordenação com capability → OK;
manager com DENY explícito em capability → 403; cross-tenant → 404; IDOR sem crew → 403;
self-approval da Coordenação → 403 `CONTROLE_VOOS_RDV_SELF_APPROVAL_FORBIDDEN`.

## 6. Alertas implementados (escopo reduzido, documentado)

Implementadas regras auto-contidas em Controle de Voos (ver `computeRdvAlertRules`):
`CAMPOS_OBRIGATORIOS_AUSENTES`, `TRIPULACAO_AUSENTE`, `COMANDANTE_DUPLICADO`,
`TRECHOS_AUSENTES`, `TRECHO_ORIGEM_AUSENTE`, `TRECHO_DESTINO_AUSENTE`,
`TRECHO_POUSO_ANTES_DECOLAGEM`, `TRECHO_CORTE_ANTES_POUSO`, `TRECHOS_SOBREPOSTOS`,
`TRECHOS_CONTINUIDADE_ICAO`, `TRECHO_COMBUSTIVEL_INCOERENTE`, `TRECHO_COMBUSTIVEL_NEGATIVO`,
`ABASTECIMENTO_SEM_TRECHO`, `ABASTECIMENTO_ETAPA_INVALIDA`. Impeditivos de envio vs
atenção conforme severidade no código.

**Deliberadamente fora do escopo desta entrega** (backlog): alertas de qualificação/ASO/
habilitação vencida (cruzariam com o domínio de Qualificações — risco de acoplamento sem
auditoria própria), desvio de consumo com percentual configurável, e "relatório alterado
após envio" como alerta dedicado (hoje coberto pela trilha de revisões/justificativa).

## 7. Relatório Petrobras (PDF)

- Gerado sob demanda em `GET /api/controle-voos/voos/:id/rdv/relatorio-petrobras`
  (capability `voos.rdv.exportar_petrobras`, default ≥ `manager`).
- Todos os totais vêm de `cv_rdv_operacional`/`cv_voo_etapas` calculados pelo backend — o
  PDF nunca recalcula.
- Marca d'água **"TESTE — NÃO ENVIAR À PETROBRAS"** em todas as páginas, sem flag de
  supressão nesta entrega.
- Hash de integridade (SHA-256 sobre campos-chave + timestamp) e identificador interno —
  **não é assinatura digital nem validação regulatória** (texto explícito no rodapé).
- Suporta múltiplos trechos/tripulantes/páginas com cabeçalho repetido.

## 8. Itens em standby / backlog explícito

- Aprovação `CONTRATANTE`/`COMERCIAL` como gate bloqueante formal.
- Alertas cruzando com Qualificações/ASO/habilitação (hoje só informativo, por design do
  enunciado — mas nem isso foi implementado nesta entrega).
- UI dedicada de "observações" tipadas (hoje reaproveita `ocorrencias`/`divergencias` já
  existentes em `cv_rdv_operacional` — evita duplicar schema sem necessidade comprovada).
- Anexo de comprovante de abastecimento em R2 (`cv_voo_abastecimentos.anexo_r2_key` já
  existe no schema; upload em si não foi implementado).
- Migração real do FRMS para consumir `controle-voos-source.ts` (fora de escopo explícito
  desta entrega — a integração direta SIGVOOS→FRMS não deve ser alterada).
- Cutover do SIGVOOS como fonte operacional (não iniciado; critérios em
  `AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md` seção 4 continuam válidos).

## 9. Rollback

- Migration rollback: `worker-airtrust/migrations/rollback_0438_controle_voos_rdv_coordenacao_workflow.sql`
  (nome **fora** da cadeia numérica — aplicar só manualmente). Remove as tabelas novas e as
  15 colunas adicionadas; **fail-closed** se existir qualquer dado de workflow (aprovações,
  revisões, alertas, abastecimentos, ou RDV com `workflow_status <> 'rascunho'` / `versao <> 1`
  / campos novos preenchidos).
- A própria `0438` também é fail-closed na **reexecução** (não idempotente).
- Código: extração modular em `controle-voos-rdv-workflow.ts` + services/repository; reverter
  o merge do PR remove o fluxo novo sem afetar as rotas/endpoints pré-existentes do CRUD.
- Nenhuma migration foi aplicada em staging ou produção. Testado apenas localmente (D1
  local, schema vazio e schema pré-existente com 0410/0411).

## 10. Critérios para staging (não executado nesta entrega)

1. Revisão humana deste PR (arquitetura, RBAC, PDF).
2. Aplicar `0438` em staging via `scripts/apply-migration-production.sh` (ou wrapper
   equivalente de staging) com autorização explícita.
3. Fumaça manual do fluxo completo (enviar → revisar → devolver → corrigir → aprovar →
   finalizar → reabrir) com dados fictícios, confirmando `workflow_status` explícitos
   `devolvido`/`reaberto`.
4. Confirmar RBAC por capability (piloto vs Coordenação, DENY/GRANT, self-approval) com
   usuários reais de staging.
5. Confirmar que o PDF gerado em staging mantém a marca d'água.

## 11. Riscos

| Risco                                                                               | Severidade | Mitigação                                                                                                                                       |
| ----------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| God-file histórico em `controle-voos.ts`                                            | Médio      | Extração WIP para `controle-voos-rdv-workflow.ts` + services; **sem** raise de caps no `architecture-performance-guard` para `controle-voos.ts` |
| Alertas cobrem só 6–7 de ~20 regras do enunciado                                    | Médio      | Documentado explicitamente (seção 6); rule engine é extensível (`RdvAlertRule[]`)                                                               |
| Segunda execução de 0438 falha (não idempotente)                                    | Baixo      | Intencional / fail-closed; documentado; rollback dedicado fora da cadeia numérica                                                               |
| PDF não foi validado visualmente em navegador (ambiente sem preview de PDF binário) | Baixo      | Testado via bytes (`%PDF-`, tamanho, watermark desenhado); recomenda-se abertura manual em staging antes de uso real                            |
