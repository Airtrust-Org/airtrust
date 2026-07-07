# Auditoria Preventiva de Bugs — AirTrust
**Data**: 2026-07-07 · **Branch**: `main` @ `14086a24` (= `origin/main`) · **Modo**: 100% read-only — nenhum arquivo alterado, nenhuma migration/deploy/DML executado, nenhum secret tocado.

Metodologia: 7 subagentes especializados (um por módulo) + auditoria estática direta (lint, guards, testes, type-check real) rodados em paralelo, todos read-only. Cada achado abaixo foi verificado por evidência de código (arquivo+linha) antes de entrar no relatório; hipóteses do prompt original que não se confirmaram foram descartadas ou marcadas como tal.

---

## 1. Veredito executivo

### **NO-GO para deploy de produção até os achados CRÍTICO-01 e CRÍTICO-02 serem endereçados.**

Esta auditoria encontrou **11 achados CRÍTICOS**, dos quais **dois são vulnerabilidades de segurança ativas e exploráveis agora, em produção, por qualquer usuário com papel ADMIN em qualquer empresa-cliente**: tomada de conta cross-tenant via impersonação (CRÍTICO-01) e gestão de usuários cross-tenant via `admin-usuarios.ts` (CRÍTICO-02). Isso não é dívida técnica — é uma falha de isolamento multi-tenant na superfície mais sensível do sistema (gestão de identidade), e satisfaz diretamente o critério de NO-GO automático "houver query cross-tenant provável" e "houver role over-provisioned sem teste" definidos no próprio pedido desta auditoria.

Os demais 9 críticos são bugs latentes de produção (fadiga/compliance/qualificação incorretos, vazamento de PDF entre funcionários, qualificação LMS falsa por um caminho ainda não coberto, ausência total de type-check automatizado) — sérios, mas não do tipo "um atacante ganha acesso a outra empresa agora mesmo".

### Top 10 riscos (ordenados por severidade/exploitabilidade)

| # | Risco | Módulo | Por que bloqueia produção |
|---|---|---|---|
| 1 | `POST /api/auth/impersonate` sem checagem de tenant — qualquer ADMIN de qualquer empresa personifica usuário de outra empresa | RBAC | Account takeover cross-tenant, já em produção |
| 2 | `admin-usuarios.ts` (7 endpoints) — ADMIN de empresa A gerencia/edita/desativa usuários da empresa B | RBAC | Mesma classe do #1, superfície maior |
| 3 | `PUT`/`DELETE /api/frms/escalas/:id` sem verificação de tenant | FRMS | Qualquer usuário autenticado altera/apaga escala de tripulante de outra empresa |
| 4 | Upload FIRA cai em `empresa_id='1'` quando vínculo funcionário não resolve | FRMS | Grava/casa dados de horas de voo contra a empresa errada |
| 5 | `usePermissions` lê overrides de permissão de `localStorage` global, nunca limpo no logout/troca de tenant/impersonação | Frontend | Permissão customizada de uma empresa vaza para sessão de outra no mesmo navegador |
| 6 | Conclusão de curso via xAPI/H5P gera qualificação sem checar nota de aprovação | LMS | Qualificação regulatória falsa — mesma classe do incidente de 27/06, caminho diferente |
| 7 | `GET /fichas/:id` e `POST /fichas/:id/pdf` não respeitam o gate de "disponível só no dia da sessão" que as rotas de escrita respeitam | Simuladores | Nota/resultado de avaliação antecipado |
| 8 | `getQualificacoesVencimentoExpr` fabrica vencimento de 12 meses para qualificação "sem vencimento", usado em 6+ lugares (dashboard/alertas/escala) | Qualificações | Viola o invariante `NULL = sem vencimento`; alerta falso de vencimento |
| 9 | `historico-write.ts` grava (persiste, não só exibe) validade de 12 meses fabricada em 2 rotas de escrita | Qualificações | Dado errado gravado no banco, não só exibido |
| 10 | `npm run build` roda um `tsc` que checa **zero arquivos** — não existe type-check funcional em nenhum pipeline do projeto | Deploy/CI | Erros de tipo reais podem entrar em `main` sem qualquer rede de segurança |

**O que bloqueia produção agora**: #1 e #2 (RBAC) — recomendo tratar como incidente de segurança, não como item de backlog normal. #3 e #4 (FRMS) também são exploráveis por qualquer usuário autenticado, não só admin.

**O que pode ir para backlog priorizado** (sério mas não "ativamente explorável por qualquer autenticado agora"): #5–#10, e todos os ALTO/MÉDIO listados nas seções seguintes.

---

## 2. Perfil de bugs encontrados, por padrão

| Padrão | Achados | Observação |
|---|---|---|
| **RBAC/multi-tenant** | CRÍTICO-01, CRÍTICO-02, CRÍTICO-03, CRÍTICO-04, ALTO-06 | O padrão correto (`isPlatformSuperAdmin` + `requireTenantRole`) já existe e está em produção em `empresas.ts`/`empresas-usuarios.ts` — os achados críticos são lugares onde esse padrão não foi replicado. |
| **Cache/estado (frontend)** | CRÍTICO-05, ALTO-07, MÉDIO-14, MÉDIO-15 | Infraestrutura de tenant-scoping (`tenantQueryKey`) existe mas está morta/não usada; mitigado hoje só pelo `queryClient.clear()` bruto no logout/troca de empresa. |
| **LMS/SCORM** | CRÍTICO-06, ALTO-08, MÉDIO-16, MÉDIO-17 | Mesmo padrão do incidente de 27/06 (qualificação sem gate de nota), reaberto por um caminho de código diferente (xAPI/H5P vs SCORM `cmi.core`). |
| **Simuladores/Fichas/PDF** | CRÍTICO-07, ALTO-09, ALTO-10, ALTO-12, MÉDIO-18 | Dois renderizadores de PDF mantidos manualmente em paralelo (causa-raiz confirmada dos 5 commits recentes de ajuste fino de layout). |
| **Qualificações/Compliance** | CRÍTICO-08, CRÍTICO-09, ALTO-11, ALTO-13 | Fallback de 12 meses e "5 implementações independentes de registro vigente" são recorrências do mesmo padrão já documentado em auditorias anteriores (2026-07-04/05/06). |
| **FRMS/Escalas/SIGVOOS** | CRÍTICO-03, CRÍTICO-04, ALTO-11(frms) | SIGVOOS **não está mais** em modo shadow/NO-GO — memória anterior estava desatualizada; virou fonte canônica intencional em 05/06/2026 (commit `809ba57e`, documentado). |
| **Deploy/Migration/TS-runtime** | CRÍTICO-10, ALTO-19, ALTO-20, MÉDIO-21, MÉDIO-22 | O gate de deploy em si (`deploy-airtrust.yml`) é sólido; o problema é ausência de type-check e testes de worker não rodando em CI. |
| **Regressão provável (transversal)** | ver Seção 4 | 5 recorrências confirmadas do padrão "fix aplicado em 1 lugar, não propagado para cópias irmãs". |

---

## 3. Achados críticos (detalhado)

### BUG-AIRTRUST-001 — CRÍTICO — Impersonação permite account takeover cross-tenant
**Arquivo**: `worker-airtrust/src/routes/auth.ts:1749-1857`
**Categoria**: RBAC/multi-tenant

```ts
// isAdminRole(callerRole) é a ÚNICA checagem — callerRole vem do tenant do próprio caller
const target = await db.prepare(
  `SELECT id, email, perfil, nome FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`
).bind(targetUserId).first<TargetUser>();
```
`ADMIN`/`ADMINISTRADOR` é um papel **por empresa** (`usuarios_empresas.role`, `migrations/0150_multi_tenant_empresas.sql:60`), não de plataforma. A rota busca o usuário-alvo só por `id`, sem comparar `empresa_id` do alvo com o do caller, e sem exigir `platform_admin`/`isPlatformSuperAdmin` (que já existe e é usado corretamente em `empresas.ts`). Há log de auditoria (`logAudit`), mas nenhum bloqueio.

- **Impacto em produção**: qualquer ADMIN de qualquer empresa-cliente gera um JWT válido de qualquer usuário de qualquer outra empresa, herdando `empresa_id`/role/permissões reais do alvo.
- **Reprodução**: como ADMIN da empresa A, `POST /api/auth/impersonate {"userId": <id de usuário da empresa B>}` → token retornado tem `empresa_id` de B.
- **Teste ausente**: integração garantindo 403 quando `target.empresa_id !== caller.empresaId` e caller não é `platform_admin`.
- **Recomendação**: **backlog priorizado com decisão de produto** — não é patch de uma linha porque é preciso decidir se impersonação deve virar exclusiva de `platform_admin`/`support_elevated` (via `lib/rbac/platform-access.ts`, já testado) ou se hoje algum fluxo de suporte legítimo depende do comportamento atual. **NÃO APLICAR SEM APROVAÇÃO.**

### BUG-AIRTRUST-002 — CRÍTICO — `admin-usuarios.ts`: ADMIN gerencia usuários de outros tenants em 7 endpoints
**Arquivo**: `worker-airtrust/src/routes/admin-usuarios.ts` — `GET /:id` (~L302), `PUT /:id` (L531-544), `DELETE /:id` (~L642), `POST /:id/invite` (~L701), `GET/PUT /:id/permissoes` (L779, L830-843)
**Categoria**: RBAC/multi-tenant

```ts
if (callerRole !== 'ADMINISTRADOR' && callerRole !== 'ADMIN') {
  const vinculo = await db.prepare(
    `SELECT 1 FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?`
  ).bind(id, empresaId).first();
  if (!vinculo) throw forbidden('Usuário não pertence à sua empresa', 'WRONG_TENANT');
}
```
A checagem de vínculo tenant é pulada explicitamente quando o caller é ADMIN — mesma causa raiz do 001.
- **Impacto**: ADMIN da empresa A pode ver, editar, desativar e reescrever `permissoes` de usuário da empresa B.
- **Reprodução**: `PUT /api/admin/usuarios/<id de B>` como ADMIN de A → sem 403.
- **Teste ausente**: idem 001, por endpoint (7 testes).
- **Recomendação**: **backlog** — replicar o padrão `isPlatformSuperAdmin` já usado em `empresas.ts`; validar antes se algum fluxo de suporte depende do bypass atual. **NÃO APLICAR SEM APROVAÇÃO.**

### BUG-AIRTRUST-003 — CRÍTICO — `PUT`/`DELETE /api/frms/escalas/:id` sem verificação de tenant
**Arquivo**: `worker-airtrust/src/routes/frms.ts:3680-3722`; `worker-airtrust/src/lib/frms/db-service-escalas.ts:84-159`
**Categoria**: RBAC/multi-tenant, FRMS

`frms_escala_quinzenal` não tem coluna `empresa_id` própria (só via `tripulante_id → funcionarios.empresa_id`). `POST /escalas` e `GET /escalas/:tripulante_id` chamam `assertTripulanteEmpresa` corretamente; `PUT`/`DELETE` por `:id` não chamam — diferente de todos os outros pares PUT/DELETE do mesmo arquivo (jornadas, alertas), que usam `assertJornadaEmpresa`/`assertAlertaEmpresa`.
- **Impacto**: qualquer usuário autenticado de qualquer empresa altera ou apaga (soft-delete) a escala quinzenal de um tripulante de outra empresa, conhecendo o `id` (UUID). Corrompe `dia_periodo_embarcado`/ciclo embarcado, que alimenta o cálculo de fadiga.
- **Reprodução**: `PUT /api/frms/escalas/{id de escala da empresa B}` como usuário da empresa A → sem 403.
- **Teste ausente**: tenant-isolation para essas 2 rotas (existe para as demais do módulo).
- **Recomendação**: **backlog** — buscar `tripulante_id` da escala antes de mutar e chamar `assertTripulanteEmpresa`, igual ao padrão já usado no DELETE de jornadas. Patch é trivial em forma, mas toca dado regulatório de escala. **NÃO APLICAR SEM APROVAÇÃO.**

### BUG-AIRTRUST-004 — CRÍTICO — Upload FIRA cai em `empresa_id='1'` quando funcionário não resolve
**Arquivo**: `worker-airtrust/src/routes/frms-fira.ts:68-75` (upload) e `:137-144` (upload-lote)
**Categoria**: RBAC/multi-tenant, FRMS

```ts
const empresaId = operadorRow?.empresa_id ? String(operadorRow.empresa_id) : '1';
```
Todas as outras ~10 rotas do arquivo usam `getEmpresaIdSafe(c)` (tenant do JWT). Só estas 2 rotas re-derivam `empresaId` via lookup em `funcionarios` por `operadorId`, caindo em `'1'` (empresa real de produção) quando o vínculo funcionário não resolve (userId sem `funcionarios` vinculado, ou `deleted_at`/inativo).
- **Impacto**: dados FIRA (horas de voo) gravados em R2 e casados por CANAC contra a Empresa 1, mesmo vindos de usuário de outra empresa.
- **Reprodução**: usuário sem linha ativa em `funcionarios` (ex. admin puro) chama `POST /api/frms/importacao/fira/upload` → `empresaId` resolve para `'1'` silenciosamente.
- **Teste ausente**: `operadorRow` nulo/vazio nessas 2 rotas.
- **Recomendação**: **backlog** — trocar fallback por `getEmpresaIdSafe(c)` com 403 se indefinido. **NÃO APLICAR SEM APROVAÇÃO** (fluxo regulatório de horas de voo).

### BUG-AIRTRUST-005 — CRÍTICO — Override de permissão em `localStorage` global, sem tenant, nunca limpo
**Arquivo**: `src/react-app/hooks/usePermissions.ts:80-106`; escrito por `src/react-app/pages/admin/UsuariosPage.tsx:179-198`
**Categoria**: Cache/estado, RBAC

`airtrust_perfis_custom` é uma chave `localStorage` sem `empresaId`/`userId`, lida por `usePermissions().can(...)` — o gate de autorização real usado por `<Gate permission="...">` no frontend. Nunca é removida por `AuthContext.logout()`, `selectEmpresa()`, ou pelo fluxo de impersonação.
- **Impacto**: customização de permissão feita por um admin da Empresa A persiste no navegador e é lida (sem guarda de tenant) se o mesmo navegador depois logar como usuário da Empresa B — controla o que a UI mostra/permite independente do tenant real logado. Mitigado parcialmente pelo fato de o backend reforçar RBAC independentemente (risco é de superfície/UX, não de dado cru), mas é exatamente a classe de bug pedida nesta auditoria.
- **Reprodução**: customizar permissão de GESTOR como admin da Empresa A → logar como GESTOR da Empresa B sem limpar localStorage → `can()` retorna a customização da A.
- **Teste ausente**: nenhum teste cobre `resolveRolePermissions` combinado com logout/selectEmpresa/impersonação.
- **Recomendação**: **patch elegível, com teste** — namespacing da chave por `empresaId` (padrão já correto em `useTablePreferences.ts`) OU limpar a chave dentro de `logout()`/`selectEmpresa()`. Local, reversível, não toca RBAC do backend. Ainda assim, como envolve o mecanismo de autorização client-side, recomendo aprovação explícita antes de aplicar.

### BUG-AIRTRUST-006 — CRÍTICO — Conclusão via xAPI/H5P gera qualificação sem checar nota de aprovação
**Arquivo**: `worker-airtrust/src/routes/lms-progresso.ts:270-360`
**Categoria**: LMS/SCORM

```ts
const shouldConcluir = isCompletion && (resultSuccess || resultCompletion || isPassedVerb(verbId) || ...);
if (shouldConcluir && matricula.gerar_qualificacao_ao_concluir === 1 && matricula.qualificacao_tipo_id) {
  const historicoId = await createLmsQualificationOnCompletion({...});
```
Zero referências a `masteryScore`/`scorm_mastery_score` neste caminho — diferente do caminho SCORM `cmi.core` (`lms-matriculas.ts:547-570`, que já tem `isScormSuccess()`/`meetsMasteryScore` desde o incidente de 27/06). `createLmsQualificationOnCompletion` não valida nada por conta própria.
- **Cadeia confirmada**: `LmsPlayerH5p.tsx:212-247` repassa eventos xAPI do conteúdo H5P **verbatim** para o backend. Um aluno pode forjar/repetir um POST com verbo `completed`/`passed` sem `result.score`, e o backend emite `CONCLUIDO` + qualificação real.
- **Impacto**: qualificação regulatória falsa — mesmo padrão do incidente EFB M12 (score 0/2 → CONCLUIDO), agora pela via H5P.
- **Teste ausente**: integração para `/xapi/statements` garantindo respeito ao `scorm_mastery_score` do curso.
- **Recomendação**: **NÃO APLICAR SEM APROVAÇÃO** — exigir `result.score >= scorm_mastery_score` (quando definido) antes de `shouldConcluir`, espelhando `isScormSuccess`. Prioridade equivalente ao incidente original antes de qualquer novo upload de curso H5P com `gerar_qualificacao_ao_concluir=1`.

### BUG-AIRTRUST-007 — CRÍTICO — Leitura de ficha ignora o gate de disponibilidade que a escrita respeita
**Arquivo**: `worker-airtrust/src/routes/simuladores-fichas.ts:481` (`GET /fichas/:id`) e `:781` (`POST /fichas/:id/pdf`)
**Categoria**: Simuladores/Fichas/PDF

`getFichaAvailabilityFromDb()` é chamado em 4 endpoints de escrita, mas não nestes 2 de leitura. O gate no frontend é só client-side (desabilita botão). Um usuário autenticado pode chamar a API diretamente e ler/exportar a ficha antes da data da sessão.
- **Impacto**: antecipação de nota/resultado de avaliação antes da data oficial.
- **Teste ausente**: gate de disponibilidade em `GET` e em `POST /pdf` (só existe para os 4 endpoints de escrita).
- **Recomendação**: **patch elegível** — replicar a chamada a `getFichaAvailabilityFromDb` nesses 2 endpoints. Trivial e local, mas recomendo confirmar a regra de negócio exata (vale para todos os perfis ou só não-full-access) antes de aplicar.

### BUG-AIRTRUST-008 — CRÍTICO — `getQualificacoesVencimentoExpr` fabrica vencimento de 12 meses ("sem vencimento" vira vencimento)
**Arquivo**: `worker-airtrust/src/utils/qualificacoes-alerta-config.ts:44-51`, usado em `qualificacoes-alertas.ts:80,217`, `dashboard.ts:71`, `alertas.ts:515`, `dashboardService.ts:220,438`, `escala-mensal-integrada.ts:727`
**Categoria**: Qualificações — violação do invariante `NULL = sem vencimento`

```sql
COALESCE(qh.data_vencimento,
  CASE WHEN qh.data_conclusao IS NOT NULL
    THEN date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')
    ELSE NULL END)
```
Quando `data_vencimento`, `validade_meses` E `qt.validade` são todos NULL (caso legítimo de "sem vencimento"), a expressão finge vencimento em 12 meses — contradizendo o comentário já existente em `qualificacoes/historico.ts:417-418` que documenta explicitamente a ausência desse fallback como correção anterior.
- **Impacto**: qualificação sem validade fixa aparece em dashboard/alertas/escala como "vencendo em 12 meses" — pode gerar alerta falso de vencimento para habilitação permanente.
- **Reprodução (read-only)**: `SELECT qh.id FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id WHERE qh.data_vencimento IS NULL AND qh.validade_meses IS NULL AND qt.validade IS NULL AND qh.deleted_at IS NULL;`
- **Recomendação**: **NÃO APLICAR SEM APROVAÇÃO** — dado regulatório, requer validar com o usuário quais tipos realmente não têm validade antes de mudar o comportamento de 6+ call sites.

### BUG-AIRTRUST-009 — CRÍTICO — Mesmo fallback de 12 meses no score de compliance (`dashboardService.ts`)
**Arquivo**: `worker-airtrust/src/services/dashboardService.ts:616,624,673`
**Categoria**: Qualificações

```sql
WHEN date(qh.data_conclusao, '+' || COALESCE(qt.validade, 12) || ' months') >= date('now') THEN 1
```
`getComplianceScore` ignora `data_vencimento`/`validade_meses` reais e recalcula só a partir de `qt.validade`, caindo em 12 meses. É o KPI "% compliance" do dashboard principal.
- **Recomendação**: **NÃO APLICAR SEM APROVAÇÃO** — mesmo tratamento do 008.

### BUG-AIRTRUST-010 — CRÍTICO — `historico-write.ts` grava (persiste) validade fabricada de 12 meses
**Arquivo**: `worker-airtrust/src/routes/qualificacoes/historico-write.ts:311` (`POST /historico/:id/renovar`) e `:600` (`POST /historico` manual)
**Categoria**: Qualificações — mais grave que 008/009 por persistir, não só exibir

```ts
let validadeMeses = original.hist_validade_meses || original.tipo_validade || 12;   // linha 311
const validade_meses = tipo.validade || 12;                                        // linha 600
```
Contraste: o handler PATCH do mesmo arquivo (L953/969/1187) usa `??` corretamente. Estas 2 rotas usam `||`, tratando `0`/`null`/`undefined` igual, gravando `12` quando o tipo genuinamente não tem validade.
- **Impacto**: renovar ou cadastrar manualmente uma qualificação "sem vencimento" grava `data_vencimento` real (falso) no histórico — dado incorreto persistido, possivelmente já existente em produção.
- **Recomendação**: **NÃO APLICAR SEM APROVAÇÃO** — pode exigir backfill de correção para dados já gravados incorretamente; requer decisão explícita do usuário antes de qualquer mudança.

### BUG-AIRTRUST-011 — CRÍTICO — `npm run build` não faz type-check nenhum (no-op silencioso)
**Arquivo**: `package.json:99` (`"build": "... && tsc --noEmit false"`); `tsconfig.json` (raiz, `"files": [], "references": [...]`)
**Categoria**: Deploy/CI — TypeScript/runtime

Confirmado empiricamente por esta auditoria (não apenas pelo subagente): `npx tsc --noEmit --listFilesOnly` retorna **zero arquivos**. Um `tsc` invocado sem `-b` ignora `references`, e com `files: []` não há nada para compilar. `ci.yml`, `pr-check.yml` e `demo-data-prevention.yml` chamam `npm run build`, todos afetados.

**Verificação adicional feita nesta auditoria**: ao forçar o check real via `tsc -p tsconfig.app.json --noEmit` (cache `.tsbuildinfo` limpo para descartar falso-positivo de cache):
- 4 arquivos reportam erro de sintaxe: `Header.tsx`, `EditarFicha.tsx`, `LogsViewer.tsx`, `PDFGenerator.tsx`.
- **Confirmado via grep de importadores**: `LogsViewer.tsx` e `PDFGenerator.tsx` (`simuladores/components/`) não são importados por nada — código morto. `EditarFicha.tsx` também não é importado (o único "hit" era o nome de uma função não relacionada, `handleEditarFicha`, falso positivo de busca) — também código morto.
- `Header.tsx` **é** importado ativamente (`Layout.tsx`) e o `vite build` (esbuild) real compila o projeto inteiro **sem nenhum erro** — incluindo este arquivo. Ou seja, há uma divergência real entre o que `tsc` reporta para este arquivo específico e o que o pipeline de build de fato produz. Não consegui, dentro do escopo desta auditoria, isolar a causa exata (bisecção completa do arquivo não concluída) — **fica como item de investigação aberta**, não como bug confirmado no app em produção (a evidência de que o app builda e roda contradiz a teoria de sintaxe quebrada).
- Ao tentar checar o worker via `tsc -p worker-airtrust/tsconfig.worker.json --noEmit`, o comando falha imediatamente com `error TS5103: Invalid value for '--ignoreDeprecations'` (valor `"6.0"` não é reconhecido pela versão instalada, TypeScript 5.8.3) — **nenhum arquivo do worker chega a ser checado**, nem mesmo tentando corrigir ingenuamente o comando do zero.

**Impacto em produção**: merges para `main` podem conter erros de tipo reais (contratos frontend/backend quebrados, campos renomeados, nulls não tratados) sem qualquer rede de segurança — o `vite build` usa esbuild, que transpila sem verificar tipos.
**Recomendação**: **patch elegível, sem tocar deploy/produção** — separar `typecheck` explícito (`tsc -p tsconfig.app.json --noEmit` + corrigir `ignoreDeprecations` em `tsconfig.worker.json` + `tsc -p tsconfig.worker.json --noEmit`) e adicionar como step de CI. Antes de ligar esse gate, é preciso decidir o destino dos 3 arquivos mortos confirmados (deletar ou corrigir) e investigar a anomalia do `Header.tsx`, senão o novo gate quebra imediatamente no primeiro PR.

---

## Achados ALTO (resumo tabular — evidência completa nos relatórios dos subagentes)

| ID | Achado | Arquivo | Módulo |
|---|---|---|---|
| ALTO-06 | 2 implementações de `requireRole` — uma delas morta e incompatível com a hierarquia documentada, mas não importada por nenhuma rota | `middleware/auth.ts:415-440` vs `middleware/rbac.ts:47-73` | RBAC |
| ALTO-07 | Fluxo de impersonação não chama `queryClient.clear()` como logout/selectEmpresa — funciona hoje só por acidente (reload completo) | `Configuracoes/Usuarios.tsx:292-332` | Frontend cache |
| ALTO-08 | Falha silenciosa ao enviar statement xAPI no player H5P — sem retry/toast/estado de erro | `LmsPlayerH5p.tsx:235-247` | LMS |
| ALTO-09 | `POST /fichas/:id/pdf` sem checagem de ownership — qualquer aluno/instrutor baixa PDF de ficha de outro colaborador no mesmo tenant | `simuladores-fichas.ts:781-1004` | Simuladores |
| ALTO-10 | Dois renderizadores de PDF (jsPDF client vs pdf-lib server) sincronizados manualmente — causa-raiz confirmada dos 5 commits recentes de ajuste de layout | `pdf-ficha-client.ts` vs `pdf-ficha.service.ts` | Simuladores |
| ALTO-11a | `compliance.ts`/`ficha360.ts` não reconhecem grafia legada `CANCELADO`, enquanto `historico.ts`/`matriz-treinamento.ts` reconhecem — mesma classe do fix 122f0d34 | `compliance.ts:325`, `ficha360.ts:627,662` | Qualificações |
| ALTO-11b | `qualificacoes-alertas.ts` não filtra nenhum status cancelado e usa `MAX(id)` em vez de data para achar "registro atual" | `qualificacoes-alertas.ts:95-124,224-251` | Qualificações |
| ALTO-11c | 2 implementações divergentes de limite mensal de fadiga (canônica vs hardcoded só-exibição) — hoje concordam por coincidência de seed | `calculos.ts:733` vs `fadiga-acumulada-legal.ts:6-11,86-87` | FRMS |
| ALTO-12 | Modelo de sessão pode ser criado/usado com menos de 18 técnicas obrigatórias, sem validação | `simuladores-modelos.ts:857-1113` | Simuladores |
| ALTO-13 | 5 implementações independentes de "qual é o registro vigente" no domínio de qualificações (historico/compliance/ficha360/matriz-treinamento/alertas) | múltiplos arquivos | Qualificações |
| ALTO-19 | Migrations 0418/0419 duplicadas fora do allowlist; arquivos `_rollback.sql` residem no mesmo dir aplicado automaticamente pelo `wrangler d1 migrations apply` (sem down-migration nativa) | `worker-airtrust/migrations/0418*`, `0419*` | Deploy |
| ALTO-20 | `post-deploy-verify.sh` morto, aponta para domínios antigos, tem bug de bash (`local` fora de função) | `post-deploy-verify.sh` | Deploy |

---

## Achados MÉDIO (resumo)

| ID | Achado | Módulo |
|---|---|---|
| MÉDIO-14 | Chaves `localStorage` de filtro/coluna sem `empresaId` em ~7 telas (Funcionarios, Sgso, tabelas) — busca do Sgso pode vazar texto entre tenants | Frontend cache |
| MÉDIO-15 | Infra de `tenantQueryKey`/`queryKeys` existe mas não é usada em nenhum dos 314 `queryKey` reais — proteção real é só o `queryClient.clear()` bruto | Frontend cache |
| MÉDIO-16 | Thumbnail de curso LMS vaza entre tenants (sem `empresa_id` na query) | `lms-assets.ts:704-737` |
| MÉDIO-17 | Token de asset LMS não é revogado no logout (rotas públicas não checam blocklist) | `lms-assets.ts` |
| MÉDIO-18 | `observacoes_gerais` escapa do filtro anti-vazamento de metadados internos em ambos renderizadores de PDF | `pdf-ficha-client.ts:1073`, `pdf-ficha.service.ts:665` |
| MÉDIO-21 | `pr-check.yml` trata lint como não-bloqueante (mitigado por redundância com `lint.yml`) | Deploy/CI |
| MÉDIO-22 | `scripts/audit-dangerous-ops.sh` (guard de operações perigosas) existe mas não é chamado por CI nem `npm run lint` | Deploy/CI |
| MÉDIO-23 | Badge de status de licença usa dois thresholds diferentes (60d vs 30d) em duas seções da mesma página | `FichaFuncionarioPage.tsx:1058,1101` |
| MÉDIO-24 | `estatisticas.ts` não soma corretamente quando `data_vencimento` é NULL (linha "some" fica incompleta) — sem evidência de consumo no frontend hoje | `qualificacoes/estatisticas.ts:57-71,99-123` |

## Achados BAIXO / positivos confirmados (sem ação necessária)

- Certificados/anexos (`qualificacoes-certificados*.ts`): revisão completa, sem IDOR — `empresa_id` + ownership (`employee-sector-access.ts`) aplicados em todas as rotas de leitura/escrita/delete. Único endpoint público (`/certificados/validar`) minimiza PII corretamente (CPF mascarado, sem link de download).
- `deploy-airtrust.yml`: bem gateado — só `workflow_dispatch`, exige strings de confirmação literais, valida `expected_sha`, `concurrency` sem deploy concorrente, smoke pós-deploy autenticado real (não só `/health`).
- `ENABLE_DEV_AUTH_BYPASS`: guard fail-closed confirmado, sem bypass possível mesmo com `ENVIRONMENT` indefinido.
- SIGVOOS: memória anterior de "shadow/NO-GO" está **desatualizada** — commit `809ba57e` (05/06/2026) tornou SIGVOOS fonte canônica intencional e documentada, corrigindo um bug real de contaminação por linhas FIRA. Não é uma falha de gate.
- FRMS: atenuadores de aclimatação/repouso/ciclo embarcado confirmados presentes e somados no cálculo acumulado.
- LMS: `suspend_data`/resume sólido (guardas anti-regressão confirmadas); reprovação de módulo não força reinício de curso inteiro; cache React Query com invalidação completa nas mutações revisadas; sem divergência camelCase/snake_case.
- Simuladores: assinaturas aluno/instrutor/examinador corretas (sem mixup), TRIP A/B/AB sempre por campo explícito (nunca por índice), isolamento de tenant OK nas rotas de fichas revisadas.

---

## 4. Regressões prováveis (padrão "fix não propagado")

Esta auditoria confirma que o padrão mais recorrente de bug nesta base de código **não é** "um bug isolado por módulo" — é fix aplicado em uma cópia de uma lógica duplicada, sem propagar para as cópias irmãs:

1. **NOTECHS: catálogo vs teste** — commit `93486633` ("remove NOTECHS category dividers — codes are self-categorizing") mudou os códigos do catálogo de `NOTECHS-01..15` para `NOTECHS-COO-01` etc., mas **não atualizou** `worker-airtrust/src/__tests__/constants/notechs.test.ts`, que ainda espera o formato antigo (`/^NOTECHS-\d{2}$/`, literal `'NOTECHS-01'`). **Confirmado via `git show HEAD:...`** que isso já está quebrado no `main` committado — não é efeito das alterações não commitadas desta sessão (que são só reformatação Prettier, sem mudança de conteúdo, verificado linha a linha). Está silenciosamente invisível porque `npm run test:worker` **não roda em nenhum workflow de CI** (confirmado — só `test:run`, frontend, roda em `test.yml`).
2. **Qualificações: "registro vigente"** — 5 implementações independentes (historico.ts, compliance.ts, ficha360.ts, matriz-treinamento.ts, qualificacoes-alertas.ts), cada uma com sua própria regra de "qual linha representa o estado atual". O fix de 122f0d34 (RENOVADA excluída antes do `ROW_NUMBER()`) não foi replicado em todas — ALTO-11a confirma que `compliance.ts`/`ficha360.ts` ainda não reconhecem a grafia legada `CANCELADO` que `historico.ts` já trata.
3. **PDF: dois renderizadores** — `pdf-ficha-client.ts` (jsPDF, o que a UI realmente usa) e `pdf-ficha.service.ts` (pdf-lib, rota server-side que a UI não chama) são editados manualmente em conjunto a cada ajuste de layout — confirmado via `git show --stat` dos últimos 3 commits, que tocaram os dois arquivos na mesma alteração. É a causa-raiz direta de por que essa área acumulou 5 commits de ajuste fino em sequência.
4. **FRMS: limite mensal** — `calculos.ts` (canônico) vs `fadiga-acumulada-legal.ts` (hardcoded, só exibição) concordam hoje só porque o valor seed (90h) coincide com a constante fixa; mudar a configuração via rota de limites quebra a paridade silenciosamente.
5. **RBAC: ADMIN tratado como plataforma** — o erro conceitual "ADMIN é per-empresa, não plataforma" foi cometido em `auth.ts` (impersonate) e `admin-usuarios.ts` de forma independente, enquanto o padrão correto (`isPlatformSuperAdmin`) já existe e está em produção em `empresas.ts`/`empresas-usuarios.ts` desde antes.

Todos os 5 casos acima seguem o mesmo formato: **existe uma implementação de referência correta em algum lugar do código, e o achado é sempre "outro lugar não a segue".** Isso sugere que o backlog de maior alavancagem não é corrigir cada achado isoladamente, mas consolidar essas 5 famílias de lógica duplicada em helpers compartilhados.

---

## 5. Testes obrigatórios a criar

### Unit
- `worker-airtrust/src/__tests__/constants/notechs.test.ts` — **atualizar** (não criar) os 2 testes que ainda esperam `NOTECHS-01..15`; alinhar com `NOTECHS-COO-01` etc. (previne regressão #1 da Seção 4).
- `worker-airtrust/src/__tests__/utils/qualificacoes-alerta-config.test.ts` (novo) — cenário: `data_vencimento`/`validade_meses`/`qt.validade` todos NULL → resultado deve ser NULL/"sem vencimento", nunca `data_conclusao + 12m` (previne BUG-008/009).
- `worker-airtrust/src/__tests__/lib/frms/fadiga-acumulada-legal.test.ts` (novo) — cenário: `HV_MES_HORAS` configurado ≠ 90 → `pct_voo_mes` (exibição) deve bater com `pct_limite_mes_calendario` (canônico) (previne ALTO-11c).

### Integration
- `worker-airtrust/src/__tests__/routes/auth-impersonate-tenant.test.ts` (novo) — ADMIN da empresa A tentando impersonar usuário da empresa B → espera 403 (previne BUG-001).
- `worker-airtrust/src/__tests__/routes/admin-usuarios-tenant.test.ts` (novo) — 7 cenários (um por endpoint) de ADMIN de A operando sobre usuário de B → espera 403 (previne BUG-002).
- `worker-airtrust/src/__tests__/routes/frms-escalas-tenant.test.ts` (novo) — PUT/DELETE de escala de tripulante de outra empresa → espera 403 (previne BUG-003).
- `worker-airtrust/src/__tests__/routes/frms-fira-tenant.test.ts` (novo) — upload FIRA com `operadorId` sem vínculo `funcionarios` → espera 403, nunca fallback silencioso (previne BUG-004).
- `worker-airtrust/src/__tests__/routes/lms-xapi-mastery-score.test.ts` (novo) — POST de statement xAPI `completed`/`passed` sem `result.score` (ou score < mastery) → não deve gerar qualificação (previne BUG-006).
- `worker-airtrust/src/__tests__/routes/simuladores-fichas-availability-read.test.ts` (novo) — GET/POST-pdf de ficha antes da data de disponibilidade → mesma resposta de bloqueio que os 4 endpoints de escrita (previne BUG-007).
- `worker-airtrust/src/__tests__/routes/simuladores-fichas-ownership-pdf.test.ts` (novo) — aluno/instrutor tentando baixar PDF de ficha de outro colaborador no mesmo tenant → 403 (previne ALTO-09).
- `worker-airtrust/src/__tests__/routes/lms-assets-thumbnail-tenant.test.ts` (novo) — thumbnail de curso de outra empresa → 404 (previne MÉDIO-16).

### E2E
- Fluxo "impersonar usuário" a partir da tela de Configurações/Usuários, verificando que a lista de usuários elegíveis já vem filtrada por tenant no frontend (defesa em profundidade, não substitui o fix de backend).
- Fluxo "trocar de empresa" verificando que `airtrust_perfis_custom` e as chaves de filtro/coluna listadas em MÉDIO-14 não sobrevivem à troca (previne BUG-005).

### Smoke staging
- Repetir os 8 testes de integração acima contra staging autenticado, com 2 tenants de teste reais.

### Smoke produção (read-only)
- Query read-only (já no padrão usado para achar os 109 falsos positivos de RENOVADA) contando quantas qualificações com `data_vencimento IS NULL AND validade_meses IS NULL AND qt.validade IS NULL` existem hoje em produção — necessário para dimensionar o impacto real de BUG-008/009/010 antes de decidir o fix.
- Query read-only contando registros `frms_escala_quinzenal` cujo `funcionarios.empresa_id` não bate com o esperado (se essa checagem já foi burlada antes desta auditoria).

### Guard scripts
- Estender `scripts/check-duplicate-migrations.mjs` para varrer o repositório completo (não só o diff contra `origin/main`) — hoje ficou "cego" retroativamente para 0418/0419 porque já foram mergeados antes da checagem rodar (previne ALTO-19 se repetir).
- Novo guard: nenhum arquivo `*_rollback.sql` deve residir em `worker-airtrust/migrations/` (path varrido por `wrangler d1 migrations apply`) — deveria ficar em `scripts/rollbacks/` ou equivalente, aplicável só manualmente.
- Adicionar `guard:duplicate-migrations` (já existe) + um novo `ops:guard` (já existe como script, só falta ser chamado) à cadeia de `npm run lint` (previne MÉDIO-22 voltar a ser esquecido).

---

## 6. Patches seguros propostos

Nenhum patch foi aplicado nesta auditoria. Candidatos avaliados contra as regras duras do pedido original (não toca produção/migration/DML; não altera RBAC/tenant/contrato público/fluxo regulatório sem teste; diff pequeno; reversível; tem teste ou guard):

| Candidato | Atende todos os critérios? | Decisão |
|---|---|---|
| Adicionar `.catch` com toast/retry no player H5P (ALTO-08) | Sim — não toca regra de negócio, só UX | **Elegível para patch-now**, mediante aprovação de escopo |
| Sanitizar `observacoes_gerais` nos 2 renderizadores de PDF (MÉDIO-18) | Sim — mesma função `sanitizeForPdf` já usada em todos os outros campos | **Elegível para patch-now**, mediante aprovação de escopo |
| Adicionar `empresa_id` na query de thumbnail LMS (MÉDIO-16) | Quase — é trivial e local, mas *altera fluxo multiempresa*, exige teste cross-tenant antes | **Elegível só com o teste incluso no mesmo PR** |
| Adicionar gate de disponibilidade em `GET /fichas/:id` / `POST /fichas/:id/pdf` (BUG-007) | Quase — trivial, mas é regra de negócio regulatória (data de liberação de nota) | **Requer confirmação da regra exata antes de aplicar** |
| Corrigir fallback de 12 meses (BUG-008/009/010) | **Não** — dado regulatório, pode exigir backfill de dados já gravados incorretamente | **NÃO APLICAR SEM APROVAÇÃO** |
| Corrigir tenant check em impersonate/admin-usuarios/frms-escalas/frms-fira (BUG-001/002/003/004) | **Não** — RBAC/tenant sem teste de matriz de permissões ainda escrito | **NÃO APLICAR SEM APROVAÇÃO** |
| Separar `typecheck` real em CI (BUG-011) | Não ainda — quebraria CI imediatamente por causa dos 3 arquivos mortos + anomalia do Header.tsx não resolvida | **Backlog**: resolver os arquivos mortos primeiro, depois ligar o gate |

Nenhum desses foi implementado nesta rodada — a entrega desta fase é o relatório. Ver Seção 9 para o prompt de correção sugerido.

---

## 7. Plano de fechamento

**Ordem recomendada:**

1. **PR de segurança isolado, urgente** — BUG-001 + BUG-002 (RBAC cross-tenant em impersonação e admin-usuarios). Requer: decisão de produto sobre o papel de `platform_admin` na impersonação, testes de matriz de permissões completos, revisão de qualquer fluxo de suporte que dependa do comportamento atual. **Exige staging + smoke autenticado por perfil antes de produção.**
2. **PR de segurança separado** — BUG-003 + BUG-004 (FRMS tenant gaps). Mesma exigência de teste de matriz de tenant antes de aplicar.
3. **PR de dados regulatórios, com validação prévia em produção (read-only)** — BUG-008/009/010 (fallback de 12 meses). **Rodar primeiro** a query de smoke produção read-only da Seção 5 para dimensionar quantos registros já foram afetados, decidir com o usuário se backfill é necessário, só then corrigir os 3 pontos de leitura/escrita juntos (para não deixar leitura e escrita divergentes entre si).
4. **PR de LMS, com aprovação regulatória** — BUG-006 (gate de nota no caminho xAPI/H5P), mesma prioridade do incidente de 27/06.
5. **PR de Simuladores** — BUG-007 (gate de disponibilidade em leitura) + ALTO-09 (ownership no PDF) podem ir juntos, mesmo módulo, mesma exigência de teste.
6. **PR de cache/frontend, patch simples** — BUG-005 (namespacing/limpeza do `airtrust_perfis_custom`) + ALTO-07 (queryClient.clear() na impersonação) + MÉDIO-14 (demais chaves localStorage). Pode ser separado do resto por não depender de nenhuma decisão regulatória.
7. **PR de higiene de CI, sem risco de produção** — BUG-011 (separar typecheck real), MÉDIO-21/22 (lint bloqueante, wire do `audit-dangerous-ops.sh`), após resolver os 3 arquivos mortos e investigar a anomalia do Header.tsx.
8. **Backlog, sem prazo de produção** — ALTO-10 (unificar os 2 renderers de PDF), ALTO-13 (consolidar as 5 implementações de "registro vigente"), ALTO-11c (FRMS limite mensal), MÉDIO-15 (adotar `tenantQueryKey` de verdade), MÉDIO-23/24.

**O que exige staging**: itens 1, 2, 4 (qualquer mudança de RBAC, tenant ou qualificação regulatória).
**O que exige backup/rollback explícito**: item 3, caso backfill de dados seja necessário.
**O que exige smoke autenticado por perfil**: itens 1, 2, 3, 4, 5 — todos envolvem controle de acesso ou dado que aparece diferente por perfil.
**O que pode ser feito sem staging formal** (mas ainda com PR revisado): itens 6 e 7.

---

## 8. Comandos executados e evidências

Todos read-only/locais, nenhum contra produção ou remoto:

```bash
git status --short / git branch --show-current / git rev-parse HEAD / origin/main / git log -5 --oneline
npm run lint            # PASS — todos os 6 guards (URL, tracked-secrets, auth-boundaries, empresa-default1, duplicate-migrations, operational-sql-sources)
npx tsc --noEmit         # "PASS" mas confirmado NO-OP (0 arquivos) — ver BUG-011
npx tsc --noEmit --listFilesOnly   # confirma 0 arquivos listados
npx tsc -p tsconfig.app.json --noEmit     # 16 erros reais em 4 arquivos (3 confirmados código morto)
npx tsc -p tsconfig.worker.json --noEmit  # falha imediata: TS5103 invalid --ignoreDeprecations
npx tsc -b tsconfig.json --dry            # confirma que os 3 projetos referenciados existem e seriam buildados por -b
npx vite build           # sucesso completo, sem erros — usado para checar se os 4 arquivos com erro de tsc são de fato inertes
npm run test:run         # 1 falha / 1223 passando (129 arquivos) — ficha-pdf-itens-no-truncation.test.ts
npm run test:worker      # 19 falhas / 1787 passando (11 arquivos) — ver lista completa na Seção 4
find worker-airtrust/migrations -maxdepth 1 -name "*.sql" | sed -E 's#.*/([0-9]{4}).*#\1#' | sort | uniq -d   # 32 prefixos duplicados
grep -RIn "empresa_id.*1\b|DEFAULT 1" ...   # hits só em migrations históricas/comentários, nada em runtime
grep -RIn "wrangler d1.*--remote|git add -A|ENABLE_DEV_AUTH_BYPASS|VITE_DEV_PROXY_TARGET" ...
git show HEAD:worker-airtrust/src/constants/notechs.ts / .../notechs.test.ts   # confirma drift pré-existente em main
grep -rn "test:worker" .github/workflows/*.yml   # confirma: nenhum workflow roda test:worker
```

7 subagentes especializados rodaram em paralelo (RBAC/tenant, Qualificações/Certificados, LMS/SCORM, Simuladores/Fichas/PDF, FRMS/Escalas/SIGVOOS, Frontend cache/estado, Deploy/Migrations/Ops), cada um lendo os arquivos do seu módulo e reportando achados com arquivo+linha. Duas tentativas (RBAC e FRMS) esgotaram o limite de uso da sessão na primeira rodada e foram re-executadas com sucesso após o reset.

**Limitações**: não foi possível consultar o estado real do D1 de produção (ex.: quantas migrations 0418/0419 já foram aplicadas, quantos registros de qualificação têm o NULL triplo do BUG-008) — essas verificações ficam como smoke de produção read-only pendente (Seção 5), a serem rodadas manualmente pelo usuário ou com autorização explícita.

---

## 9. Próximo prompt recomendado para correção segura

```
Você vai corrigir, um PR por vez, os achados do relatório docs/analysis/auditoria_preventiva_bugs_airtrust_20260707.md,
seguindo exatamente a ordem da Seção 7 (Plano de fechamento). Para cada PR:
1. Implemente SÓ o achado daquele PR, sem tocar código não relacionado.
2. Escreva o teste listado na Seção 5 correspondente ANTES do fix (red), depois corrija (green).
3. Rode `npm run test:worker` (ou test:run) e `npm run lint` localmente antes de considerar pronto.
4. Se o achado envolve RBAC, tenant, dado regulatório ou migration, PARE e peça confirmação explícita
   do usuário sobre a regra de negócio correta antes de escrever o fix — não assuma.
5. Não faça deploy, não rode migration remota, não toque produção.
6. Ao final de cada PR, atualize a Seção 6 do relatório indicando "fixed"/"skipped"/"no_change_needed".
Comece pelo PR 1 (BUG-001 + BUG-002, RBAC cross-tenant) e pare para revisão antes de prosseguir ao PR 2.
```

## Checklist antes de qualquer merge
- [ ] Teste novo (Seção 5) escrito e passando para o achado específico
- [ ] `npm run lint` e `npx tsc -p tsconfig.app.json --noEmit` / `-p tsconfig.worker.json --noEmit` (após corrigir `ignoreDeprecations`) limpos
- [ ] Nenhuma mudança fora do escopo do achado (diff mínimo)
- [ ] Se RBAC/tenant/regulatório: aprovação explícita do usuário registrada na thread do PR
- [ ] Se migration: rollback documentado fora de `worker-airtrust/migrations/`

## Checklist antes de qualquer deploy
- [ ] Todos os PRs de segurança (itens 1-2 do plano) mergeados e testados em staging com 2 tenants reais
- [ ] Smoke autenticado por perfil rodado em staging
- [ ] `expected_sha` do `workflow_dispatch` confere com o commit revisado
- [ ] Nenhuma migration pendente sem rollback documentado fora do path de auto-apply
- [ ] Confirmar que `run_migrations`/`deploy_worker`/`deploy_pages` foram todos disparados na MESMA execução do workflow (evita divergência de SHA entre Worker e Pages)

## NO-GO automático se:
- Qualquer achado CRÍTICO de RBAC/tenant (001-004) ainda não corrigido e testado
- Backfill de dados do BUG-008/009/010 não tiver sido dimensionado via query read-only antes do fix
- `npm run test:worker` continuar não rodando em nenhum workflow de CI (19 falhas atuais são invisíveis)
- Migration nova sem rollback fora do path auto-aplicado
- Worker e Pages disparados em execuções separadas do `workflow_dispatch` (risco de SHA divergente)
