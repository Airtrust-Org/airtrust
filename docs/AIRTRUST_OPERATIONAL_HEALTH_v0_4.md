# AIRTRUST_OPERATIONAL_HEALTH_v0_4

## 1) Estado atual do sistema
- Produção operacional e sem incidente ativo.
- Fluxo principal do Dashboard validado em produção.
- Build, TypeScript e suíte de worker estáveis no baseline atual.

## 2) Última versão saudável
- Commit baseline: `3b100843be833649357604241aa39d300c8c17bd`
- APP_VERSION de referência: `2026-05-23T14:08:21Z-3b10084`

## 3) Critérios de saúde
- Verde:
  - `npx tsc --noEmit` OK
  - `npm run build` OK
  - `npm run test:worker` OK
  - Smoke read-only de produção OK
  - Smoke autenticado sem bloqueadores críticos
- Amarelo:
  - Build/TS OK, mas falha parcial de smoke ou degradação perceptível sem erro crítico
- Vermelho:
  - Falha de build/TS/testes críticos, erro 500 essencial, tela branca, ou regressão operacional crítica

## 4) Rotina antes de deploy
1. Executar `bash scripts/preflight-health.sh`.
2. Revisar diff e confirmar escopo controlado.
3. Confirmar ausência de mudança de banco sem autorização explícita.

## 5) Rotina depois de deploy
1. Executar `bash scripts/smoke-production-readonly.sh`.
2. Confirmar APP_VERSION no endpoint `/api/version`.
3. Executar smoke autenticado manual:
   - `docs/AIRTRUST_AUTHENTICATED_SMOKE_CHECKLIST_v0_4.md`

## 6) Checklist manual autenticado
- Referência oficial: `docs/AIRTRUST_AUTHENTICATED_SMOKE_CHECKLIST_v0_4.md`
- O checklist cobre Dashboard, EVD, Simuladores, Fadiga Diária, LMS/EAD e HomePerfil.

## 7) Política de banco/migration
- Não criar/aplicar migration sem autorização explícita.
- Scripts SQL de validação devem ser read-only e classificados como não-migration.
- Não executar scripts SQL em produção sem autorização formal.

## 8) Política de worktree limpo
- Evitar commit com untracked locais não classificados.
- Manter artefatos locais de agentes fora do versionamento quando apropriado.
- Commits pequenos e separados por tema operacional.

## 9) Riscos conhecidos
- Necessidade de Patch 2 backend/payload se lentidão voltar.
- Janela de 90 dias de Simuladores precisa monitoramento operacional contínuo.
- Smoke autenticado ainda depende de execução manual.
- Scripts auxiliares novos devem ser reavaliados periodicamente para evitar drift operacional.
