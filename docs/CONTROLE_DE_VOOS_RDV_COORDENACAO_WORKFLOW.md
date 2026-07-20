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

| Item | Estado antes desta entrega |
|---|---|
| Schema `cv_voos`, `cv_rdv_operacional`, `cv_voo_etapas`, `cv_voo_tripulantes`, `cv_voo_eventos` | ✅ Migrations 0410/0411, tenant-scoped, indexado, com triggers de guarda de tenant |
| Rotas CRUD de voos/RDV, transições de status operacional, dashboard | ✅ `worker-airtrust/src/routes/controle-voos.ts` (2112 linhas) |
| RDV: estados | ⚠️ Só `rascunho` / `preenchimento_finalizado` / `cancelado` — **sem fluxo de revisão/aprovação da Coordenação** |
| Tripulação | ⚠️ Schema existia, **sem rota de CRUD** |
| Abastecimentos | ❌ Ausente |
| Alertas | ⚠️ Só contadores agregados no dashboard, sem motor de regras |
| Aprovações / histórico de revisão campo-a-campo | ❌ Ausente |
| PDF do relatório | ❌ Ausente |
| RBAC `voos.rdv.*` | ❌ Ausente (só hierarquia genérica de role) |
| SIGVOOS importer | ✅ Read-only confirmado, sem qualquer escrita de volta |
| FRMS | ⚠️ Ainda lê SIGVOOS diretamente em produção (`services/sigvoos-frms.ts`); o caminho canônico `controle-voos-source.ts` existe mas está **dormente** (shadow mode, feature-flag desligada por padrão) |
| Frontend RDV (piloto) | ✅ Real, não-mock, com create/edit/finalize |
| Frontend Coordenação | ❌ Ausente |

## 2. O que esta entrega adiciona (estritamente aditivo)

- **Migration `0438_controle_voos_rdv_coordenacao_workflow.sql`** (+ rollback documentado):
  novas colunas em `cv_rdv_operacional` (workflow_status, versao, enviado_*, revisao_*,
  aprovado_coordenacao_*, finalizado_workflow_em, reaberto_*, motivo_devolucao,
  motivo_cancelamento) e 3 tabelas novas (`cv_rdv_aprovacoes`, `cv_rdv_revisoes`,
  `cv_rdv_alertas`) + 1 tabela operacional nova (`cv_voo_abastecimentos`). Nenhuma tabela ou
  coluna existente foi removida, renomeada ou teve seu CHECK alterado.
- **Máquina de estados do fluxo** (backend, `worker-airtrust/src/routes/controle-voos.ts`):
  `rascunho → enviado → em_revisao → aprovado_coordenacao → finalizado → em_revisao (reabertura)`,
  com devolução (`em_revisao → rascunho`, justificativa obrigatória) e cancelamento
  (justificativa obrigatória). Concorrência otimista via coluna `versao`.
- **Endpoints novos**: `enviar`, `iniciar-revisao`, `devolver`, `corrigir` (Coordenação, com
  diff campo-a-campo + justificativa), `aprovar`, `finalizar`, `reabrir`, `cancelar`,
  `GET .../alertas`, `GET .../revisoes`, `GET .../aprovacoes`, `GET /rdv/fila` (fila da
  Coordenação com filtros), `GET /voos/meus` (piloto), CRUD de `tripulantes` e
  `abastecimentos`, `GET .../rdv/relatorio-petrobras` (PDF).
- **Motor de alertas** (`syncRdvAlerts`): 7 regras auto-contidas (campos obrigatórios
  ausentes, tripulação ausente, comandante duplicado, trechos ausentes, trechos
  sobrepostos, abastecimento sem trecho), persistidas em `cv_rdv_alertas` com
  resolução automática quando a regra deixa de se aplicar.
- **RBAC `voos.rdv.*`**: capabilities nomeadas (ver seção 5) integradas sobre a hierarquia
  de roles já existente — **sem elevar globalmente `student`**: acesso próprio do piloto
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

## 4. Máquina de estados

```
RASCUNHO --enviar (requer status=preenchimento_finalizado)--> ENVIADO
ENVIADO --iniciar-revisao--> EM_REVISAO
EM_REVISAO --devolver (justificativa obrigatória)--> RASCUNHO
EM_REVISAO --corrigir (justificativa obrigatória, não muda o estado)--> EM_REVISAO
EM_REVISAO --aprovar--> APROVADO_COORDENACAO
APROVADO_COORDENACAO --finalizar--> FINALIZADO
FINALIZADO --reabrir (justificativa obrigatória)--> EM_REVISAO
{RASCUNHO, ENVIADO, EM_REVISAO} --cancelar (justificativa obrigatória)--> CANCELADO
```

Decisão de escopo: os estados `APROVADO_CONTRATANTE`/`APROVADO_COMERCIAL` do enunciado
("quando exigido") **não são um gate obrigatório nesta entrega** — o enum
`cv_rdv_aprovacoes.tipo_aprovacao` já suporta `CONTRATANTE`/`COMERCIAL` para uso futuro,
mas hoje só `COORDENACAO` é gravado. Documentado como item de backlog (seção 8).

Toda transição é validada no backend (`assertRdvWorkflowTransition`) — nunca depende só da
UI. Cada transição grava um registro em `cv_rdv_aprovacoes` e incrementa `versao`
(concorrência otimista: toda mutação exige o `versao` esperado ou retorna 409).

## 5. RBAC — capabilities `voos.rdv.*`

Implementadas como wrappers nomeados sobre a hierarquia de roles já existente
(`admin > manager > instructor > editor > student > viewer`), **sem elevar globalmente**
o perfil `student`:

| Capability | Regra de acesso |
|---|---|
| `voos.rdv.visualizar_proprio`, `criar_proprio`, `editar_rascunho_proprio`, `enviar`, `cancelar` | role ≥ `editor` **OU** (role ≥ `student` **E** vínculo de tripulação no voo via `usuarios.funcionario_id` → `cv_voo_tripulantes`) |
| `voos.rdv.visualizar_todos`, `revisar`, `corrigir`, `devolver`, `aprovar_coordenacao`, `reabrir`, `exportar_petrobras` | role ≥ `manager` (Coordenação) |
| `voos.rdv.aprovar_comercial` | reservada para o gate futuro (não usada nesta entrega) |

Testado: piloto sem vínculo de tripulação recebe 403 (`CONTROLE_VOOS_RDV_NOT_CREW`);
Coordenação (`manager`+) acessa qualquer RDV do tenant sem precisar de vínculo; cross-tenant
retorna 404 (nunca 200 com dado de outra empresa).

## 6. Alertas implementados (escopo reduzido, documentado)

Implementadas 7 regras auto-contidas em Controle de Voos (ver `computeRdvAlertRules`):
`CAMPOS_OBRIGATORIOS_AUSENTES`, `TRIPULACAO_AUSENTE`, `COMANDANTE_DUPLICADO`,
`TRECHOS_AUSENTES`, `TRECHOS_SOBREPOSTOS`, `ABASTECIMENTO_SEM_TRECHO`. As duas primeiras e
`COMANDANTE_DUPLICADO`/`TRECHOS_SOBREPOSTOS` são `IMPEDE_ENVIO`; as demais, `ATENCAO`.

**Deliberadamente fora do escopo desta entrega** (backlog): alertas de qualificação/ASO/
habilitação vencida (cruzariam com o domínio de Qualificações — risco de acoplamento sem
auditoria própria), desvio de consumo com percentual configurável, e "relatório alterado
após envio" como alerta dedicado (hoje coberto pela trilha de revisões/justificativa).

## 7. Relatório Petrobras (PDF)

- Gerado sob demanda em `GET /api/controle-voos/voos/:id/rdv/relatorio-petrobras`
  (capability `voos.rdv.exportar_petrobras`, role ≥ `manager`).
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

- Migration: `0438_controle_voos_rdv_coordenacao_workflow_rollback.sql` remove as tabelas
  novas e as colunas adicionadas; recusa-se a prosseguir se existir qualquer RDV com
  `workflow_status <> 'rascunho'` (evita perda silenciosa de fluxo em andamento).
- Código: toda a mudança é aditiva a `controle-voos.ts` — reverter o merge do PR remove o
  fluxo novo sem afetar as rotas/endpoints pré-existentes.
- Nenhuma migration foi aplicada em staging ou produção. Testado apenas localmente (D1
  local, schema vazio e schema pré-existente com 0410/0411).

## 10. Critérios para staging (não executado nesta entrega)

1. Revisão humana deste PR (arquitetura, RBAC, PDF).
2. Aplicar `0438` em staging via `scripts/apply-migration-production.sh` (ou wrapper
   equivalente de staging) com autorização explícita.
3. Fumaça manual do fluxo completo (enviar → revisar → devolver → corrigir → aprovar →
   finalizar → reabrir) com dados fictícios.
4. Confirmar RBAC (piloto vs Coordenação) com usuários reais de staging.
5. Confirmar que o PDF gerado em staging mantém a marca d'água.

## 11. Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| `controle-voos.ts` cresceu para 3585 linhas / 66 `.prepare()` | Médio | Ratchets de arquitetura atualizados com justificativa; refatorar em arquivo dedicado é backlog técnico razoável, não bloqueador |
| Alertas cobrem só 6 de ~20 regras do enunciado | Médio | Documentado explicitamente (seção 6); rule engine é extensível (`RdvAlertRule[]`) |
| RBAC de capability é convenção sobre hierarquia, não um sistema fino de permissões dedicado | Baixo | Suficiente para o objetivo (ownership + role mínimo); documentado em vez de forçar uma reforma de RBAC fora de escopo |
| PDF não foi validado visualmente em navegador (ambiente sem preview de PDF binário) | Baixo | Testado via bytes (`%PDF-`, tamanho, watermark desenhado); recomenda-se abertura manual em staging antes de uso real |
