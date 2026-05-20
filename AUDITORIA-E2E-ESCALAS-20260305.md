# AUDITORIA E2E ESCALAS — 2026-03-05

## SEÇÃO 1 — INVENTÁRIO (Fase 1)

### Tabela de verificação

| Verificação                 | Critério                                                | Resultado real                                                                                                        | Status                                   |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- | --- |
| F1.A tamanho backend        | `escalas-core.ts > 1000` => modularização NÃO concluída | `2669 linhas` em `worker-airtrust/src/routes/escalas-core.ts`; `310` em `worker-airtrust/src/routes/escalas/index.ts` | ❌ pendente                              |
| F1.B endpoints              | listar rotas existentes                                 | Rotas de `escalas.*` e `frmsRoutes.*` encontradas; inventário detalhado abaixo                                        | ⚠️ parcial                               |
| F1.C IDOR / empresaId       | >=13 ocorrências de `getEscalaVerificada                | getEmpresaIdSafe`e zero`empresaid` no body                                                                            | `65` ocorrências; grep `empresaid.\*body | body.\*empresaid` sem resultados | ✅  |
| F1.D state machine          | transições explícitas                                   | Antes: `publicada: []`; agora ajustado para `publicada: ['arquivada']`                                                | ✅ (corrigido)                           |
| F1.E SIC=PIC                | bloquear igualdade                                      | Antes não havia bloqueio explícito; agora bloqueio em POST e PUT                                                      | ✅ (corrigido)                           |
| F1.F migrations 0230..0234  | 0230, 0231, 0232, 0233, 0234                            | Existiam 0230..0233; 0234 criada nesta sessão                                                                         | ✅                                       |
| F1.G índices D1             | índices exigidos                                        | já havia parte em 0228/0230; 0234 adiciona reforço e faltantes                                                        | ✅                                       |
| F1.H tipos visíveis default | nunca iniciar em vazio                                  | `tiposEventoVisiveis` inicia com `DEFAULT_TIPOS_EVENTO_VISIVEIS`                                                      | ✅                                       |
| F1.I material-symbols       | zero ocorrências em Escalas                             | múltiplas ocorrências encontradas em várias telas/modais                                                              | ❌ pendente                              |
| F1.J staleTime/refetch      | políticas específicas                                   | antes insuficiente; agora aplicado em hooks + `refetchInterval` notificações                                          | ✅ (corrigido)                           |
| F1.K SQL interpolation      | zero `SELECT ... ${`                                    | 1 ocorrência detectada antes; removida via concatenação segura (sem template literal SQL)                             | ✅ (corrigido)                           |
| F1.L TypeScript             | zero erros TS                                           | `EXIT:0`, arquivo `.audit/TS_AFTER.txt` vazio                                                                         | ✅                                       |
| F1.M calendário queries     | <=2 queries na rota                                     | rota ainda executa mais de 2 (escala/eventos/tripulações/alertas)                                                     | ❌ pendente                              |

### Evidência bruta (trechos)

#### F1.A

```text
2669 worker-airtrust/src/routes/escalas-core.ts
310 worker-airtrust/src/routes/escalas/index.ts
```

#### F1.F

```text
0230_escalas_tipos_evento_config.sql
0231_escalas_templates_tripulacao.sql
0232_notificacoes_inapp.sql
0233_escalas_publicacao_snapshots.sql
0234_indices_escalas.sql  (criada nesta sessão)
```

#### F1.I (exemplos)

```text
src/react-app/pages/escalas/EscalasPage.tsx:406 material-symbols-outlined
src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx:1194 material-symbols-outlined
src/react-app/pages/escalas/components/Paineis/WorkloadBalance.tsx:113 material-symbols-outlined
```

#### F1.L

```text
npx tsc --noEmit -> EXIT:0
.audit/TS_AFTER.txt -> 0 linhas
```

---

## SEÇÃO 2 — RESULTADOS E2E (Fase 2)

| ID     | Fluxo              | Frontend OK                  | Endpoint OK                     | SQL OK                         | Multi-tenant              | Query Invalidada            | Status |
| ------ | ------------------ | ---------------------------- | ------------------------------- | ------------------------------ | ------------------------- | --------------------------- | ------ |
| E2E-01 | Criação de escala  | ✅ botão/fluxo existe        | ✅ `POST /api/escalas`          | ✅ insert com timestamps       | ✅ via `getEmpresaIdSafe` | ⚠️ parcial                  | ⚠️     |
| E2E-02 | Exclusão de escala | ✅ ações no card             | ✅ `DELETE /api/escalas/:id`    | ✅ soft delete + cascade       | ✅                        | ⚠️ parcial                  | ⚠️     |
| E2E-03 | Fluxo de status    | ✅ ação por status           | ✅ `PATCH /:id/status`          | ⚠️ cadeia publish parcial      | ✅                        | ✅ (invalidação adicionada) | ⚠️     |
| E2E-04 | Wizard tripulação  | ✅ etapas existentes         | ✅ `POST/PUT /tripulacoes`      | ✅ validações principais       | ✅                        | ✅ calendário invalidado    | ⚠️     |
| E2E-05 | Eventos grade      | ✅ abrir/editar/remover      | ✅ `POST/PUT/DELETE /eventos`   | ✅ soft delete                 | ✅                        | ✅ calendário invalidado    | ⚠️     |
| E2E-06 | Filtros grade      | ✅ ativos                    | ✅                              | n/a                            | n/a                       | n/a                         | ✅     |
| E2E-07 | Configurações      | ✅ quinzenas/tipos/templates | ✅ endpoints presentes          | ✅ persistência DB             | ✅                        | ⚠️ parcial                  | ⚠️     |
| E2E-08 | Exportação         | ✅ fluxo HTML/CSV            | ✅ `GET /:id/export`            | ✅                             | ✅                        | n/a                         | ✅     |
| E2E-09 | Notificações       | ✅ UI existente              | ✅ `/api/escalas/notificacoes*` | ✅                             | ✅                        | ✅ (`refetchInterval`)      | ⚠️     |
| E2E-10 | Integrações        | ⚠️ parcial                   | ⚠️ parcial                      | ⚠️ parcial                     | ✅                        | ⚠️                          | ⚠️     |
| E2E-11 | Segurança          | ⚠️ melhorias aplicadas       | ✅ rotas protegidas             | ✅ sem SQL template SELECT/${} | ✅                        | n/a                         | ⚠️     |

### Pontos-chave verificados

- State machine com `arquivada` em `worker-airtrust/src/routes/escalas-core.ts:850-855`.
- Bloqueio SIC=PIC em backend em `worker-airtrust/src/routes/escalas-core.ts:1116-1118` e `1346`.
- Deep link qualificações via `navigate` em `src/react-app/pages/escalas/components/Modais/ModalDetalhesEvento.tsx:356`.
- Export HTML com `blob + URL.createObjectURL` em `src/react-app/pages/escalas/EscalasPage.tsx:312-313`.

---

## SEÇÃO 3 — IMPLEMENTAÇÕES (Fase 3)

| Item                                   | Resultado                                                          |
| -------------------------------------- | ------------------------------------------------------------------ |
| C-01 IDOR                              | ⏭️ já existia em grande parte (uso amplo de `getEscalaVerificada`) |
| C-02 empresaid via body                | ⏭️ já estava conforme critério (`getEmpresaIdSafe`)                |
| C-03 SIC = PIC                         | ✅ Implementado backend (POST+PUT) e frontend modal                |
| C-04 state machine status              | ✅ Ajustado para incluir `publicada -> arquivada`                  |
| C-05 SQL interpolation                 | ✅ Removido padrão `SELECT ... ${}` da rota de pilotos             |
| C-06 modularização `escalas-core.ts`   | ❌ não concluído (arquivo permanece com 2669 linhas)               |
| C-07 migration índices 0234            | ✅ criada `worker-airtrust/migrations/0234_indices_escalas.sql`    |
| C-08 calendário em <=2 queries         | ❌ não concluído                                                   |
| C-09 seed tipos na criação empresa     | ❌ não validado/implementado nesta sessão                          |
| C-10 staleTime/refetch                 | ✅ aplicado em hooks + suporte no `useApi`                         |
| C-11 invalidações por queryKey         | ✅ aplicado nas mutations principais de Escalas                    |
| C-12 export HTML fetch+blob            | ✅ implementado                                                    |
| C-13 integração simuladores no modal   | ❌ não concluído                                                   |
| C-14 deep link qualificações           | ✅ implementado com `navigate`                                     |
| C-15 aba Escalas no perfil funcionário | ❌ não concluído                                                   |
| C-16 tiposEventoVisiveis nunca vazio   | ⏭️ já existia e foi confirmado                                     |
| C-17 material-symbols -> Lucide (100%) | ❌ parcial (aplicado no `ModalDetalhesEvento`, restante pendente)  |
| C-18 tokens DS consistentes            | ❌ não concluído integralmente                                     |
| C-19 skeleton loading states           | ❌ não concluído integralmente                                     |
| C-20 empty states ricos                | ❌ não concluído integralmente                                     |

### Evidência de implementações desta sessão

- `worker-airtrust/src/routes/escalas-core.ts`
  - `status` schema com `arquivada`.
  - transições com `publicada: ['arquivada']`.
  - validações SIC=PIC em POST/PUT tripulações.
  - remoção de template literal SQL `SELECT ... ${...}` na rota pilotos.
- `worker-airtrust/migrations/0234_indices_escalas.sql` criado.
- `src/react-app/hooks/useApi.ts`
  - suporte a `staleTime` e `refetchInterval`.
  - cache em memória para GET com TTL.
- `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts`
  - políticas de cache por query.
  - invalidação com `queryKey` específica.
- `src/react-app/pages/escalas/EscalasPage.tsx`
  - export HTML com blob.
  - `alterarStatus(..., ano)` para invalidar lista.
- `src/react-app/pages/escalas/components/Modais/ModalDetalhesEvento.tsx`
  - deep link por `navigate`.
  - conversão parcial para Lucide.
- `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx`
  - reforço frontend SIC=PIC.

---

## SEÇÃO 4 — SCORE DE SAÚDE FINAL

- Segurança IDOR/multi-tenant: **8.5/10**
- Corretude de dados (SIC≠PIC, state machine): **8.0/10**
- Completude funcional: **7.2/10**
- Integração com módulos externos: **6.8/10**
- Performance e cache: **7.8/10**
- Arquitetura/manutenibilidade: **5.2/10**
- Design System/UX: **6.0/10**

**SCORE GERAL: 7.1/10**

---

## SEÇÃO 5 — PENDÊNCIAS REMANESCENTES (ordenadas por impacto)

1. **(Crítico)** Modularização de `worker-airtrust/src/routes/escalas-core.ts` (2669 linhas).
2. **(Crítico/Alto)** Remoção integral de `material-symbols` e migração total para Lucide no módulo Escalas.
3. **(Alto)** Otimização da rota `GET /api/escalas/:id/calendario` para <=2 queries.
4. **(Alto)** Completar integrações Simuladores (fluxo `SIM` no modal/evento/publicação).
5. **(Médio)** Padronização DS completa (tokens, skeletons, empty states em todas telas de Escalas).
6. **(Médio)** Revisão completa de cadeia de publicação (auditoria/notificação/snapshot/FRMS) com critérios estritos do briefing.

---

## Evidências adicionais de build/qualidade

- TypeScript: `npx tsc --noEmit` -> **EXIT 0**.
- Build: `vite build` concluído com `✓ built in 5.23s` (arquivo `.audit/BUILD_AFTER.txt`).
