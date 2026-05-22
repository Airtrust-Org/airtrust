# AIRTRUST v0.4-H1 — Auditoria de organização da raiz

## 1) Estado Git (captura desta fase)
```text
BRANCH
main
STATUS
?? docs/AIRTRUST_ESCALA_DIARIA_AUDIT_AND_DESIGN_v0.4-A.md
?? docs/AIRTRUST_ESCALA_DIARIA_B2A_EVD_RULES_AUDIT.md
?? docs/AIRTRUST_ESCALA_DIARIA_B2D_QUALIFICACAO_DISPONIBILIDADE_AUDIT.md
?? docs/AIRTRUST_ESCALA_DIARIA_B3A_PUBLICACAO_PDF_AUDIT.md
?? docs/AIRTRUST_FRMS_DAILY_FATIGUE_HOME_FIX_v0.3-C.md
?? docs/AIRTRUST_REPOSITORY_HEALTH_AUDIT_v0.3-A.md
?? docs/AIRTRUST_SAFE_REMEDIATION_PLAN_v0.3-B.md
HEADS
d9a74a9d8f92491a3ca5eb1e1eada0178957c6e3
4bf4271793db7e90dcb2013f3f7dfed5799c03b7
AHEAD_BEHIND
0	1
LOG
d9a74a9 (HEAD -> main) fix(escalas): list active company aircraft in daily roster
4bf4271 (origin/main, origin/HEAD) fix(escalas): redesign daily roster around active aircraft
a7bd6a7 fix(escalas): align daily roster UI with aircraft assignment workflow
7752a06 fix(escalas): expose daily roster navigation in schedules module
7a4e509 docs(escalas): add daily roster pre-push review
268654e feat(escalas): add daily roster publication UI and export
4ae9e15 feat(escalas): add versioned daily roster publication
7194742 feat(escalas): validate daily roster qualifications and availability
```
Observação: foi identificado `tracked modified` em `src/react-app/pages/escalas/EvdPage.tsx`; esta fase permaneceu somente em auditoria/documentação, sem mover arquivos.

## 2) Itens ESSENCIAIS — não mover
Total: **36**
- `.dev.vars.example` — Item estrutural essencial para operação ou governança do repositório.
- `.env.example` — Item estrutural essencial para operação ou governança do repositório.
- `.git` — Infraestrutura de versionamento/CI/ambiente de desenvolvimento.
- `.github` — Infraestrutura de versionamento/CI/ambiente de desenvolvimento.
- `.gitignore` — Infraestrutura de versionamento/CI/ambiente de desenvolvimento.
- `.vscode` — Infraestrutura de versionamento/CI/ambiente de desenvolvimento.
- `LICENSE` — Item estrutural essencial para operação ou governança do repositório.
- `README.md` — Item estrutural essencial para operação ou governança do repositório.
- `docs` — Diretório de código/documentação/teste ativo do projeto.
- `e2e` — Diretório de código/documentação/teste ativo do projeto.
- `eslint.config.js` — Configuração de toolchain/build/testes.
- `fixtures` — Diretório de código/documentação/teste ativo do projeto.
- `node_modules` — Dependências locais de desenvolvimento.
- `node_modules.nosync` — Dependências locais de desenvolvimento.
- `openapi.yaml` — Item estrutural essencial para operação ou governança do repositório.
- `package-lock.json` — Manifesto e lockfile essenciais para build/reprodutibilidade.
- `package.json` — Manifesto e lockfile essenciais para build/reprodutibilidade.
- `playwright.config.ts` — Configuração de toolchain/build/testes.
- `postcss.config.js` — Configuração de toolchain/build/testes.
- `public` — Diretório de código/documentação/teste ativo do projeto.
- `scripts` — Diretório de código/documentação/teste ativo do projeto.
- `sql` — Diretório de código/documentação/teste ativo do projeto.
- `src` — Diretório de código/documentação/teste ativo do projeto.
- `tailwind.config.js` — Configuração de toolchain/build/testes.
- `tsconfig.app.json` — Configuração de toolchain/build/testes.
- `tsconfig.escalas.json` — Configuração de toolchain/build/testes.
- `tsconfig.json` — Configuração de toolchain/build/testes.
- `tsconfig.node.json` — Configuração de toolchain/build/testes.
- `tsconfig.worker.json` — Configuração de toolchain/build/testes.
- `vercel.json` — Item estrutural essencial para operação ou governança do repositório.
- `vite.config.ts` — Configuração de toolchain/build/testes.
- `vitest.config.ts` — Configuração de toolchain/build/testes.
- `worker-airtrust` — Diretório de código/documentação/teste ativo do projeto.
- `worker-configuration.d.ts` — Item estrutural essencial para operação ou governança do repositório.
- `worker-frontend` — Diretório de código/documentação/teste ativo do projeto.
- `wrangler-pages.json` — Item estrutural essencial para operação ou governança do repositório.

## 3) Candidatos para `Arquivos/`
Total: **114**
- `AUDITORIA-DUPLICACOES-OBSOLETOS-2026-02-07.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-E2E-ESCALAS-20260305.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-E2E-FINAL-20260305.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-EDAPP-POS-CORRECAO-2026-02-05.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-ESCALAS-20260306.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-ESCALAS-FORENSE-COMPLETA-2026-03-05.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-ESCALAS-MEGA-PROMPT-2026-03-05.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-FINAL-60-60-20260305.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-FIX-DATAS-EDAPP-2026-02-05.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-FRMS-2026-02-26.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-FRMS-FASE1-20260310.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-L3-ESCALAS-2026-03-06.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-LIMPEZA-IMPORTACAO-2026-02-04.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-LMS-INTEGRACAO-MODULOS-2026-04.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-MODALS-SALVAMENTO-2025-01-11.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-ROTAS-BACKEND-2025.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-SCHEMA-D1-2026-03-04.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA-TREINAMENTOS-PLANEJADOS-20260430.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA_PERFORMANCE_10-11-2025.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `AUDITORIA_SEGURANCA_10-11-2025.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `BUG-HUNT-FASE5-ESCALAS-20260607.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `BUG-HUNT-FASE5-FRMS-20260310.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `BUGFIX-FRMS-CARDS-INCONSISTENCIA-20260310.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `BUGFIX-QUALIFICACOES-ICONES-PRODUCAO-20260310.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `BUGS-09-13-CORRIGIDOS.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `BUGS-CORRIGIDOS-20260305.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `CHECKLIST-IMPORTACAO-XLSX-2026-02-04.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `CHECKLIST-POS-DEPLOY.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `CORRECAO-AERONAVES-AGENDAMENTO-2026-01-13.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `CORRECOES-ANTIGRAVITY-ESCALAS-20260307.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `CORRECOES-FINAIS-CERTIFICADOS.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `CORRECOES-FINAIS-ESCALAS-20260307.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `CORRECOES-SISTEMA-CHECKS-2026-01-14.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `DEBUG-IMPORTACAO.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `DEBUG-TEMPLATE-CERTIFICADOS.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIRA - Nery.pdf` — Artefato estático de evidência/saída fora da estrutura principal.
- `FIRA - Ramos.pdf` — Artefato estático de evidência/saída fora da estrutura principal.
- `FIX-DATA-VENCIMENTO-DINAMICA-2026-02-06.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIX-DUPLICATAS-EDAPP-2026-02-05.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIX-EXPLOSAO-REQUESTS-682K.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIX-ICONE-CERTIFICADO-2025-01-14.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIX-MODELO-SESSAO-ID-2026-01-13.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIX-VINCULO-EDAPP-EMAIL-2026-02-06.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIX-VINCULOS-EDAPP-FALTANTES-2026-02-06.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `FIXES-SAVING-AERONAVE-ESCALAS-20260309.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `HOMOLOGACAO-FASE2-ESCALAS-20260308.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `HOMOLOGACAO-FINAL-ESCALAS-20260308.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `HOMOLOGACAO-FINAL-V3-ESCALAS-20260308.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `INTEGRACAO-EDAPP-RESUMO.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `PROVA-CERTIFICADOS-FUNCIONANDO.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `PROVA-DE-VIDA-ESCALAS-20260305.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `PROVA-DEFINITIVA-CERTIFICADOS.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-AUDITORIA-EDAPP-AIRTRUST-2026-02-06.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-AUDITORIA-EDAPP-COMPLETO-2026-02-06.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-AUDITORIA-ESCALAS-20260309.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-AUDITORIA-FRMS-110-20260309.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-COMPLETO-EDAPP-2026-02-05.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-CONSOLIDACAO-DADOS-2026-01-13.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-CORRECAO-ESCALA-MAIO2026.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-CORRECOES-AUDITORIA-2026-03-04.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-FINAL-ESCALAS-20260305.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-FINAL-EXECUCAO-2026-03-05.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-FRMS-OFFSHORE-SLEEP-20260311.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-HOMOLOGACAO-COSTA-DO-SOL-PTO-2026-03-31.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-IMPACTO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-IMPLEMENTACAO-COMPLIANCE-GAPS-2025.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-MODULO-SGSO-2026-03-15.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-PROMPT2-ESCALAS-20260306.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-QA-COMPLEMENTAR-ESCALAS-20260308.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-QA-ESCALAS-20260307-v2.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-REEMISSAO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-TECNICO-COMPLETO.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO-UI-UX-ESCALAS-20260307.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RELATORIO_TECNICO.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RESUMO-CORRECOES-2026-02-06.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RESUMO-EXECUTIVO-EDAPP-2026-02-05.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RESUMO-FINAL-IMPORTACAO.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `RESUMO-SINCRONIZACAO-CLOUDFLARE.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `STATUS-FINAL-CORRECOES-2026-02-07.md` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `TESTE-NOTIFICACOES-EDAPP-2026-02-06.md` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `TESTE-VALIDACAO-QR-CODE.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `TESTES-FASE3-ESCALAS-20260309.md` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `TESTES-FASE3B-PERFORMANCE-ESCALAS-20260309.md` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `TESTES-SEGURANCA-FRMS-FASE2-20260310.md` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `VALIDACAO-DEPLOY-12-01-2026.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `VALIDACAO-FINAL-ESCALAS-20260307.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `VISUAL-EXPLICACAO-TEMPLATE-CERTIFICADOS.txt` — Artefato estático de evidência/saída fora da estrutura principal.
- `audit-frms-melhorias-2026-05-04.md` — Relatório/auditoria/checklist histórico solto na raiz; candidato a arquivamento.
- `backup-airtrust-fase1-20251104-210219.tar.gz` — Backup compactado manual de fase anterior; não participa de build.
- `backup-fase1-final-1762301910.tar.gz` — Backup compactado manual de fase anterior; não participa de build.
- `backup-fase1-final-1762301913.tar.gz` — Backup compactado manual de fase anterior; não participa de build.
- `debug-login-failed.png` — Artefato estático de evidência/saída fora da estrutura principal.
- `index-antigo.html` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.
- `test-alert-local.html` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-blocos.mjs` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-certificate-flow.mjs` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-click-monitoring.js` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-direct.html` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-fix-aeronaves.js` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-frontend-completo.html` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-func-import.csv` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-historico-invalid.csv` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-historico-valid.csv` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-import-tipos.html` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-import.html` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-import.json` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-login.json` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-modals-fichas.html` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-modelo-debug.js` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-pdf-generation.mjs` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test-tipos-import.csv` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test_upload.mjs` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `test_xlsx_upload.js` — Arquivo de teste ad-hoc na raiz, fora de `e2e/` ou `scripts/`.
- `walkthrough.md.resolved` — Item com perfil de artefato temporário/legado, sem referência detectada por busca literal.

## 4) Itens que exigem investigação antes de mover
Total: **163**
- `.DS_Store` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.audit` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.cascade-protocol.md` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.cascade.json` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.claude` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.clineignore` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.clinerules` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.cursor-autoapprove` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.cursorrules` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.deployment_version` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.dev-logs` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.devcontainer.disabled` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.env.local.production` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.env.production` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.env.test` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.eslintrc.json` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.mocharc.json` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.prettierignore` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.prettierrc` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.prettierrc.json` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.tmp-deploy-edapp-20260408195248` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.vercel` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.vercelignore` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.vercelrc` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.windsurf` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.windsurfrules` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `.wrangler-dry` — Arquivo/pasta oculta de ambiente/config local; requer validação manual antes de mover.
- `ANALISE-COERENCIA-QUALIFICACOES-2026-02-05.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `ANALISE-DADOS-EDAPP-AIRTRUST-2026-02-05.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-AERONAVE-QUALIFICACOES-2026-01-13.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-AERONAVES-COMPLETA-2026-01-13.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-APROVACAO-MANUAL-INSTRUTOR.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-ARQUITETURA-PRE-FRMS-2026-02-26.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-ATUALIZADA-2026-02-06.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-BUGS-CRITICOS-20260306.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-BUGS-PROFUNDA-2026-02-07.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-COMPLETA-SISTEMA-2026-02-06.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-COMPLETA-SISTEMA-2026-02-07.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-COMPLETA-SISTEMA-2026-03-04.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-COMPLIANCE-QUALIFICACOES-2026-02-05.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-EDAPP-2026-02-05.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-FRMS-DINAMISMO-HARDCODES-20260310.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-PERFORMANCE-COMPLETA-2026-01-14.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `AUDITORIA-SISTEMA-2026-01-14.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `CGA - Conhecimentos Gerais de Aeronaves` — Pacote de conteúdo operacional grande na raiz; dependências e uso precisam confirmação.
- `CHEAT-SHEET-FRMS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `CHECKS-EXAMINADORES-FINAL.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `CONFIGURAR-CLOUDFLARE-PAGES.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `CONFIGURAR-CUSTOM-DOMAIN-AIRTRUST.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `CONSOLIDACAO-CERTIFICADOS-RESUMO.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `DASHBOARD-FUNCIONARIOS-INTELIGENTE.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `DETALHES-TECNICOS-CERTIFICADOS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `DISPONIBILIDADE-CORRIGIDA-20260305.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `EDAPP-ACESSO-DADOS-HISTORICOS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `ESTRATEGIA_DADOS_FRONTEND_10-11-2025.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `Emergências Gerais` — Pacote de conteúdo operacional grande na raiz; dependências e uso precisam confirmação.
- `FEATURES-PROMPTA-ESCALAS-20260309.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `FEATURES-PROMPTB-PDF-ESCALAS-20260309.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `FIX-INCONSISTENCIA-CALENDARIO-SESSOES-2026-01-14.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `FIXES-SALVAMENTO-CATEGORIAS.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `FIXLOG-MODAL-CORRIGIDO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `FIXLOG-TEMPLATE-CERTIFICADOS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `FRMS-CALCULOS-AUDITORIA-2026-03.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `FRMS-RELATORIO-IMPLEMENTACAO-COMPLETO-2026-03-11.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `GUIA-IMPORTACAO-XLSX.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `GUIA-RAPIDO-CERTIFICADOS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `GUIA-RODAR-LOCALMENTE-COM-PRODUCAO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `IMPORTACAO-HISTORICO-PRONTO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `INDICE-RAPIDO-FRMS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `INTEGRACAO-EDAPP-GUIA-COMPLETO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `INTEGRACAO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `INTEGRACOES-TEMPO-REAL-20260306.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `LIMPEZA-FASE6-ESCALAS-20260309.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `MAPA-CALCULOS-FRMS-COMPLETO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `MASCARAS-FORMULARIOS-FUNCIONARIOS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `MODULO-ESCALAS-CONCLUIDO-20260305.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `OTIMIZACOES-APLICADAS-2026-02-07.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `OTIMIZACOES-IMPLEMENTADAS-2026-01-14.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `OTIMIZACOES-IMPLEMENTADAS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `Operações Offshore` — Pacote de conteúdo operacional grande na raiz; dependências e uso precisam confirmação.
- `Operações PBN` — Pacote de conteúdo operacional grande na raiz; dependências e uso precisam confirmação.
- `PADRONIZACAO-DESIGN-SYSTEM-ESCALAS-20260308.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `PADRONIZACAO-QUINZENAS-UI-UX-ESCALAS-20260308.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `PENDENCIAS-FECHADAS-20260305.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `PERFORMANCE-FASE4-ESCALAS-20260309.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `PERFORMANCE-FRMS-FASE4-20260310.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `PLAYBOOK-MATRIZ-TREINAMENTOS-FICHA360.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `PRD-SGSO-AirTrust-v1.0.docx` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `PRÓXIMOS-PASSOS-SINCRONIZACAO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `QUICK-START-LOCALHOST-3000.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `README-CERTIFICADOS.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `REDESENHO-MODULO-ESCALAS-20260306.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `REDESIGN-FRMS-FASE3-20260310.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `REDESIGN-INTEGRACAO-ESCALAS-20260309.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `REFATORACAO-AERONAVES-2026-01-13.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `REFATORACAO-DUPLICACOES-COMPLETA-2026-02-07.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `REFATORACAO-GERENCIAMENTO-SESSOES-2026-01-14.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `RELATORIO-COMPLIANCE-DOCUMENTOS-OPS-2025.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RELATORIO-EDAPP-DETALHADO.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RELATORIO-FINAL-CONSOLIDACAO.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RELATORIO-FRMS-LAYOUT-EFETIVIDADE-SESSAO-20260312.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RELATORIO-FRMS-REFATORACAO-20260311.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RELATORIO-QA-COMPLEMENTAR-ESCALAS-20260307.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RELATORIO-QA-ESCALAS-20260307.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RELATÓRIO-LAYOUT-2026-03-05.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `RESPOSTA-INTEGRACAO-EDAPP-2026-02-05.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `RESUMO-ENCONTRADOS-FRMS.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `SINCRONIZACAO-VERSOES-CRÍTICO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `SISTEMA-CHECKS-CONCLUSAO-FINAL.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `SISTEMA-CHECKS-EXAMINADORES-IMPLEMENTADO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `SOLUCAO-RATE-LIMIT-1027.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `SUMARIO-VISUAL-CONSOLIDACAO.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `TEST-CERTIFICADOS-CONSOLIDADO.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `TESTE-FINAL-CHECKS-14JAN2026.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `VALIDACAO-SISTEMA-CHECKS-14JAN2026.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `VERIFICACAO-IMPLANTACAO-20260306-FINAL.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `VERIFICACAO-IMPLANTACAO-20260306.md` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `__Arquivos - Upload` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `_arquivos_nao_usados` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `audit-frms-sono-RBAC135.md` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `backup-airtrust-fase1-completa-20251104-210615.tar.gz` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `backup-local.js` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `check-deployment-status.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `cleanup.mjs` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `compare-qualificacoes.html` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `create-admin.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `criar-token.html` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `dev-auto-port.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `dist` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `downloaded.pdf` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `dummy.pdf` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `eng.traineddata` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `exemplo-tipos-qualificacoes.csv` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `find-account-id.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `find-account-via-memberships.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `find-zone-id.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `force-refresh.html` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `generated.pdf` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `index.html` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `invalidate-all-cache.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `list.json` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `list2.json` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `openapi.v2.legacy.yaml` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `perplexity_airtrust_sources` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `playwright-report` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `por.traineddata` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `purge-pages-cache.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `seed-sessoes-csv.json` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `template-importacao-qualificacoes-exemplo.csv` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `test-login-bcrypt.mjs` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `test-modal-funcionario.html` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `test-modals-console.js` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `test-output.pdf` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `test-pdf-simple.mjs` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `test_funcionarios_listar.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `test_import.mjs` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `test_manobras.js` — Script/HTML utilitário potencialmente operacional; uso não conclusivo nesta etapa.
- `teste-importacao-prod.csv` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `teste-qualificacoes-correto.csv` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `types.ts` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `typescript` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.
- `upload.json` — Há referência textual no repositório; manter como INVESTIGAR antes de qualquer movimento.
- `vite.config.ts.disabled` — Item ambíguo ou potencialmente referenciado por fluxo operacional; investigar antes de mover.

## 5) Justificativa do método
- Classificação inicial por função (infraestrutura, código-fonte e configs em ESSENCIAL).
- Candidatos detectados por padrão de nome (auditoria/relatório/backup/test/debug/output).
- Validação obrigatória por referência textual (`rg --fixed-strings`) para rebaixar candidato para INVESTIGAR quando houver ocorrência.
- Nenhuma ação de movimentação foi executada nesta fase.

## 6) Riscos
- Falsos positivos de referência textual (nome comum pode aparecer em contexto não operacional).
- Falsos negativos de referência dinâmica (arquivos carregados por convenção externa, não por string literal).
- Pastas de conteúdo operacional (ex.: materiais de treinamento) podem ser usadas fora do fluxo principal de build.
- Presença de alterações locais (`tracked modified`) exige cuidado para fases seguintes de movimentação.

## 7) Plano de movimentação proposto (fase seguinte, não executada aqui)
1. Criar pasta de destino `Arquivos/`.
2. Mover primeiro apenas candidatos sem referência detectada (lote pequeno).
3. Rodar validação rápida (`npm run build`/smoke) após cada lote.
4. Tratar itens INVESTIGAR com confirmação de uso (README/scripts/CI/ops).

## 8) Comando para criar pasta
```bash
mkdir -p Arquivos
```

## 9) Comandos propostos de movimentação (NÃO executados)
### Opção com `git mv` (quando os arquivos forem versionados)
```bash
git mv "AUDITORIA-DUPLICACOES-OBSOLETOS-2026-02-07.md" "Arquivos/AUDITORIA-DUPLICACOES-OBSOLETOS-2026-02-07.md"
git mv "AUDITORIA-E2E-ESCALAS-20260305.md" "Arquivos/AUDITORIA-E2E-ESCALAS-20260305.md"
git mv "AUDITORIA-E2E-FINAL-20260305.md" "Arquivos/AUDITORIA-E2E-FINAL-20260305.md"
git mv "AUDITORIA-EDAPP-POS-CORRECAO-2026-02-05.md" "Arquivos/AUDITORIA-EDAPP-POS-CORRECAO-2026-02-05.md"
git mv "AUDITORIA-ESCALAS-20260306.md" "Arquivos/AUDITORIA-ESCALAS-20260306.md"
git mv "AUDITORIA-ESCALAS-FORENSE-COMPLETA-2026-03-05.md" "Arquivos/AUDITORIA-ESCALAS-FORENSE-COMPLETA-2026-03-05.md"
git mv "AUDITORIA-ESCALAS-MEGA-PROMPT-2026-03-05.md" "Arquivos/AUDITORIA-ESCALAS-MEGA-PROMPT-2026-03-05.md"
git mv "AUDITORIA-FINAL-60-60-20260305.md" "Arquivos/AUDITORIA-FINAL-60-60-20260305.md"
git mv "AUDITORIA-FIX-DATAS-EDAPP-2026-02-05.md" "Arquivos/AUDITORIA-FIX-DATAS-EDAPP-2026-02-05.md"
git mv "AUDITORIA-FRMS-2026-02-26.md" "Arquivos/AUDITORIA-FRMS-2026-02-26.md"
git mv "AUDITORIA-FRMS-FASE1-20260310.md" "Arquivos/AUDITORIA-FRMS-FASE1-20260310.md"
git mv "AUDITORIA-L3-ESCALAS-2026-03-06.md" "Arquivos/AUDITORIA-L3-ESCALAS-2026-03-06.md"
git mv "AUDITORIA-LIMPEZA-IMPORTACAO-2026-02-04.md" "Arquivos/AUDITORIA-LIMPEZA-IMPORTACAO-2026-02-04.md"
git mv "AUDITORIA-LMS-INTEGRACAO-MODULOS-2026-04.md" "Arquivos/AUDITORIA-LMS-INTEGRACAO-MODULOS-2026-04.md"
git mv "AUDITORIA-MODALS-SALVAMENTO-2025-01-11.md" "Arquivos/AUDITORIA-MODALS-SALVAMENTO-2025-01-11.md"
git mv "AUDITORIA-ROTAS-BACKEND-2025.md" "Arquivos/AUDITORIA-ROTAS-BACKEND-2025.md"
git mv "AUDITORIA-SCHEMA-D1-2026-03-04.md" "Arquivos/AUDITORIA-SCHEMA-D1-2026-03-04.md"
git mv "AUDITORIA-TREINAMENTOS-PLANEJADOS-20260430.md" "Arquivos/AUDITORIA-TREINAMENTOS-PLANEJADOS-20260430.md"
git mv "AUDITORIA_PERFORMANCE_10-11-2025.md" "Arquivos/AUDITORIA_PERFORMANCE_10-11-2025.md"
git mv "AUDITORIA_SEGURANCA_10-11-2025.md" "Arquivos/AUDITORIA_SEGURANCA_10-11-2025.md"
git mv "BUG-HUNT-FASE5-ESCALAS-20260607.md" "Arquivos/BUG-HUNT-FASE5-ESCALAS-20260607.md"
git mv "BUG-HUNT-FASE5-FRMS-20260310.md" "Arquivos/BUG-HUNT-FASE5-FRMS-20260310.md"
git mv "BUGFIX-FRMS-CARDS-INCONSISTENCIA-20260310.md" "Arquivos/BUGFIX-FRMS-CARDS-INCONSISTENCIA-20260310.md"
git mv "BUGFIX-QUALIFICACOES-ICONES-PRODUCAO-20260310.md" "Arquivos/BUGFIX-QUALIFICACOES-ICONES-PRODUCAO-20260310.md"
git mv "BUGS-09-13-CORRIGIDOS.md" "Arquivos/BUGS-09-13-CORRIGIDOS.md"
git mv "BUGS-CORRIGIDOS-20260305.md" "Arquivos/BUGS-CORRIGIDOS-20260305.md"
git mv "CHECKLIST-IMPORTACAO-XLSX-2026-02-04.md" "Arquivos/CHECKLIST-IMPORTACAO-XLSX-2026-02-04.md"
git mv "CHECKLIST-POS-DEPLOY.md" "Arquivos/CHECKLIST-POS-DEPLOY.md"
git mv "CORRECAO-AERONAVES-AGENDAMENTO-2026-01-13.md" "Arquivos/CORRECAO-AERONAVES-AGENDAMENTO-2026-01-13.md"
git mv "CORRECOES-ANTIGRAVITY-ESCALAS-20260307.md" "Arquivos/CORRECOES-ANTIGRAVITY-ESCALAS-20260307.md"
git mv "CORRECOES-FINAIS-CERTIFICADOS.md" "Arquivos/CORRECOES-FINAIS-CERTIFICADOS.md"
git mv "CORRECOES-FINAIS-ESCALAS-20260307.md" "Arquivos/CORRECOES-FINAIS-ESCALAS-20260307.md"
git mv "CORRECOES-SISTEMA-CHECKS-2026-01-14.md" "Arquivos/CORRECOES-SISTEMA-CHECKS-2026-01-14.md"
git mv "DEBUG-IMPORTACAO.md" "Arquivos/DEBUG-IMPORTACAO.md"
git mv "DEBUG-TEMPLATE-CERTIFICADOS.md" "Arquivos/DEBUG-TEMPLATE-CERTIFICADOS.md"
git mv "FIRA - Nery.pdf" "Arquivos/FIRA - Nery.pdf"
git mv "FIRA - Ramos.pdf" "Arquivos/FIRA - Ramos.pdf"
git mv "FIX-DATA-VENCIMENTO-DINAMICA-2026-02-06.md" "Arquivos/FIX-DATA-VENCIMENTO-DINAMICA-2026-02-06.md"
git mv "FIX-DUPLICATAS-EDAPP-2026-02-05.md" "Arquivos/FIX-DUPLICATAS-EDAPP-2026-02-05.md"
git mv "FIX-EXPLOSAO-REQUESTS-682K.md" "Arquivos/FIX-EXPLOSAO-REQUESTS-682K.md"
git mv "FIX-ICONE-CERTIFICADO-2025-01-14.md" "Arquivos/FIX-ICONE-CERTIFICADO-2025-01-14.md"
git mv "FIX-MODELO-SESSAO-ID-2026-01-13.md" "Arquivos/FIX-MODELO-SESSAO-ID-2026-01-13.md"
git mv "FIX-VINCULO-EDAPP-EMAIL-2026-02-06.md" "Arquivos/FIX-VINCULO-EDAPP-EMAIL-2026-02-06.md"
git mv "FIX-VINCULOS-EDAPP-FALTANTES-2026-02-06.md" "Arquivos/FIX-VINCULOS-EDAPP-FALTANTES-2026-02-06.md"
git mv "FIXES-SAVING-AERONAVE-ESCALAS-20260309.md" "Arquivos/FIXES-SAVING-AERONAVE-ESCALAS-20260309.md"
git mv "HOMOLOGACAO-FASE2-ESCALAS-20260308.md" "Arquivos/HOMOLOGACAO-FASE2-ESCALAS-20260308.md"
git mv "HOMOLOGACAO-FINAL-ESCALAS-20260308.md" "Arquivos/HOMOLOGACAO-FINAL-ESCALAS-20260308.md"
git mv "HOMOLOGACAO-FINAL-V3-ESCALAS-20260308.md" "Arquivos/HOMOLOGACAO-FINAL-V3-ESCALAS-20260308.md"
git mv "INTEGRACAO-EDAPP-RESUMO.md" "Arquivos/INTEGRACAO-EDAPP-RESUMO.md"
git mv "PROVA-CERTIFICADOS-FUNCIONANDO.md" "Arquivos/PROVA-CERTIFICADOS-FUNCIONANDO.md"
git mv "PROVA-DE-VIDA-ESCALAS-20260305.md" "Arquivos/PROVA-DE-VIDA-ESCALAS-20260305.md"
git mv "PROVA-DEFINITIVA-CERTIFICADOS.md" "Arquivos/PROVA-DEFINITIVA-CERTIFICADOS.md"
git mv "RELATORIO-AUDITORIA-EDAPP-AIRTRUST-2026-02-06.md" "Arquivos/RELATORIO-AUDITORIA-EDAPP-AIRTRUST-2026-02-06.md"
git mv "RELATORIO-AUDITORIA-EDAPP-COMPLETO-2026-02-06.md" "Arquivos/RELATORIO-AUDITORIA-EDAPP-COMPLETO-2026-02-06.md"
git mv "RELATORIO-AUDITORIA-ESCALAS-20260309.md" "Arquivos/RELATORIO-AUDITORIA-ESCALAS-20260309.md"
git mv "RELATORIO-AUDITORIA-FRMS-110-20260309.md" "Arquivos/RELATORIO-AUDITORIA-FRMS-110-20260309.md"
git mv "RELATORIO-COMPLETO-EDAPP-2026-02-05.md" "Arquivos/RELATORIO-COMPLETO-EDAPP-2026-02-05.md"
git mv "RELATORIO-CONSOLIDACAO-DADOS-2026-01-13.md" "Arquivos/RELATORIO-CONSOLIDACAO-DADOS-2026-01-13.md"
git mv "RELATORIO-CORRECAO-ESCALA-MAIO2026.md" "Arquivos/RELATORIO-CORRECAO-ESCALA-MAIO2026.md"
git mv "RELATORIO-CORRECOES-AUDITORIA-2026-03-04.md" "Arquivos/RELATORIO-CORRECOES-AUDITORIA-2026-03-04.md"
git mv "RELATORIO-FINAL-ESCALAS-20260305.md" "Arquivos/RELATORIO-FINAL-ESCALAS-20260305.md"
git mv "RELATORIO-FINAL-EXECUCAO-2026-03-05.md" "Arquivos/RELATORIO-FINAL-EXECUCAO-2026-03-05.md"
git mv "RELATORIO-FRMS-OFFSHORE-SLEEP-20260311.md" "Arquivos/RELATORIO-FRMS-OFFSHORE-SLEEP-20260311.md"
git mv "RELATORIO-HOMOLOGACAO-COSTA-DO-SOL-PTO-2026-03-31.md" "Arquivos/RELATORIO-HOMOLOGACAO-COSTA-DO-SOL-PTO-2026-03-31.md"
git mv "RELATORIO-IMPACTO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md" "Arquivos/RELATORIO-IMPACTO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md"
git mv "RELATORIO-IMPLEMENTACAO-COMPLIANCE-GAPS-2025.md" "Arquivos/RELATORIO-IMPLEMENTACAO-COMPLIANCE-GAPS-2025.md"
git mv "RELATORIO-MODULO-SGSO-2026-03-15.md" "Arquivos/RELATORIO-MODULO-SGSO-2026-03-15.md"
git mv "RELATORIO-PROMPT2-ESCALAS-20260306.md" "Arquivos/RELATORIO-PROMPT2-ESCALAS-20260306.md"
git mv "RELATORIO-QA-COMPLEMENTAR-ESCALAS-20260308.md" "Arquivos/RELATORIO-QA-COMPLEMENTAR-ESCALAS-20260308.md"
git mv "RELATORIO-QA-ESCALAS-20260307-v2.md" "Arquivos/RELATORIO-QA-ESCALAS-20260307-v2.md"
git mv "RELATORIO-REEMISSAO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md" "Arquivos/RELATORIO-REEMISSAO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md"
git mv "RELATORIO-TECNICO-COMPLETO.md" "Arquivos/RELATORIO-TECNICO-COMPLETO.md"
git mv "RELATORIO-UI-UX-ESCALAS-20260307.md" "Arquivos/RELATORIO-UI-UX-ESCALAS-20260307.md"
git mv "RELATORIO_TECNICO.md" "Arquivos/RELATORIO_TECNICO.md"
git mv "RESUMO-CORRECOES-2026-02-06.md" "Arquivos/RESUMO-CORRECOES-2026-02-06.md"
git mv "RESUMO-EXECUTIVO-EDAPP-2026-02-05.md" "Arquivos/RESUMO-EXECUTIVO-EDAPP-2026-02-05.md"
git mv "RESUMO-FINAL-IMPORTACAO.md" "Arquivos/RESUMO-FINAL-IMPORTACAO.md"
git mv "RESUMO-SINCRONIZACAO-CLOUDFLARE.md" "Arquivos/RESUMO-SINCRONIZACAO-CLOUDFLARE.md"
git mv "STATUS-FINAL-CORRECOES-2026-02-07.md" "Arquivos/STATUS-FINAL-CORRECOES-2026-02-07.md"
git mv "TESTE-NOTIFICACOES-EDAPP-2026-02-06.md" "Arquivos/TESTE-NOTIFICACOES-EDAPP-2026-02-06.md"
git mv "TESTE-VALIDACAO-QR-CODE.md" "Arquivos/TESTE-VALIDACAO-QR-CODE.md"
git mv "TESTES-FASE3-ESCALAS-20260309.md" "Arquivos/TESTES-FASE3-ESCALAS-20260309.md"
git mv "TESTES-FASE3B-PERFORMANCE-ESCALAS-20260309.md" "Arquivos/TESTES-FASE3B-PERFORMANCE-ESCALAS-20260309.md"
git mv "TESTES-SEGURANCA-FRMS-FASE2-20260310.md" "Arquivos/TESTES-SEGURANCA-FRMS-FASE2-20260310.md"
git mv "VALIDACAO-DEPLOY-12-01-2026.md" "Arquivos/VALIDACAO-DEPLOY-12-01-2026.md"
git mv "VALIDACAO-FINAL-ESCALAS-20260307.md" "Arquivos/VALIDACAO-FINAL-ESCALAS-20260307.md"
git mv "VISUAL-EXPLICACAO-TEMPLATE-CERTIFICADOS.txt" "Arquivos/VISUAL-EXPLICACAO-TEMPLATE-CERTIFICADOS.txt"
git mv "audit-frms-melhorias-2026-05-04.md" "Arquivos/audit-frms-melhorias-2026-05-04.md"
git mv "backup-airtrust-fase1-20251104-210219.tar.gz" "Arquivos/backup-airtrust-fase1-20251104-210219.tar.gz"
git mv "backup-fase1-final-1762301910.tar.gz" "Arquivos/backup-fase1-final-1762301910.tar.gz"
git mv "backup-fase1-final-1762301913.tar.gz" "Arquivos/backup-fase1-final-1762301913.tar.gz"
git mv "debug-login-failed.png" "Arquivos/debug-login-failed.png"
git mv "index-antigo.html" "Arquivos/index-antigo.html"
git mv "test-alert-local.html" "Arquivos/test-alert-local.html"
git mv "test-blocos.mjs" "Arquivos/test-blocos.mjs"
git mv "test-certificate-flow.mjs" "Arquivos/test-certificate-flow.mjs"
git mv "test-click-monitoring.js" "Arquivos/test-click-monitoring.js"
git mv "test-direct.html" "Arquivos/test-direct.html"
git mv "test-fix-aeronaves.js" "Arquivos/test-fix-aeronaves.js"
git mv "test-frontend-completo.html" "Arquivos/test-frontend-completo.html"
git mv "test-func-import.csv" "Arquivos/test-func-import.csv"
git mv "test-historico-invalid.csv" "Arquivos/test-historico-invalid.csv"
git mv "test-historico-valid.csv" "Arquivos/test-historico-valid.csv"
git mv "test-import-tipos.html" "Arquivos/test-import-tipos.html"
git mv "test-import.html" "Arquivos/test-import.html"
git mv "test-import.json" "Arquivos/test-import.json"
git mv "test-login.json" "Arquivos/test-login.json"
git mv "test-modals-fichas.html" "Arquivos/test-modals-fichas.html"
git mv "test-modelo-debug.js" "Arquivos/test-modelo-debug.js"
git mv "test-pdf-generation.mjs" "Arquivos/test-pdf-generation.mjs"
git mv "test-tipos-import.csv" "Arquivos/test-tipos-import.csv"
git mv "test_upload.mjs" "Arquivos/test_upload.mjs"
git mv "test_xlsx_upload.js" "Arquivos/test_xlsx_upload.js"
git mv "walkthrough.md.resolved" "Arquivos/walkthrough.md.resolved"
```
### Opção com `mv` (se houver itens não versionados)
```bash
mv "AUDITORIA-DUPLICACOES-OBSOLETOS-2026-02-07.md" "Arquivos/AUDITORIA-DUPLICACOES-OBSOLETOS-2026-02-07.md"
mv "AUDITORIA-E2E-ESCALAS-20260305.md" "Arquivos/AUDITORIA-E2E-ESCALAS-20260305.md"
mv "AUDITORIA-E2E-FINAL-20260305.md" "Arquivos/AUDITORIA-E2E-FINAL-20260305.md"
mv "AUDITORIA-EDAPP-POS-CORRECAO-2026-02-05.md" "Arquivos/AUDITORIA-EDAPP-POS-CORRECAO-2026-02-05.md"
mv "AUDITORIA-ESCALAS-20260306.md" "Arquivos/AUDITORIA-ESCALAS-20260306.md"
mv "AUDITORIA-ESCALAS-FORENSE-COMPLETA-2026-03-05.md" "Arquivos/AUDITORIA-ESCALAS-FORENSE-COMPLETA-2026-03-05.md"
mv "AUDITORIA-ESCALAS-MEGA-PROMPT-2026-03-05.md" "Arquivos/AUDITORIA-ESCALAS-MEGA-PROMPT-2026-03-05.md"
mv "AUDITORIA-FINAL-60-60-20260305.md" "Arquivos/AUDITORIA-FINAL-60-60-20260305.md"
mv "AUDITORIA-FIX-DATAS-EDAPP-2026-02-05.md" "Arquivos/AUDITORIA-FIX-DATAS-EDAPP-2026-02-05.md"
mv "AUDITORIA-FRMS-2026-02-26.md" "Arquivos/AUDITORIA-FRMS-2026-02-26.md"
mv "AUDITORIA-FRMS-FASE1-20260310.md" "Arquivos/AUDITORIA-FRMS-FASE1-20260310.md"
mv "AUDITORIA-L3-ESCALAS-2026-03-06.md" "Arquivos/AUDITORIA-L3-ESCALAS-2026-03-06.md"
mv "AUDITORIA-LIMPEZA-IMPORTACAO-2026-02-04.md" "Arquivos/AUDITORIA-LIMPEZA-IMPORTACAO-2026-02-04.md"
mv "AUDITORIA-LMS-INTEGRACAO-MODULOS-2026-04.md" "Arquivos/AUDITORIA-LMS-INTEGRACAO-MODULOS-2026-04.md"
mv "AUDITORIA-MODALS-SALVAMENTO-2025-01-11.md" "Arquivos/AUDITORIA-MODALS-SALVAMENTO-2025-01-11.md"
mv "AUDITORIA-ROTAS-BACKEND-2025.md" "Arquivos/AUDITORIA-ROTAS-BACKEND-2025.md"
mv "AUDITORIA-SCHEMA-D1-2026-03-04.md" "Arquivos/AUDITORIA-SCHEMA-D1-2026-03-04.md"
mv "AUDITORIA-TREINAMENTOS-PLANEJADOS-20260430.md" "Arquivos/AUDITORIA-TREINAMENTOS-PLANEJADOS-20260430.md"
mv "AUDITORIA_PERFORMANCE_10-11-2025.md" "Arquivos/AUDITORIA_PERFORMANCE_10-11-2025.md"
mv "AUDITORIA_SEGURANCA_10-11-2025.md" "Arquivos/AUDITORIA_SEGURANCA_10-11-2025.md"
mv "BUG-HUNT-FASE5-ESCALAS-20260607.md" "Arquivos/BUG-HUNT-FASE5-ESCALAS-20260607.md"
mv "BUG-HUNT-FASE5-FRMS-20260310.md" "Arquivos/BUG-HUNT-FASE5-FRMS-20260310.md"
mv "BUGFIX-FRMS-CARDS-INCONSISTENCIA-20260310.md" "Arquivos/BUGFIX-FRMS-CARDS-INCONSISTENCIA-20260310.md"
mv "BUGFIX-QUALIFICACOES-ICONES-PRODUCAO-20260310.md" "Arquivos/BUGFIX-QUALIFICACOES-ICONES-PRODUCAO-20260310.md"
mv "BUGS-09-13-CORRIGIDOS.md" "Arquivos/BUGS-09-13-CORRIGIDOS.md"
mv "BUGS-CORRIGIDOS-20260305.md" "Arquivos/BUGS-CORRIGIDOS-20260305.md"
mv "CHECKLIST-IMPORTACAO-XLSX-2026-02-04.md" "Arquivos/CHECKLIST-IMPORTACAO-XLSX-2026-02-04.md"
mv "CHECKLIST-POS-DEPLOY.md" "Arquivos/CHECKLIST-POS-DEPLOY.md"
mv "CORRECAO-AERONAVES-AGENDAMENTO-2026-01-13.md" "Arquivos/CORRECAO-AERONAVES-AGENDAMENTO-2026-01-13.md"
mv "CORRECOES-ANTIGRAVITY-ESCALAS-20260307.md" "Arquivos/CORRECOES-ANTIGRAVITY-ESCALAS-20260307.md"
mv "CORRECOES-FINAIS-CERTIFICADOS.md" "Arquivos/CORRECOES-FINAIS-CERTIFICADOS.md"
mv "CORRECOES-FINAIS-ESCALAS-20260307.md" "Arquivos/CORRECOES-FINAIS-ESCALAS-20260307.md"
mv "CORRECOES-SISTEMA-CHECKS-2026-01-14.md" "Arquivos/CORRECOES-SISTEMA-CHECKS-2026-01-14.md"
mv "DEBUG-IMPORTACAO.md" "Arquivos/DEBUG-IMPORTACAO.md"
mv "DEBUG-TEMPLATE-CERTIFICADOS.md" "Arquivos/DEBUG-TEMPLATE-CERTIFICADOS.md"
mv "FIRA - Nery.pdf" "Arquivos/FIRA - Nery.pdf"
mv "FIRA - Ramos.pdf" "Arquivos/FIRA - Ramos.pdf"
mv "FIX-DATA-VENCIMENTO-DINAMICA-2026-02-06.md" "Arquivos/FIX-DATA-VENCIMENTO-DINAMICA-2026-02-06.md"
mv "FIX-DUPLICATAS-EDAPP-2026-02-05.md" "Arquivos/FIX-DUPLICATAS-EDAPP-2026-02-05.md"
mv "FIX-EXPLOSAO-REQUESTS-682K.md" "Arquivos/FIX-EXPLOSAO-REQUESTS-682K.md"
mv "FIX-ICONE-CERTIFICADO-2025-01-14.md" "Arquivos/FIX-ICONE-CERTIFICADO-2025-01-14.md"
mv "FIX-MODELO-SESSAO-ID-2026-01-13.md" "Arquivos/FIX-MODELO-SESSAO-ID-2026-01-13.md"
mv "FIX-VINCULO-EDAPP-EMAIL-2026-02-06.md" "Arquivos/FIX-VINCULO-EDAPP-EMAIL-2026-02-06.md"
mv "FIX-VINCULOS-EDAPP-FALTANTES-2026-02-06.md" "Arquivos/FIX-VINCULOS-EDAPP-FALTANTES-2026-02-06.md"
mv "FIXES-SAVING-AERONAVE-ESCALAS-20260309.md" "Arquivos/FIXES-SAVING-AERONAVE-ESCALAS-20260309.md"
mv "HOMOLOGACAO-FASE2-ESCALAS-20260308.md" "Arquivos/HOMOLOGACAO-FASE2-ESCALAS-20260308.md"
mv "HOMOLOGACAO-FINAL-ESCALAS-20260308.md" "Arquivos/HOMOLOGACAO-FINAL-ESCALAS-20260308.md"
mv "HOMOLOGACAO-FINAL-V3-ESCALAS-20260308.md" "Arquivos/HOMOLOGACAO-FINAL-V3-ESCALAS-20260308.md"
mv "INTEGRACAO-EDAPP-RESUMO.md" "Arquivos/INTEGRACAO-EDAPP-RESUMO.md"
mv "PROVA-CERTIFICADOS-FUNCIONANDO.md" "Arquivos/PROVA-CERTIFICADOS-FUNCIONANDO.md"
mv "PROVA-DE-VIDA-ESCALAS-20260305.md" "Arquivos/PROVA-DE-VIDA-ESCALAS-20260305.md"
mv "PROVA-DEFINITIVA-CERTIFICADOS.md" "Arquivos/PROVA-DEFINITIVA-CERTIFICADOS.md"
mv "RELATORIO-AUDITORIA-EDAPP-AIRTRUST-2026-02-06.md" "Arquivos/RELATORIO-AUDITORIA-EDAPP-AIRTRUST-2026-02-06.md"
mv "RELATORIO-AUDITORIA-EDAPP-COMPLETO-2026-02-06.md" "Arquivos/RELATORIO-AUDITORIA-EDAPP-COMPLETO-2026-02-06.md"
mv "RELATORIO-AUDITORIA-ESCALAS-20260309.md" "Arquivos/RELATORIO-AUDITORIA-ESCALAS-20260309.md"
mv "RELATORIO-AUDITORIA-FRMS-110-20260309.md" "Arquivos/RELATORIO-AUDITORIA-FRMS-110-20260309.md"
mv "RELATORIO-COMPLETO-EDAPP-2026-02-05.md" "Arquivos/RELATORIO-COMPLETO-EDAPP-2026-02-05.md"
mv "RELATORIO-CONSOLIDACAO-DADOS-2026-01-13.md" "Arquivos/RELATORIO-CONSOLIDACAO-DADOS-2026-01-13.md"
mv "RELATORIO-CORRECAO-ESCALA-MAIO2026.md" "Arquivos/RELATORIO-CORRECAO-ESCALA-MAIO2026.md"
mv "RELATORIO-CORRECOES-AUDITORIA-2026-03-04.md" "Arquivos/RELATORIO-CORRECOES-AUDITORIA-2026-03-04.md"
mv "RELATORIO-FINAL-ESCALAS-20260305.md" "Arquivos/RELATORIO-FINAL-ESCALAS-20260305.md"
mv "RELATORIO-FINAL-EXECUCAO-2026-03-05.md" "Arquivos/RELATORIO-FINAL-EXECUCAO-2026-03-05.md"
mv "RELATORIO-FRMS-OFFSHORE-SLEEP-20260311.md" "Arquivos/RELATORIO-FRMS-OFFSHORE-SLEEP-20260311.md"
mv "RELATORIO-HOMOLOGACAO-COSTA-DO-SOL-PTO-2026-03-31.md" "Arquivos/RELATORIO-HOMOLOGACAO-COSTA-DO-SOL-PTO-2026-03-31.md"
mv "RELATORIO-IMPACTO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md" "Arquivos/RELATORIO-IMPACTO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md"
mv "RELATORIO-IMPLEMENTACAO-COMPLIANCE-GAPS-2025.md" "Arquivos/RELATORIO-IMPLEMENTACAO-COMPLIANCE-GAPS-2025.md"
mv "RELATORIO-MODULO-SGSO-2026-03-15.md" "Arquivos/RELATORIO-MODULO-SGSO-2026-03-15.md"
mv "RELATORIO-PROMPT2-ESCALAS-20260306.md" "Arquivos/RELATORIO-PROMPT2-ESCALAS-20260306.md"
mv "RELATORIO-QA-COMPLEMENTAR-ESCALAS-20260308.md" "Arquivos/RELATORIO-QA-COMPLEMENTAR-ESCALAS-20260308.md"
mv "RELATORIO-QA-ESCALAS-20260307-v2.md" "Arquivos/RELATORIO-QA-ESCALAS-20260307-v2.md"
mv "RELATORIO-REEMISSAO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md" "Arquivos/RELATORIO-REEMISSAO-CERTIFICADOS-COSTA-DO-SOL-2026-03-31.md"
mv "RELATORIO-TECNICO-COMPLETO.md" "Arquivos/RELATORIO-TECNICO-COMPLETO.md"
mv "RELATORIO-UI-UX-ESCALAS-20260307.md" "Arquivos/RELATORIO-UI-UX-ESCALAS-20260307.md"
mv "RELATORIO_TECNICO.md" "Arquivos/RELATORIO_TECNICO.md"
mv "RESUMO-CORRECOES-2026-02-06.md" "Arquivos/RESUMO-CORRECOES-2026-02-06.md"
mv "RESUMO-EXECUTIVO-EDAPP-2026-02-05.md" "Arquivos/RESUMO-EXECUTIVO-EDAPP-2026-02-05.md"
mv "RESUMO-FINAL-IMPORTACAO.md" "Arquivos/RESUMO-FINAL-IMPORTACAO.md"
mv "RESUMO-SINCRONIZACAO-CLOUDFLARE.md" "Arquivos/RESUMO-SINCRONIZACAO-CLOUDFLARE.md"
mv "STATUS-FINAL-CORRECOES-2026-02-07.md" "Arquivos/STATUS-FINAL-CORRECOES-2026-02-07.md"
mv "TESTE-NOTIFICACOES-EDAPP-2026-02-06.md" "Arquivos/TESTE-NOTIFICACOES-EDAPP-2026-02-06.md"
mv "TESTE-VALIDACAO-QR-CODE.md" "Arquivos/TESTE-VALIDACAO-QR-CODE.md"
mv "TESTES-FASE3-ESCALAS-20260309.md" "Arquivos/TESTES-FASE3-ESCALAS-20260309.md"
mv "TESTES-FASE3B-PERFORMANCE-ESCALAS-20260309.md" "Arquivos/TESTES-FASE3B-PERFORMANCE-ESCALAS-20260309.md"
mv "TESTES-SEGURANCA-FRMS-FASE2-20260310.md" "Arquivos/TESTES-SEGURANCA-FRMS-FASE2-20260310.md"
mv "VALIDACAO-DEPLOY-12-01-2026.md" "Arquivos/VALIDACAO-DEPLOY-12-01-2026.md"
mv "VALIDACAO-FINAL-ESCALAS-20260307.md" "Arquivos/VALIDACAO-FINAL-ESCALAS-20260307.md"
mv "VISUAL-EXPLICACAO-TEMPLATE-CERTIFICADOS.txt" "Arquivos/VISUAL-EXPLICACAO-TEMPLATE-CERTIFICADOS.txt"
mv "audit-frms-melhorias-2026-05-04.md" "Arquivos/audit-frms-melhorias-2026-05-04.md"
mv "backup-airtrust-fase1-20251104-210219.tar.gz" "Arquivos/backup-airtrust-fase1-20251104-210219.tar.gz"
mv "backup-fase1-final-1762301910.tar.gz" "Arquivos/backup-fase1-final-1762301910.tar.gz"
mv "backup-fase1-final-1762301913.tar.gz" "Arquivos/backup-fase1-final-1762301913.tar.gz"
mv "debug-login-failed.png" "Arquivos/debug-login-failed.png"
mv "index-antigo.html" "Arquivos/index-antigo.html"
mv "test-alert-local.html" "Arquivos/test-alert-local.html"
mv "test-blocos.mjs" "Arquivos/test-blocos.mjs"
mv "test-certificate-flow.mjs" "Arquivos/test-certificate-flow.mjs"
mv "test-click-monitoring.js" "Arquivos/test-click-monitoring.js"
mv "test-direct.html" "Arquivos/test-direct.html"
mv "test-fix-aeronaves.js" "Arquivos/test-fix-aeronaves.js"
mv "test-frontend-completo.html" "Arquivos/test-frontend-completo.html"
mv "test-func-import.csv" "Arquivos/test-func-import.csv"
mv "test-historico-invalid.csv" "Arquivos/test-historico-invalid.csv"
mv "test-historico-valid.csv" "Arquivos/test-historico-valid.csv"
mv "test-import-tipos.html" "Arquivos/test-import-tipos.html"
mv "test-import.html" "Arquivos/test-import.html"
mv "test-import.json" "Arquivos/test-import.json"
mv "test-login.json" "Arquivos/test-login.json"
mv "test-modals-fichas.html" "Arquivos/test-modals-fichas.html"
mv "test-modelo-debug.js" "Arquivos/test-modelo-debug.js"
mv "test-pdf-generation.mjs" "Arquivos/test-pdf-generation.mjs"
mv "test-tipos-import.csv" "Arquivos/test-tipos-import.csv"
mv "test_upload.mjs" "Arquivos/test_upload.mjs"
mv "test_xlsx_upload.js" "Arquivos/test_xlsx_upload.js"
mv "walkthrough.md.resolved" "Arquivos/walkthrough.md.resolved"
```

## 10) Confirmação desta fase
- Nenhum arquivo foi movido.
- Nenhum arquivo foi apagado.
- Nenhum código-fonte foi alterado nesta auditoria.
