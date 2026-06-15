# AirTrust — Módulos e Funcionalidades

> **Versão:** 1.0 | **Data:** 2026-06-12 | **HEAD:** `5be104893`

## 1. Visão Geral

O AirTrust possui **18+ módulos funcionais** ativos em produção.

| # | Módulo | Status | Rotas API | Páginas Frontend |
|---|--------|--------|-----------|-------------------|
| 1 | Qualificações & Certificados | ✅ Ativo | 12+ | 4 |
| 2 | FRMS | ✅ Ativo | 20+ | 13 |
| 3 | Escalas Mensais | ✅ Ativo | 10+ | 5 |
| 4 | EVD (Escala de Voo Diária) | ✅ Ativo | 5+ | 2 |
| 5 | LMS Nativo | ✅ Ativo | 15+ | 10 |
| 6 | SGSO | ✅ Ativo | 15+ | 4 |
| 7 | Simuladores | ✅ Ativo | 20+ | 14 |
| 8 | Funcionários | ✅ Ativo | 6 | 3 |
| 9 | Dashboard | ✅ Ativo | 9 | 2 |
| 10 | Compliance | ✅ Ativo | 4 | 1 |
| 11 | Backup & Restore | ✅ Ativo | 5 | 1 |
| 12 | Pasta Virtual | ✅ Ativo | 7 | 2 |
| 13 | Hospedagem | ✅ Ativo | 6 | 1 |
| 14 | Integração SIGVOOS | ✅ Ativo | 10 | 1 |
| 15 | Integração EdApp | ❌ Desativada (410) | 12 (legado) | 1 |
| 16 | Assistente IA | ✅ Ativo | 1 | — |
| 17 | Matriz de Treinamentos | ✅ Ativo | 8 | 1 |
| 18 | Ficha 360° | ✅ Ativo | 1 | 1 |

## 2. Feature Flags

| Flag | Estado | Descrição |
|---|---|---|
| `ENABLE_CATALOG_MANAGEMENT` | ✅ `true` | Gestão de catálogo LMS |
| `ENABLE_ADVANCED_REPORTING` | ❌ `false` | Relatórios avançados cross-module |
| `ENABLE_NOTIFICATION_SYSTEM` | ❌ `false` | Sistema de notificações integrado |
| `ENABLE_EXPORT_FUNCTIONS` | ✅ `true` | Exportação XLSX/PDF |
| `ENABLE_BULK_OPERATIONS` | ❌ `false` | Operações em lote |
| `ENABLE_AUDIT_TRAIL_UI` | ❌ `false` | Interface de auditoria |

### Server-side flags

| Flag | Fonte | Estado |
|---|---|---|
| `SIMULATOR_SHARED_SESSIONS_ENABLED` | wrangler.toml | ✅ `true` |
| `ENABLE_DEV_AUTH_BYPASS` | .dev.vars | ✅ (dev only) |
| `ENABLE_MANUAL_MIGRATIONS` | .dev.vars | ❌ (nunca staging/prod) |

## 3. Módulo: Qualificações & Certificados

**Arquivos**: `routes/qualificacoes/` (9 arquivos), `routes/qualificacoes-alertas.ts`,
`routes/qualificacoes-reclass.ts`, `routes/qualificacoes-certificados*.ts` (2),
`routes/certificados/validacao.ts`, `routes/fix-renovadas.ts`, `routes/auditoria.ts`,
`routes/deduplicate.ts`

**Tabelas**: `qualificacoes_tipos`, `qualificacoes_historico`, `qualificacoes_reclass_queue`,
`categorias`, `certificados`

**Páginas**: `/qualificacoes`, `/qualificacoes/dashboard`, `/qualificacoes/reclassificacao`,
`/qualificacoes/alertas`

**Status de qualificação**: `VALIDA`, `VENCIDA`, `PROXIMA_VENCIMENTO`, `RENOVADA`, `PLANEJADA`

## 4. Módulo: FRMS

**Biblioteca**: `lib/frms/` (27 arquivos, ~6000+ linhas)

**Arquivos de rota** (9): `frms.ts`, `frms-shared.ts`, `frms-fira.ts`,
`frms-fadiga-checkin.ts`, `frms-fadiga-acumulada.ts`, `frms-relatorios-config.ts`,
`frms-operational-snapshot.ts`, `frms-read-ack.ts`

**Páginas** (13): `/frms` → `FrmsDashboard`, `/frms/tripulante/:id`, `/frms/alertas`,
`/frms/relatorios`, `/frms/escalas`, `/frms/configuracoes`, `/frms/importacao/fira`,
`/frms/importacao/fira/historico`, `/frms/conceitos`, `/frms/fadiga-acumulada`,
`/frms/checkin`, `/frms/fadiga-painel`, `/frms/controle-operacional`

**Migrations**: 29 (0212–0384). Destaques: 0212 (core), 0351 (SIGVOOS), 0353 (sono 8h),
0356 (justificativas), 0357 (AI cache), 0384 (read-ack storage)

**Pipeline**: `salvarJornada` → `calcFatorizacao` (9 fatores) → `calcEffectiveness`
(SAFTE/FAST proxy) → `calcAcumuloRolling` (7/28/365d) → `processarAlertas`
(AVISO/ATENCAO/CRITICO/VIOLACAO) → `despacharNotificacoes`

## 5. Módulo: Escalas Mensais

**Arquivos**: `routes/escalas-core.ts`, `routes/escalas/`, `routes/escalas-confirmacoes.ts`

**Páginas** (5): `/escalas`, `/escalas/configuracoes`, `/escalas/minha-escala`
(PWA offline-first), `/escalas/visao-mensal`, `/escalas/diaria`

**Zustand stores**: `useEscalaConfigStore` (persistido, localStorage),
`useEscalaUIStore` (efêmero, 15 variantes de modal)

## 6. Módulo: EVD

Escala de Voo Diária (PRC-OPS-009). **Rota**: `routes/escalas-evd.ts` → `/api/evd`.
**Páginas**: `EvdPage` (acessível via `/escalas/diaria` e `/escalas/evd`).

## 7. Módulo: LMS

**Tipos de conteúdo**: SCORM 1.2/2004 (`scorm-again` v3.0.3), H5P (`h5p-standalone` v3.8.2),
PDF (`react-pdf` v9.2.1), PPTX (`@jvmr/pptx-to-html` v1.0.1), Vídeo (HTML5)

**Arquivos de rota** (6): `lms-cursos.ts`, `lms-matriculas.ts`, `lms-progresso.ts`,
`lms-assets.ts`, `lms-relatorios.ts`, `lms-edapp-legado.ts`

**Páginas** (10): `/lms/cursos`, `/lms/cursos/:id`, `/lms/admin/cursos`,
`/lms/player/:matriculaId` (SCORM/Vídeo), `/lms/player/h5p/:matriculaId`,
`/lms/player/pdf/:matriculaId`, `/lms/player/pptx/:matriculaId`,
`/lms/player/preview/:cursoId`, `/lms/relatorios`, `/lms/matriculas`

**Segurança**: Assets via cookie JWT (`token_type: 'lms_asset'`, TTL 15min, HttpOnly, Secure, SameSite=Strict)

**SSOT EAD**: Sincronização bidirecional `qualificacoes_tipos` ↔ `lms_cursos`
(via `ead_qualificacao_codigo`)

**Ciclos**: Renovação automática com janela de 30 dias antes do vencimento

## 8. Módulo: SGSO

**Arquivos** (5): `sgso.ts` (1045 linhas), `sgso-next-gen.ts`, `sgso-next-gen-extra.ts`,
`sgso-kpi.ts`, `sgso-auditorias-ncs.ts`

**Matriz de risco**: ICAO 5×5 — CRÍTICO (≥20), ALTO (≥12), MÉDIO (≥5), BAIXO (<5)

**Páginas** (4): `/sgso`, `/sgso/relatos/:id`, `/sgso/relprev`, `/sgso/bowtie`, `/sgso/frat`

## 9. Módulo: Simuladores

**Arquivos** (17): `simuladores-core.ts`, `simuladores-sessoes.ts`,
`simuladores-sessoes-participantes.ts`, `simuladores-fichas*.ts` (5),
`simuladores-shared*.ts` (2), `simuladores-catalogo.ts`, etc.

**Páginas** (14): `/simuladores`, `/simuladores/dashboard`,
`/simuladores/desempenho/:funcionarioId`, `/simuladores/fichas`,
`/simuladores/fichas/:id`, `/simuladores/configuracoes`,
`/simuladores/cadastros/*` (7 sub-páginas), `/simuladores/relatorios`

## 10. Módulo: Funcionários

**Rota**: `routes/funcionarios.ts`. **Páginas** (3): `/funcionarios`,
`/funcionarios/:id` (FichaFuncionarioPage), `/funcionarios/:id/perfil`

## 11. Módulo: Dashboard & Analytics

**Rota**: `routes/dashboard.ts` (9 endpoints). **Páginas** (2):
`/` → `DashboardPrincipal` (admin/gestor) ou `HomePerfil` (aluno/instrutor),
`/relatorios` → `RelatoriosDashboard`

## 12. Módulo: Compliance

**Arquivos** (3): `routes/compliance.ts`, `routes/compliance-recalculate.ts`,
`routes/compliance-requisitos.ts`

**Status**: `conforme`, `em_risco`, `nao_conforme`

## 13–20. Demais Módulos

| Módulo | Arquivos | Descrição |
|---|---|---|
| Backup & Restore | `routes/backup.ts` | Snapshots D1→R2 (COMPLETO/MODULAR/INCREMENTAL), retenção 30d/1a/7a |
| Pasta Virtual | `routes/pasta-virtual.ts` (1123 linhas) | Documentos R2 por categoria, cascade delete |
| Hospedagem | `routes/hospedagem.ts` | HOTEL, PLATAFORMA, BASE, OUTRO |
| SIGVOOS | `routes/integracoes_sigvoos.ts` (741 linhas) | Sync FRMS, chunking, mapeamento manual |
| EdApp | `routes/integracoes_edapp.ts` (1142 linhas) | ❌ Desativado — todos endpoints retornam 410 |
| Assistente IA | `routes/assistente.ts` (847 linhas) | Llama 3.1 8B + rule engine fallback |
| Matriz Treinamento | `routes/matriz-treinamento.ts` (745 linhas) | OBRIGATORIA/RECOMENDADA/NAO_APLICA |
| Ficha 360° | `routes/ficha360.ts` (639 linhas) | Visão completa multi-módulo |
| Admin | `routes/admin*.ts`, `routes/empresas.ts` (1250 linhas) | CRUD usuários, perfis, empresas |
| Export/Import | `routes/exportacao.ts`, `routes/importacao.ts` (1388 linhas) | XLSX/CSV/JSON, modos INSERT/UPSERT/MESCLAR |
| Notificações | `routes/notificacoes*.ts` | Sistema + WhatsApp + Convocações |
| Cadastros | `routes/funcoes.ts`, `routes/setores.ts`, etc. | Lookup tables |

## Apêndice: Catálogo de Páginas Frontend (35+)

**Rotas públicas** (4): `/login`, `/aceitar-convite`, `/verificar-certificado/:hash`, `/validar/:hash`

**Principais** (5): `/`, `/home`, `/funcionarios`, `/funcionarios/:id`, `/perfil/trocar-senha`

**Qualificações** (4): `/qualificacoes`, `/qualificacoes/dashboard`, `/qualificacoes/reclassificacao`, `/qualificacoes/alertas`

**FRMS** (13): `/frms`, `/frms/tripulante/:id`, `/frms/alertas`, `/frms/relatorios`, `/frms/escalas`, `/frms/configuracoes`, `/frms/importacao/fira`, `/frms/importacao/fira/historico`, `/frms/conceitos`, `/frms/fadiga-acumulada`, `/frms/checkin`, `/frms/fadiga-painel`, `/frms/controle-operacional`

**Escalas** (5): `/escalas`, `/escalas/configuracoes`, `/escalas/minha-escala`, `/escalas/visao-mensal`, `/escalas/diaria`

**LMS** (10): `/lms`, `/lms/cursos`, `/lms/cursos/:id`, `/lms/admin/cursos`, `/lms/player/:matriculaId`, `/lms/player/preview/:cursoId`, `/lms/player/h5p/:matriculaId`, `/lms/player/pdf/:matriculaId`, `/lms/player/pptx/:matriculaId`, `/lms/relatorios`, `/lms/matriculas`

**Simuladores** (14): `/simuladores`, `/simuladores/dashboard`, `/simuladores/desempenho/:funcionarioId`, `/simuladores/fichas`, `/simuladores/fichas/:id`, `/simuladores/configuracoes`, 7× `/simuladores/cadastros/*`, `/simuladores/relatorios`

**SGSO** (4): `/sgso`, `/sgso/relatos/:id`, `/sgso/relprev`, `/sgso/bowtie`, `/sgso/frat`

**Admin & Outros** (12+): `/admin/usuarios`, `/admin/permissoes`, `/configuracoes`, `/sistema`, `/configuracoes/cadastros`, `/configuracoes/integracoes/*`, `/configuracoes/compliance`, `/importacao`, `/licencas`, `/hospedagem`, `/horas-voo`, `/treinamentos/planejados`, `/treinamentos/solicitacoes`, `/relatorios`
