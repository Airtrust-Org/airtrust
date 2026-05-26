# AIRTRUST v0.5-H33 — Arquitetura/modularização segura: diagnóstico e plano

Data: 2026-05-26  
Escopo: diagnóstico **read-only** + plano documental (**sem refactor**, sem runtime, sem banco, sem deploy)

## 1. Sumário executivo
O bloco H32 fechou bem a proteção por domínio e elevou o baseline de segurança para modularização incremental. O estado atual permite planejar extrações pequenas e seguras, mas ainda **não** justifica refactor amplo em módulos críticos operacionais.

Conclusão desta fase:
- é viável iniciar H34 com quick wins de extração em pontos de baixo risco (especialmente `index.ts`);
- módulos críticos (FRMS, EVD, importação, auth/tenant) devem continuar congelados para refactor estrutural até cobertura adicional;
- a ordem segura é: extrações de borda e compatibilidade -> aumento de cobertura em áreas críticas -> modularização maior.

## 2. Estado baseline
## 2.1 Git
- Branch: `main`
- HEAD: `589f33e00c50d216b55f3fbb489b436aad3a8cc3`
- `origin/main`: `589f33e00c50d216b55f3fbb489b436aad3a8cc3`
- Divergência: `0/0`
- Alterações locais pré-existentes fora do escopo: presentes e preservadas.

## 2.2 Validações executadas
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅
- `npm run test:worker` ✅ (`483` testes passando)

## 3. Arquivos maiores e concentração de responsabilidade
## 3.1 Top arquivos TS/TSX (amostra)
- `src/react-app/pages/Qualificacoes.tsx` (4854 LOC)
- `worker-airtrust/src/routes/frms.ts` (3232 LOC)
- `worker-airtrust/src/services/sigvoos-frms.ts` (2841 LOC)
- `src/react-app/pages/escalas/EvdPage.tsx` (2640 LOC)
- `worker-airtrust/src/routes/lms-cursos.ts` (2266 LOC)
- `worker-airtrust/src/routes/escalas-alocacoes.ts` (2248 LOC)
- `worker-airtrust/src/routes/escalas-evd.ts` (2039 LOC)
- `worker-airtrust/src/routes/lms-assets.ts` (1931 LOC)

## 3.2 Concentração no entrypoint do worker
`worker-airtrust/src/index.ts` permanece um concentrador relevante:
- 1264 LOC;
- `66` mounts `app.route(...)`;
- `30` usos de `app.use(...)`;
- handlers inline ainda presentes para health/public/system/compatibilidade/fix.

Esse acoplamento aumenta custo de manutenção e risco de regressão cruzada em ajustes de rota/middleware.

## 3.3 Concentração por domínio crítico (worker)
- FRMS: `frms.ts` (3232 LOC, 49 handlers), `frms-fadiga-checkin.ts` (1843 LOC), `frms-fira.ts` (1059 LOC).
- Simuladores: conjunto de rotas soma ~8675 LOC (sessões, fichas, modelos, extras).
- SGSO: conjunto de rotas soma ~4681 LOC (`sgso`, `sgso-kpi`, `sgso-auditorias-ncs`, `sgso-next-gen`, `extra`).
- Importação: `importacao.ts` (1384 LOC) + serviços paralelos/refatorados em `services/importacao/*`.

## 4. Pontos fortes após v0.4-H / v0.5
- baseline técnico verde (`tsc`, `build`, `lint`, `test:worker`);
- cobertura de guards expandida no H32 (backup/admin-migrations, SGSO auditorias/NC, simuladores sessões/fichas, SGSO Next Gen);
- runtime preservado no bloco H32 (tests/docs-only);
- guardrails operacionais de produção já institucionalizados.

## 5. Candidatos seguros a extração
Classificação: **SAFE_EXTRACT_CANDIDATE** (sem mudança de contrato/API).

1. `worker-airtrust/src/index.ts` — extrair rotas públicas/sistema (`/api/public/locale`, `/api/public/translate`, `/api/health`, `/api/status`, `/api/version`) para módulo dedicado.
2. `worker-airtrust/src/index.ts` — extrair rota de compatibilidade `GET /api/historico` para módulo `compat`.
3. `worker-airtrust/src/index.ts` — extrair endpoint legado `/api/templates` (já fail-closed 503) para módulo isolado.
4. `worker-airtrust/src/index.ts` — extrair `POST /api/telemetry/client-error` para rota técnica separada.
5. `worker-airtrust/src/index.ts` — extrair `POST /api/fix/populate-qualificacao-ids` para módulo administrativo explícito (mantendo guard admin).
6. `worker-airtrust/src/index.ts` — consolidar configuração de no-cache por domínio em utilitário declarativo (sem mudar comportamento).
7. `worker-airtrust/src/routes/simuladores-core.ts` — manter como agregador e mover apenas registradores internos de submódulos (já existe fragmentação parcial com `simuladores-shared`).
8. `worker-airtrust/src/routes/sgso-next-gen.ts` + `sgso-next-gen-helpers.ts` — extração incremental por blocos de relato/workflow em arquivos menores, sem alterar contratos.
9. `worker-airtrust/src/routes/sgso-next-gen-extra.ts` — separar subgrupos por recurso (FRAT/MoC/etc.) mantendo mesmo prefixo/mount.
10. `worker-airtrust/src/routes/simuladores-fichas.ts` — extrair handlers de leitura/listagem para arquivo interno dedicado, preservando router e paths atuais.

## 6. Áreas que precisam de mais testes antes
Classificação: **NEEDS_MORE_TESTS_FIRST**.

1. `worker-airtrust/src/routes/frms.ts` (3232 LOC, alta criticidade operacional).
2. `worker-airtrust/src/routes/escalas-evd.ts` (2039 LOC, operação diária crítica).
3. `worker-airtrust/src/routes/importacao.ts` (1384 LOC, escrita sensível + legado).
4. `worker-airtrust/src/routes/lms-cursos.ts` (2266 LOC, múltiplos fluxos de escrita/leitura).
5. `worker-airtrust/src/routes/lms-assets.ts` (1931 LOC, upload/download/renderizações).
6. `worker-airtrust/src/services/sigvoos-frms.ts` (2841 LOC, integração crítica FRMS).
7. `worker-airtrust/src/routes/escalas-alocacoes.ts` (2248 LOC, regra de negócio densa).

Pré-requisito comum:
- ampliar testes de contrato/tenant/fail-closed antes de qualquer extração estrutural.

## 7. Áreas que não devem ser mexidas agora
Classificação: **DO_NOT_TOUCH_NOW**.

1. `worker-airtrust/src/middleware/auth.ts`, `worker-airtrust/src/middleware/tenant.ts`, `worker-airtrust/src/middleware/rbac.ts`.
Motivo: fronteira de segurança e isolamento multi-tenant.

2. `worker-airtrust/src/routes/importacao.ts` e `worker-airtrust/src/services/importacao/*`.
Motivo: fluxo com histórico de sensibilidade operacional e coexistência legado/refactor.

3. `worker-airtrust/src/routes/escalas-evd.ts`, `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts`.
Motivo: operação diária (EVD/escala) crítica para produção.

4. `worker-airtrust/src/routes/frms.ts`, `worker-airtrust/src/routes/frms-fadiga-checkin.ts`, `worker-airtrust/src/services/sigvoos-frms.ts`.
Motivo: FRMS/fadiga/SIGVOOS com impacto de segurança operacional.

5. `scripts/deploy-*`, `scripts/remove-duplicate-build-assets.sh`, guardrails de ops.
Motivo: estabilidade operacional/deploy; fora do escopo desta fase.

## 8. Duplicações e dependências compartilhadas relevantes
## 8.1 Dependências compartilhadas úteis
- `worker-airtrust/src/routes/simuladores-shared.ts` já centraliza regras reutilizadas e é consumido por múltiplas rotas de simuladores.
- `worker-airtrust/src/routes/sgso-next-gen-helpers.ts` já centraliza helpers de SGSO Next Gen.

## 8.2 Sinais de duplicação/legado
- pares paralelos em importação:
  - `FuncionarioImportacao.ts` e `FuncionarioImportacaoRefactored.ts`;
  - `QualificacaoTipoImportacao.ts` e `QualificacaoTipoImportacaoRefactored.ts`.
- endpoints explícitos de compatibilidade/legado em `index.ts` (`/api/templates`, `/api/historico`, fix temporário admin).

Recomendação: tratar limpeza dessas sobreposições somente após cobertura adicional (H35), evitando consolidação prematura.

## 9. Plano de modularização incremental
## H34-A — Quick win 1 (baixo risco)
- alvo: `worker-airtrust/src/index.ts`;
- ação: extrair handlers inline de saúde/público/compatibilidade para módulos de rota dedicados;
- restrição: zero mudança de contrato HTTP, zero mudança de middleware global.

## H34-B — Quick win 2 (baixo risco)
- alvo: `worker-airtrust/src/index.ts` e registradores de simuladores/SGSO;
- ação: separar arquivo de mounts por domínio (`mounts/*.ts`) preservando ordem e paths;
- restrição: sem tocar regras de negócio internas.

## H35 — Testes antes de refactor médio
- foco: FRMS, EVD, importação, LMS cursos/assets;
- ação: ampliar testes de contrato/tenant/fail-open/perf básico;
- gate: somente avançar para H36 com baseline verde e cobertura mínima acordada.

## H36 — Modularização maior (condicional)
- alvo potencial: `frms.ts`, `escalas-evd.ts`, `lms-cursos.ts`, `importacao.ts`;
- abordagem: extração por subdomínio interno em etapas pequenas;
- condição: executar smoke técnico e funcional por etapa, sem deploy até validação completa.

## 10. Critérios de segurança obrigatórios para qualquer refactor
- testes primeiro (baseline + novos testes por contrato/tenant);
- sem alteração de schema/migration nesta trilha;
- sem deploy enquanto houver mudança estrutural sem validação concluída;
- smoke obrigatório se houver mudança de runtime/composição de rotas;
- preservar comportamento fail-closed;
- manter rollback simples (patches pequenos e isolados).

## 11. Recomendação da próxima fase
**Próxima fase sugerida: H34-A (quick win de extração em `index.ts`, estritamente sem mudança de contrato).**

Racional:
- maior ganho de modularidade com menor risco;
- prepara terreno para H35/H36 sem tocar áreas operacionais críticas;
- mantém produção protegida enquanto reduz acoplamento no entrypoint.

## 12. Escopo explicitamente não alterado nesta fase
- runtime (worker/frontend) não alterado;
- nenhum arquivo de rota/serviço/middleware refatorado;
- nenhuma migration criada/aplicada;
- nenhum acesso write em banco;
- nenhum deploy executado.
