# AIRTRUST — System Health Audit (2026-05)

Data da auditoria: 2026-05-25  
Repositório: `/Users/filipedaumas/SAAS/Airtrust`  
Escopo: Auditoria read-only (sem patch funcional)

## 1. Sumário executivo

Esta fase foi executada como auditoria técnica **read-only**, sem deploy, sem push, sem migration e sem escrita em banco.

Principais conclusões:

- Há **riscos P0 de integridade multi-tenant** em fluxos de manutenção/importação que podem afetar dados de mais de uma empresa.
- Há **rotas legadas de correção massiva** expostas em runtime que merecem isolamento operacional mais forte.
- Build e testes principais passam, mas há inconsistência de tipagem no worker tsconfig dedicado.
- O repositório contém acúmulo técnico relevante (migrations duplicadas, artefatos gerados rastreados, rotas/páginas legadas), exigindo saneamento faseado.

Resumo de severidade desta auditoria:

- P0: 3
- P1: 5
- P2: 10
- P3: 4

## 2. Estado do repositório

Estado coletado no início/fim da auditoria:

- Branch: `main`
- HEAD local: `438f9f13f8a5bfb1d8744ac4f7592fd66019d35f`
- `origin/main`: `438f9f13f8a5bfb1d8744ac4f7592fd66019d35f`
- Divergência (`origin/main...HEAD`): `0 ahead / 0 behind`

Árvore local já estava suja antes da auditoria (22 arquivos modificados + untracked prévios). Esta auditoria preservou esse estado e adicionou apenas:

- `scripts/validation/audit-endpoint-matrix.mjs` (script read-only auxiliar)
- `docs/AIRTRUST_SYSTEM_HEALTH_AUDIT_2026_05.md` (este relatório)

Achados de inventário:

- Arquivos rastreados: `4686`
- Arquivos `.sql`: `689`
- Migrações/arquivos em `worker-airtrust/migrations`: alto volume, com prefixos duplicados
- Diretórios grandes: `worker-airtrust/`, `Arquivos - EAD/`, `scripts/`, `_arquivos_nao_usados/`, `docs/`
- Artefatos gerados rastreados detectados: `playwright-report/*`, `.wrangler-dry/index.js.map`, `worker-airtrust/.tmp-worker-bundle/*`

## 3. Resultado de build/testes

Comandos executados:

- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run test:worker` ✅ (409 testes)
- `npm run lint` ✅
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` ❌

Falha de tipagem do worker:

- `worker-airtrust/src/routes/simuladores-shared.ts:522`
- Retorno ausente de `bloqueadasDataPassada` no objeto retornado.

## 4. Mapa de rotas e APIs

Foi criado script de inventário read-only:

- `scripts/validation/audit-endpoint-matrix.mjs`

Resumo do inventário automático:

- Backend: 535 paths únicos detectados
- Frontend: 60 paths `/api/*` únicos detectados
- Calls frontend sem endpoint backend correspondente (8)

### Matriz priorizada (backend x frontend x status)

| Endpoint | Método | Consumidor frontend | Auth/role | Status |
|---|---|---|---|---|
| `/api/system/info` | GET | `src/react-app/pages/Sistema.tsx:47` | n/a | **Frontend chama endpoint inexistente** |
| `/api/simuladores/equipamentos` | GET/POST/PUT/DELETE | `src/react-app/pages/simuladores/cadastros/equipamentos/index.tsx:52,70,71,118` | global auth | **Divergente** (`/api/simuladores` é o namespace atual) |
| `/api/qualificacoes-list` | GET | `src/client/hooks/useQualificacoes.ts:76,92` | n/a | **Sem backend aparente (hook legado)** |
| `/api/qualificacoes/importar-json` | POST | `src/react-app/components/common/ImportarUniversal.tsx:42-45` | n/a | **Sem backend aparente** |
| `/api/auditoria-logs/stats` | GET | `src/react-app/hooks/useAuditoria.ts:79` | n/a | **Sem backend aparente** |
| `/api/templates-airtrust-brazilian-dates/certificacoes/csv` | GET | `src/react-app/components/shared/ImportarCertificacoes.tsx` | n/a | **Sem backend aparente** |
| `/api/templates-airtrust-brazilian-dates/certificacoes/xlsx` | GET | `src/react-app/components/shared/ImportarCertificacoes.tsx` | n/a | **Sem backend aparente** |
| `/api/qualificacoes-historico/deduplicate` | POST | sem consumidor frontend | auth global (sem role dedicado) | **Ativo, mutação sensível, sem isolamento por empresa** |

Observação: inventário automático foi complementado com validação manual nos fluxos críticos para reduzir falso positivo de sub-routers aninhados.

## 5. Auditoria dos fluxos críticos

### A) Simuladores / sessões / qualificações planejadas

- Estrutura de rotas modular e com testes relevantes (`simuladores-planejadas-edit-session.test.ts`).
- Gap de tipagem em `simuladores-shared.ts` (worker tsc dedicado falha).
- Há telas/arquivos legados em frontend simuladores com endpoints divergentes (ex.: `/api/simuladores/equipamentos`).

Risco principal: inconsistência entre frontend legado e rotas atuais + dívida de tipagem.

### B) FRMS / fadiga

- FRMS possui cobertura de endpoints extensa e middleware global de auth+tenant em `/api/*`.
- Risco crítico em sincronização SIGVOOS/FRMS com limpeza global por padrão (detalhado em P0-01).
- Risco funcional de RBAC por normalização de role divergente (detalhado em P1-01).

### C) EVD / Escala Diária

- Fluxo de publicação diária (`POST /api/evd/publicacoes`) executa validações operacionais robustas.
- `PUT /api/evd/:id` permite atualização direta de campos críticos sem reaplicar o mesmo conjunto de validações operacionais de criação/publicação.

Risco principal: edição posterior pode introduzir estado operacional inválido sem bloqueio.

### D) SIGVOOS / integrações

- Endpoint de manutenção tem proteção adicional por secret e host local.
- Fluxo principal de sync usa `clearExisting` default `true`; limpeza é global e sem filtro por `empresa_id`.

Risco principal: perda/contaminação de dados FRMS entre empresas.

### E) Auth / usuários / tenant

- Há middleware global em `/api/*` com exceções públicas explícitas (`worker-airtrust/src/index.ts:243-275`).
- Arquitetura de auth usa duas camadas RBAC (`middleware/auth.ts` e `middleware/rbac.ts`) com semântica diferente.
- `requireRole` de `auth.ts` faz comparação literal e não harmoniza com role normalizada PT-BR.

Risco principal: falhas de autorização por inconsistência de implementação.

## 6. Banco / schema / migrations

Sem executar migrations; apenas leitura de arquivos.

Achados:

- Migrations com alto acúmulo e numeração duplicada (ex.: `0092` aparece 9 vezes; múltiplos `0062`, `0063`, `0068`, etc.).
- Arquivo `.bkp` dentro da pasta de migrations (`0020_simuladores_final.sql.bkp`).
- Exemplo de constraints/índices relevantes detectados:
  - `ux_funcionarios_cpf` e `ux_qualificacoes_tipos_codigo` em `0116_add_unique_constraints.sql`
  - `UNIQUE (curso_id, funcionario_id, empresa_id)` em `0336_lms_matriculas.sql`
- Forte presença de padrão soft-delete (`deleted_at`) em múltiplos domínios.

Risco principal: histórico de migração difícil de auditar linearmente e suscetível a conflitos operacionais.

## 7. Segurança / permissões

Achados principais:

- Endpoint de deduplicação com mutação massiva sem filtro por tenant (P0).
- Fluxo SIGVOOS->FRMS com limpeza global de dados multi-tenant por padrão (P0).
- Material sensível/versionado: dumps SQL e arquivos `.env.*` rastreados (risco operacional/LGPD).

Arquivos candidatos sensíveis rastreados incluem:

- `.env.local.production`, `.env.production`, `src/.env.production`, `.env.test`
- `scripts/legacy/d1-prod-20260315-193839.sql`
- `scripts/seed-local.sql`

## 8. UI/UX funcional

Achados relevantes:

- Menu contém item `/sistema` (`src/react-app/components/OptimizedMainSidebar.tsx:95`) sem rota evidente no `App.tsx`.
- Página `Sistema` usa `/api/system/info` inexistente (`src/react-app/pages/Sistema.tsx:47`).
- Tela de equipamentos simuladores usa namespace legado `/api/simuladores/equipamentos` (`src/react-app/pages/simuladores/cadastros/equipamentos/index.tsx:52`).
- `src/components/qualificacoes/NovaQualificacaoModal.tsx` usa host hardcoded externo e não tem consumidor aparente.

Risco UX: usuário pode navegar/acionar telas que aparentam salvar, mas estão desacopladas do backend atual.

## 9. Observabilidade e operação

Pontos positivos:

- `GET /api/health`, `GET /api/version`, `GET /api/docs` disponíveis.
- Logging presente em pontos de integração críticos.

Pontos de atenção:

- Trechos com fallback silencioso para sucesso podem mascarar falhas operacionais (ex.: `/api/sessoes` retorna `success: true` com lista vazia em erro, `worker-airtrust/src/index.ts:1070-1079`).
- Excesso de rotas legadas dificulta rastreio rápido de fluxo ativo vs legado.

## 10. Performance e manutenção

Sinais de dívida técnica:

- Diretório de migrations muito grande e com duplicidades de versão.
- Artefatos gerados rastreados em Git.
- Dependências desatualizadas em volume alto (`npm outdated --depth=0`).
- Sobreposição de camadas de API/frontend (hooks e serviços legados coexistindo).

## 11. Obsoletos / duplicados / limpeza (classificação)

| Categoria | Caminho (exemplo) | Evidência | Risco de remover | Recomendação |
|---|---|---|---|---|
| Essencial | `worker-airtrust/src/index.ts` | Entrypoint de rotas | Alto | Não mexer sem plano |
| Provavelmente essencial | `worker-airtrust/src/routes/frms.ts` | Fluxo FRMS ativo | Alto | Mudança apenas via patch dedicado |
| Duplicado aparente | `worker-airtrust/migrations/0092_*` | múltiplos chunks com mesmo prefixo | Médio | Revisão manual de linearização |
| Obsoleto aparente | `src/client/hooks/useQualificacoes.ts` | export quebrado + endpoint ausente | Baixo/Médio | Isolar e remover em fase de limpeza |
| Gerado/cache/build | `playwright-report/*`, `.wrangler-dry/*`, `.tmp-worker-bundle/*` | artefatos de execução | Baixo | parar de rastrear + limpeza controlada |
| Local/dev-only | dumps em `scripts/legacy/*.sql` | dados sensíveis e volume | Alto | mover para storage seguro fora do repo |
| Precisa investigação humana | `src/react-app/pages/simuladores/cadastros/equipamentos/index.tsx` | `@ts-nocheck` + endpoints legados | Médio | confirmar uso real antes de alterar |
| Candidato a archive | `src/components/qualificacoes/NovaQualificacaoModal.tsx` | sem consumidores + host hardcoded | Baixo | validar ausência de uso e arquivar/remover |

Comandos sugeridos (não executados):

- `git ls-files | rg 'playwright-report|\.wrangler-dry|\.tmp-worker-bundle'`
- `git ls-files | rg 'scripts/legacy/.*\.sql|seed-local\.sql'`
- `rg -n 'NovaQualificacaoModal|useQualificacoes' src`

## 12. Bugs potenciais priorizados (P0–P3)

### P0-01 — Sync SIGVOOS pode limpar dados FRMS de múltiplas empresas

- Evidência:
  - `worker-airtrust/src/services/sigvoos-frms.ts:2456` (`input.clearExisting ?? true`)
  - `worker-airtrust/src/services/sigvoos-frms.ts:1974-2026` (`clearExistingFiraData` sem filtro por `empresa_id`)
- Impacto: perda/corrupção multi-tenant de dados de jornada/alerta/importação
- Probabilidade: alta (default atual)
- Verificação: inspeção estática do fluxo `/api/integracoes/sigvoos/sincronizar-frms`
- Proposta: default `clearExisting=false` + limpeza estritamente por tenant/escopo de importação
- Risco da correção: médio (precisa preservar idempotência do reprocessamento)
- Teste recomendado: integração multi-tenant com dois `empresa_id` e assert de isolamento

### P0-02 — Endpoint deduplicate faz soft-delete global sem isolamento por empresa

- Evidência:
  - mount em `worker-airtrust/src/index.ts:1094`
  - mutação em `worker-airtrust/src/routes/deduplicate.ts:20-104` sem `empresa_id` em filtros
- Impacto: exclusão lógica indevida de histórico de outras empresas
- Probabilidade: média/alta (rota ativa)
- Verificação: inspeção estática das queries
- Proposta: restringir por role admin + filtro obrigatório por tenant + dry-run obrigatório
- Risco da correção: baixo/médio
- Teste recomendado: teste de contrato com duas empresas e dedup limitado por tenant

### P0-03 — Dados sensíveis e dumps SQL rastreados no repositório

- Evidência:
  - `scripts/legacy/d1-prod-20260315-193839.sql`
  - `scripts/seed-local.sql`
  - arquivos `.env.*` rastreados
- Impacto: risco LGPD/segurança e vazamento operacional
- Probabilidade: média
- Verificação: inventário `git ls-files`
- Proposta: política de segregação de dados sensíveis fora do Git + rotação de segredos
- Risco da correção: baixo (operacional)
- Teste recomendado: pipeline de guard para bloquear arquivos sensíveis

### P1-01 — Inconsistência RBAC: `auth.requireRole` vs roles normalizadas

- Evidência:
  - normalização para `GESTOR` em `worker-airtrust/src/middleware/auth.ts:31-50`
  - comparação literal em `worker-airtrust/src/middleware/auth.ts:429-449`
  - uso `requireRole('manager')` em `worker-airtrust/src/routes/frms-fadiga-checkin.ts:1417,1480,1524`
- Impacto: bloqueio indevido de usuários gestores
- Probabilidade: média
- Proposta: unificar checagem com `middleware/rbac.ts` ou normalização compatível
- Teste recomendado: matriz de perfis `ADMIN/GESTOR/USUARIO` por endpoint FRMS

### P1-02 — Edição EVD pode burlar validações operacionais

- Evidência:
  - `PUT /api/evd/:id` em `worker-airtrust/src/routes/escalas-evd.ts:1546-1621`
  - validações robustas concentradas em criação/publicação (`:1210-1335`)
- Impacto: inconsistência operacional em escala diária
- Probabilidade: média
- Proposta: reaplicar validações críticas no PUT ou bloquear alteração de campos sensíveis após publicação
- Teste recomendado: cenário de edição com tripulante duplicado/repouso insuficiente

### P1-03 — Worker tsconfig dedicado falha em tipagem

- Evidência:
  - retorno incompleto em `worker-airtrust/src/routes/simuladores-shared.ts:522`
- Impacto: regressão de qualidade e risco de drift semântico
- Probabilidade: alta (reprodutível)
- Proposta: alinhar retorno com contrato tipado
- Teste recomendado: `npx tsc -p worker-airtrust/tsconfig.json --noEmit` no CI

### P1-04 — Navegação/tela de sistema inconsistente

- Evidência:
  - menu `/sistema` em `src/react-app/components/OptimizedMainSidebar.tsx:95`
  - chamada `/api/system/info` em `src/react-app/pages/Sistema.tsx:47` (endpoint inexistente)
- Impacto: funcionalidade quebrada/percepção de instabilidade
- Probabilidade: alta
- Proposta: alinhar rota frontend + endpoint real (`/api/version` + `/api/health`)
- Teste recomendado: smoke de navegação e health card

### P1-05 — Tela de equipamentos usa contrato de API legado

- Evidência:
  - `src/react-app/pages/simuladores/cadastros/equipamentos/index.tsx:52,70,71,118`
  - backend atual expõe equipamentos no namespace `/api/simuladores` (`worker-airtrust/src/routes/simuladores-equipamentos.ts`)
- Impacto: CRUD potencialmente quebrado
- Probabilidade: média
- Proposta: migrar calls para contrato atual
- Teste recomendado: CRUD E2E da tela

### P2-01 — Hook legado de qualificações referencia endpoint não existente

- Evidência: `src/client/hooks/useQualificacoes.ts:3,76,92`
- Impacto: confusão e manutenção difícil
- Proposta: descontinuar ou corrigir para hooks atuais em `src/react-app/hooks/*`

### P2-02 — Componente de qualificações com host hardcoded e sem consumidor

- Evidência: `src/components/qualificacoes/NovaQualificacaoModal.tsx:96,101,164`
- Impacto: risco de uso acidental fora de ambiente
- Proposta: remover/arquivar após validação de não uso

### P2-03 — Migrations com numeração duplicada e arquivos backup internos

- Evidência: duplicidades (`0092`, `0062`, `0063`, etc.) e `.bkp` em pasta de migrations
- Impacto: auditoria/replay de schema mais frágil
- Proposta: plano de consolidação documental antes de qualquer cleanup

### P2-04 — Artefatos gerados versionados

- Evidência: `playwright-report/*`, `.wrangler-dry/*`, `worker-airtrust/.tmp-worker-bundle/*`
- Impacto: ruído no Git e aumento de risco operacional
- Proposta: limpeza segura faseada + enforce em CI

### P2-05 — Cobertura de testes insuficiente em EVD

- Evidência: ausência de testes `evd` em `worker-airtrust/src/__tests__/routes`
- Impacto: risco de regressão em fluxo operacional crítico
- Proposta: suíte mínima de criação/edição/publicação EVD

### P2-06 — Fallback de sucesso em erro de sessão pode ocultar falha

- Evidência: `worker-airtrust/src/index.ts:1070-1079`
- Impacto: diagnóstico mais difícil
- Proposta: retornar código/flag de degradação explícito

### P2-07 a P2-10

- Endpoints de importação/templates legados sem backend aparente (`/api/qualificacoes/importar-json`, `/api/templates-airtrust-brazilian-dates/*`)
- Hook de auditoria em namespace legado (`/api/auditoria-logs/*`)
- Acoplamento de telas antigas sem rota ativa
- Sobreposição de módulos com semântica próxima (aumenta custo de mudança)

### P3 (otimização/baixa prioridade)

- Dependências desatualizadas em grande volume (`npm outdated --depth=0`)
- Comentários/trechos deprecated/legacy espalhados
- Heterogeneidade de padrões de API client no frontend
- Acúmulo documental histórico sem índice único de referência

## 13. Recomendações por fase

### Fase A — Correções P0/P1 críticas (sem “big bang”)

1. Isolar deduplicate e sync SIGVOOS com hard-guard de tenant + role + dry-run.
2. Corrigir inconsciência de RBAC em `auth.requireRole`.
3. Endereçar divergências de endpoint nas telas críticas (`Sistema`, `Equipamentos`).
4. Corrigir erro de tipagem no worker dedicado.

### Fase B — Testes de regressão

1. Testes multi-tenant para deduplicate e sync SIGVOOS.
2. Testes EVD (create/update/publicação + justificativa).
3. Testes RBAC por perfil (admin/gestor/usuário).

### Fase C — Limpeza segura

1. Classificar e retirar artefatos gerados do controle de versão.
2. Tratar hooks/componentes legados sem consumidor.
3. Planejar consolidação documental/migrations duplicadas (sem reescrever histórico às cegas).

### Fase D — Performance e manutenção

1. Plano de atualização de dependências por blocos (sem major jump em lote).
2. Padronização progressiva de API client/frontend.
3. Fortalecer observabilidade em fluxos com fallback silencioso.

## 14. Próximos prompts sugeridos

1. `Gerar patch mínimo para P0-01 (SIGVOOS clearExisting por tenant) com testes.`
2. `Gerar patch mínimo para P0-02 (deduplicate com tenant + role + dry-run).`
3. `Gerar testes EVD para PUT/publicação cobrindo regras operacionais.`
4. `Gerar patch de unificação RBAC entre middleware/auth.ts e middleware/rbac.ts.`
5. `Gerar plano de limpeza segura para artefatos versionados (sem remover nada automaticamente).`

## Follow-up H2 — P0-01 SIGVOOS/FRMS tenant guard

- Status antes:
  - `syncSigvoosForFrms` aplicava `clearExisting` com default efetivo `true`.
  - `clearExistingFiraData` executava soft-delete sem escopo de `empresa_id`, com risco multi-tenant.
- Patch aplicado:
  - `clearExisting` agora é opt-in explícito (`true` apenas quando informado).
  - limpeza passou a exigir `empresa_id` válido (`SIGVOOS_CLEAR_EXISTING_REQUIRES_EMPRESA_ID` em modo fail-closed).
  - limpeza foi restrita por tenant em `frms_jornada`, `frms_alerta`, `frms_fatorizacao_jornada`, `horas_voo_lancamentos`, `frms_jornada_pendente` e escopo condicionado em `frms_importacao_fira`.
  - logs de execução passaram a registrar o escopo de tenant quando houver limpeza.
- Testes adicionados:
  - `shouldClearExistingSigvoosData`: garante default sem limpeza.
  - `requireClearExistingEmpresaId`: bloqueia limpeza sem tenant explícito.
  - `clearExistingFiraDataForEmpresa`: valida SQL/binds com escopo por empresa.
- Validações:
  - `npx tsc --noEmit`: ok.
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: falha pré-existente em `worker-airtrust/src/routes/simuladores-shared.ts:522` (fora de escopo deste patch).
  - `npm run build`: ok.
  - `npm run test:worker`: ok (inclui testes novos do guard).
- Pendências:
  - corrigir o erro dedicado de tipagem em `simuladores-shared.ts:522` na fase A2.

## Follow-up H4 — P0-02 deduplicate tenant/dry-run guard

- Status antes:
  - rota de deduplicate sem proteção de auth/role no próprio módulo;
  - execução de mutação por padrão no `POST /api/qualificacoes-historico/deduplicate`;
  - consultas e soft-delete sem escopo obrigatório de `empresa_id`.
- Patch aplicado:
  - `auth() + requireRole('admin')` aplicado no router de deduplicate (fail-closed para não-admin).
  - deduplicate agora opera em `dry_run` por padrão.
  - modo `apply` só com confirmação explícita (`apply=true` ou `dryRun=false`).
  - `empresa_id` autenticado tornou-se obrigatório para qualquer execução (incluindo apply), com erro `EMPRESA_ID_REQUIRED` quando ausente/inválido.
  - todas as queries críticas (grupos, registros e soft-delete) receberam filtro `empresa_id`.
  - resposta agora é auditável com `mode`, `empresa_id`, totais e grupos/IDs candidatos.
- Regras de segurança efetivas:
  - sem role suficiente: `403`;
  - sem tenant confiável: `400`;
  - sem apply explícito: sem escrita;
  - apply não toca dados de outros tenants.
- Testes adicionados:
  - `worker-airtrust/src/__tests__/routes/deduplicate.test.ts` cobrindo:
    - dry-run default sem writes;
    - apply com tenant A sem tocar tenant B;
    - apply sem tenant válido retorna erro;
    - usuário sem role admin retorna `403`;
    - verificação de presença de filtro tenant nos SQLs críticos.
- Validações:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok.
  - `npx tsc --noEmit`: ok.
  - `npm run build`: ok.
  - `npm run test:worker`: ok.
- Pendências:
  - avançar para P0-03 (sensíveis/dumps) em modo auditoria + guardrail, sem remoção automática.

## Follow-up H5 — P0-03 sensitive files guardrail

- Status antes:
  - presença de `.env*` rastreados e dumps SQL legados no repositório;
  - ausência de guardrail dedicado para bloquear novos sensíveis rastreados.
- Patch aplicado:
  - script read-only `scripts/validation/audit-sensitive-files.sh` para inventário/classificação por caminho;
  - `exit 1` quando houver categorias bloqueantes (`SECRET_ENV`, `PROD_DUMP_OR_BACKUP`, `LOCAL_SEED`, `UNKNOWN_REVIEW_REQUIRED`);
  - allowlist explícita para `MIGRATION` e `TEST_FIXTURE`;
  - reforço preventivo em `.gitignore` para credenciais e dumps SQL locais/legados sem esconder `worker-airtrust/migrations/*`.
- Resultado do inventário (sem leitura de conteúdo):
  - `SECRET_ENV`: 4
  - `PROD_DUMP_OR_BACKUP`: 92
  - `LOCAL_SEED`: 17
  - `TEST_FIXTURE`: 2
  - `MIGRATION`: 355
  - `UNKNOWN_REVIEW_REQUIRED`: 231
  - total bloqueante: 344 (guardrail retorna fail até remediação controlada).
- Validações:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok.
  - `npx tsc --noEmit`: ok.
  - `npm run build`: ok.
  - `npm run test:worker`: ok.
- Pendências:
  - fase separada para `git rm --cached` autorizado de sensíveis/dumps;
  - rotação de segredos se necessário;
  - eventual estratégia de limpeza de histórico somente com autorização explícita.

## Follow-up H6-A — tracked env files untracked from index

- Escopo:
  - remoção do index apenas de arquivos `.env*` sensíveis rastreados;
  - sem remoção local de arquivos;
  - sem alteração em dumps SQL.
- Caminhos removidos do index:
  - `.env.local.production`
  - `.env.production`
  - `.env.test`
  - `src/.env.production`
- Verificações:
  - presença local dos 4 caminhos confirmada após `git rm --cached`;
  - nenhum conteúdo de segredo exibido em logs/relatório.
- Guardrail após H6-A:
  - `SECRET_ENV`: 0 (antes: 4)
  - bloqueantes totais: 340 (antes: 344)
  - `PROD_DUMP_OR_BACKUP`, `LOCAL_SEED` e `UNKNOWN_REVIEW_REQUIRED` permanecem fora de escopo desta fase.
- Validações:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok.
  - `npx tsc --noEmit`: ok.
  - `npm run build`: ok.
  - `npm run test:worker`: ok.

## Follow-up H7 — P1-01 RBAC role normalization

- Risco antes:
  - coexistência de dois caminhos de RBAC:
    - `requireRole` em `middleware/auth.ts` com comparação literal;
    - `requireRole` em `middleware/rbac.ts` com normalização PT/EN.
  - rotas FRMS e mounts administrativos ainda importavam `requireRole` do `auth.ts`, criando risco de bloqueio indevido para aliases (`GESTOR`/`manager`, `ADMINISTRADOR`/`admin`).
- Patch aplicado:
  - roteamento de autorização consolidado para `middleware/rbac.ts` (normalizado) nos pontos críticos:
    - `worker-airtrust/src/index.ts`
    - `worker-airtrust/src/routes/frms.ts`
    - `worker-airtrust/src/routes/frms-fira.ts`
    - `worker-airtrust/src/routes/frms-fadiga-checkin.ts`
    - `worker-airtrust/src/routes/frms-relatorios-config.ts`
    - `worker-airtrust/src/routes/fix-renovadas.ts`
    - `worker-airtrust/src/routes/compliance-recalculate.ts`
  - `auth()` permaneceu inalterado; a mudança foi apenas no middleware de comparação de role.
- Matriz de aliases efetiva (H7):
  - `ADMIN`/`admin`/`administrador` → `admin`
  - `GESTOR`/`manager` → `manager`
  - `USUARIO`/`user`/`aluno` → `user`
  - role ausente/desconhecida → bloqueado (fail-closed)
- Testes adicionados:
  - `worker-airtrust/src/__tests__/rbac-middleware-normalization.test.ts`
  - cobertura de:
    - `GESTOR` aceito em `requireRole('manager')`;
    - `manager` aceito em `requireRole('manager')`;
    - `USUARIO` bloqueado em `requireRole('manager')`;
    - `GESTOR` bloqueado em `requireRole('admin')`;
    - `ADMIN`/`admin` aceitos em `requireRole('admin')`;
    - role ausente/desconhecida bloqueada.
- Validações:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok.
  - `npx tsc --noEmit`: ok.
  - `npm run build`: ok.
  - `npm run test:worker`: ok.
- Pendências:
  - `middleware/auth.ts` ainda contém export legado de `requireRole`; pode ser tratado em hardening futuro para evitar regressão por import acidental.

## Follow-up H8 — P1-02 EVD PUT operational validation guard

- Risco antes:
  - `PUT /api/evd/:id` atualizava campos operacionais críticos sem reaplicar validações de conflito/disponibilidade.
  - `repouso_minimo_ok` não era recalculado no PUT, permitindo estado inconsistente após edição.
  - EVD já publicada podia sofrer alteração crítica sem novo bloqueio operacional equivalente ao fluxo de publicação.
- Patch aplicado:
  - criação de schema dedicado de update (`evdUpdateSchema`) para validar payload do PUT.
  - PUT agora monta estado final candidato (merge `existing + payload`) antes de persistir.
  - reaplicação de validações críticas no PUT quando houver mudança operacional:
    - `PIC != SIC`;
    - conflito de tripulação/horário (`hasCrewConflict`);
    - bloqueios operacionais (via `collectOperationalWarningsAndBlocks`).
  - recalcula `repouso_anterior_minutos` e `repouso_minimo_ok` no PUT quando há mudança relevante.
  - em EVD `PUBLICADA`, alteração crítica que resulte em repouso inválido agora é bloqueada.
  - em EVD `PUBLICADA`, quando revisão operacional exige justificativa, PUT bloqueia sem justificativa estruturada/observação mínima.
- Validações reaplicadas no PUT:
  - conflito operacional de tripulante em janela de horário;
  - hard blocks operacionais de disponibilidade/habilitação;
  - integridade de composição PIC/SIC;
  - consistência de repouso mínimo após edição.
- Testes adicionados:
  - `worker-airtrust/src/__tests__/routes/escalas-evd-put.test.ts`
  - cenários:
    - PUT válido continua funcionando;
    - PUT com conflito operacional é bloqueado (`409`);
    - PUT em EVD publicada com repouso inválido é bloqueado (`400`);
    - PUT com PIC/SIC duplicado é bloqueado (`400`);
    - assert de binding por tenant (`empresa_id`) no SELECT/UPDATE.
- Validações:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok.
  - `npx tsc --noEmit`: ok.
  - `npm run build`: ok.
  - `npm run test:worker`: ok.
- Pendências:
  - criar suíte mais ampla de regressão EVD (cenários de publicação diária com múltiplos voos e justificativas FRMS estruturadas).

## Follow-up H9 — P1-04 Sistema page endpoint alignment

- Risco antes:
  - tela `Sistema` consumia `/api/system/info`, endpoint inexistente;
  - menu apontava para `/sistema`, mas a rota não estava registrada no frontend.
- Patch aplicado:
  - `src/react-app/pages/Sistema.tsx` alinhado para consumir endpoints reais:
    - `/api/health` para status/checks do backend;
    - `/api/version` para versão/build/deployment.
  - removida dependência de payload inexistente de `system/info` e ajustado parsing ao contrato real dos endpoints atuais.
  - rota frontend `/sistema` registrada em `App.tsx`, mantendo item de menu existente sem mudanças de navegação ampla.
- Endpoint inexistente removido:
  - chamadas a `/api/system/info` eliminadas da página.
- Endpoints reais usados:
  - `/api/health`
  - `/api/version`
- Validações:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok.
  - `npx tsc --noEmit`: ok.
  - `npm run build`: ok.
  - `npm run test:worker`: ok.
  - `npm run lint`: ok.
- Pendências:
  - opcional: harmonizar também links legados do menu (`/backup`, `/aeronaves`) com rotas efetivamente registradas, em fase separada.

## Follow-up H10 — P1-05 Simuladores Equipamentos API contract alignment

- Risco antes:
  - tela de equipamentos usava contrato legado (`/api/simuladores/equipamentos`) e payload divergente dos campos canônicos de `simuladores`.
  - risco de CRUD quebrado por endpoint inexistente e parsing incompatível.
- Endpoints antigos:
  - `GET /api/simuladores/equipamentos`
  - `POST /api/simuladores/equipamentos`
  - `PUT /api/simuladores/equipamentos/:id`
  - `DELETE /api/simuladores/equipamentos/:id`
- Endpoints finais alinhados:
  - `GET /api/simuladores`
  - `POST /api/simuladores`
  - `PUT /api/simuladores/:id`
  - `DELETE /api/simuladores/:id`
- Patch aplicado:
  - `src/react-app/pages/simuladores/cadastros/equipamentos/index.tsx` ajustado para consumir contrato real do backend.
  - adicionado mapeamento legado -> canônico no envio (`tipo_simulador -> tipo`, `empresa_local/aeronave_base -> localizacao`, `configuracao_tecnica -> observacoes`) e canônico -> legado na leitura.
  - padronizadas chamadas para `apiFetch` e mensagens de erro/sucesso mais explícitas na tela.
- Validações:
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok.
  - `npx tsc --noEmit`: ok.
  - `npm run build`: ok.
  - `npm run test:worker`: ok.
  - `npm run lint`: ok.
- Pendências:
  - `@ts-nocheck` mantido neste arquivo para evitar refatoração ampla fora do escopo do patch de contrato.

## Follow-up H11 — H6-B Sensitive file classification

- Data: 2026-05-25
- Ferramenta/modelo: DeepSeek (inteligencia media)
- Escopo: classificacao read-only de 340 arquivos bloqueantes restantes do guardrail.
- Metodo: apenas metadados (caminhos, nomes, extensoes, tamanhos). Nenhum conteudo lido ou impresso.
- Resultado:
  - 340 arquivos classificados em 4 categorias de acao.
  - 230 candidatos a `git rm --cached` com alta confianca.
  - 85 precisam de revisao humana.
  - 19 mantidos como provaveis validos.
  - 6 marcados como "nao mexer".
- Primeiro lote H6-C: 10 arquivos (3 dumps grandes + 7 token/secret files), todos high confidence.
- Relatorio detalhado: `docs/AIRTRUST_SENSITIVE_FILES_CLASSIFICATION_H6B_v0_4.md`
- Guardrail atualizado em: `docs/AIRTRUST_SENSITIVE_FILES_GUARDRAIL_v0_4.md`
- Validações:
  - `bash scripts/validation/audit-sensitive-files.sh`: fail esperado (340 bloqueantes)
  - `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: ok
  - `npx tsc --noEmit`: ok
  - `npm run build`: ok
- Pendências:
  - aguardar aprovacao para H6-C (remocao controlada do index, lote 1).
  - revisao humana dos 85 arquivos `MANUAL_REVIEW_REQUIRED`.

---

## Apêndice — Comandos principais executados (read-only)

- Estado Git: `git status`, `git branch`, `git rev-parse`, `git diff`, `git rev-list`
- Inventário: `find`, `du`, `git ls-files`, `rg`
- Validação: `npx tsc --noEmit`, `npm run build`, `npm run test:worker`, `npm run lint`, `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- Rotas/chamadas: buscas com `rg` em `worker-airtrust/src` e `src/react-app`
- Auxiliar: `node scripts/validation/audit-endpoint-matrix.mjs`

Sem execução de migration, sem execução de comando de escrita remota, sem deploy.
