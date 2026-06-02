# AirTrust Remediation Roadmap v0.5

Data: 2026-06-02
Branch auditada: `main`
HEAD auditado: `300ecb9b036d153c0da5fa654e7083f09fee412b`
Modo: roadmap tecnico-operacional atualizado apos Sprint A sem migration, sem dados reais e sem deploy.

## Agora, antes de qualquer novo cliente externo

### Item 1 - RBAC de plataforma e suporte

- Status em 2026-06-02: Sprint A executado parcialmente em codigo, sem migration.
- Objetivo: remover a dependencia operacional de `userId === 1` e desenhar suporte read-only por tenant.
- Risco: acesso amplo demais para suporte e operacao multiempresa.
- Escopo: contrato de `platform_admin`, `support`, matriz minima de leitura e eventos auditados.
- Fora do escopo: criar empresa, criar usuario real, aplicar migration em producao.
- Resultado atual: fallback legado centralizado em `middleware/tenant.ts`; rotas deixam de comparar `userId === 1` diretamente; `support` permanece inativo.
- Documento de referencia: `docs/AIRTRUST_RBAC_SUPPORT_MODEL_v0_5.md`.
- Modelo recomendado para etapa final: GPT-5.5 Altissimo.
- Deploy necessario?: sim apenas quando a etapa final for implementada e aprovada.
- Migration necessaria?: sim para persistir `platform_admin`/`support`, escopo e auditoria.
- Pode ser GPT-5.4?: nao para implementacao sensivel.
- Precisa GPT-5.5?: sim.
- Criterio de aceite final: papel persistido, suporte read-only por tenant, trilha auditada, operador legado migrado e `LEGACY_PLATFORM_ADMIN_USER_ID` removido.

### Item 2 - Audit trail minimo por tenant

- Objetivo: definir writer canonico com `empresa_id`, `request_id`, ator e sanitizacao.
- Risco: trilha atual inconsistente e potencialmente inadequada para LGPD/compliance.
- Escopo: comparar `auditoria`, `audit_logs`, `auditoria_avancada_v2`, mapear eventos criticos e padrao de payload seguro.
- Fora do escopo: migration executada, purge real, alteracao em dados reais.
- Modelo recomendado: GPT-5.5 Alta.
- Deploy necessario?: nao nesta fase documental.
- Migration necessaria?: nao para o endurecimento minimo desta fase; sim para consolidacao final futura.
- Pode ser GPT-5.4?: somente para documentacao auxiliar.
- Precisa GPT-5.5?: sim.
- Resultado atual em 2026-06-02: camada `lib/audit` criada para sanitizacao conservadora; `auth`, `admin`, `assets` e `empresas` passaram a carregar contexto minimizado sem schema novo; `auditoria_avancada_v2` e call sites legados seguem como backlog.
- Criterio de aceite: writer canonico escolhido, campos minimos definidos, eventos criticos priorizados e lacunas sem schema separadas das que exigem schema.

### Item 3 - Data quality operacional

- Objetivo: sair de SQL validado estaticamente para execucao controlada e evidenciada.
- Risco: onboarding externo com tenant errado, dados orfaos ou metricas inconsistentes.
- Escopo: checklist de execucao local/staging, classificacao blocker/warn/info, registro sem PII.
- Fora do escopo: rodar via Codex em producao, seed, importacao ou mutacao de dados.
- Modelo recomendado: GPT-5.4 Alta.
- Deploy necessario?: nao.
- Migration necessaria?: nao.
- Pode ser GPT-5.4?: sim.
- Precisa GPT-5.5?: nao.
- Criterio de aceite: operador autorizado consegue executar o pacote read-only em ambiente aprovado e registrar sumario sem PII.

### Item 4 - Blindagem operacional de modulos beta

- Objetivo: garantir que beta continue oculto/inativo para cliente externo ate cobertura e readiness suficientes.
- Risco: cliente acessar modulo incompleto, com fluxo confuso ou dados sensiveis mal contextualizados.
- Escopo: matriz de liberacao, revisao de superficies demo e verificacao de textos como `em breve` e `dados de teste`.
- Fora do escopo: redesenho amplo de UI ou liberacao comercial desses modulos.
- Modelo recomendado: GPT-5.4 Alta.
- Deploy necessario?: nao nesta fase documental.
- Migration necessaria?: nao.
- Pode ser GPT-5.4?: sim.
- Precisa GPT-5.5?: nao.
- Criterio de aceite: modulos beta/bloqueados seguem explicitamente fora do caminho de cliente externo.

## Antes de operar 2 empresas com cliente usando

### Item 5 - Smoke autenticado com empresa esperada

- Objetivo: fechar a validacao funcional ponta-a-ponta do tenant esperado.
- Risco: operar tenant errado ou liberar cliente sem contrato funcional minimo.
- Escopo: validar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO`, manter writes bloqueados.
- Fora do escopo: onboarding real, deploy, alteracao de dados.
- Modelo recomendado: GPT-5.4 Alta.
- Deploy necessario?: nao.
- Migration necessaria?: nao.
- Pode ser GPT-5.4?: sim.
- Precisa GPT-5.5?: nao.
- Criterio de aceite: smoke autenticado read-only executado com evidencia sanitizada e empresa esperada confirmada.

### Item 6 - Readiness de suporte/diagnostico por tenant

- Objetivo: ter roteiro de diagnostico sem depender de acesso amplo informal.
- Risco: suporte operar no tenant errado ou sem trilha minima.
- Escopo: runbook de suporte, sinais minimos por tenant, consultas/read models operacionais.
- Fora do escopo: painel final de suporte em producao.
- Modelo recomendado: GPT-5.5 Alta.
- Deploy necessario?: nao nesta fase documental.
- Migration necessaria?: possivelmente.
- Pode ser GPT-5.4?: nao para o desenho sensivel.
- Precisa GPT-5.5?: sim.
- Criterio de aceite: suporte consegue diagnosticar tenant sem ambiguidade de escopo e com acao auditavel.

## Antes de 5 empresas

### Item 7 - Remocao do DDL runtime residual

- Objetivo: remover `ensure*` residuais de SIGVOOS, treinamentos planejados, documentos e legados de qualificacoes.
- Risco: drift de schema, lock operacional e comportamento divergente por ambiente/tenant.
- Escopo: plano de migrations explicitas, ordem segura de remocao e testes de regressao.
- Fora do escopo: executar migration nesta fase.
- Modelo recomendado: GPT-5.5 Altissimo.
- Deploy necessario?: sim, quando implementado.
- Migration necessaria?: sim.
- Pode ser GPT-5.4?: nao para implementacao real.
- Precisa GPT-5.5?: sim.
- Criterio de aceite: cada ensure residual tem migration correspondente planejada, call sites mapeados e sequencia de corte aprovada.

### Item 8 - Status enum central

- Objetivo: centralizar status criticos e reduzir risco de contagem/filtro divergente.
- Risco: metricas incorretas e regras diferentes entre worker e frontend.
- Escopo: enum compartilhado por dominio, migracao incremental das queries de metrica e contagem.
- Fora do escopo: normalizacao total de todos os status historicos no banco.
- Modelo recomendado: GPT-5.4 Alta.
- Resultado atual em 2026-06-02: Sprint C executado sem migration na camada critica do worker; `dashboardService`, simuladores, qualificacoes e treinamentos planejados passaram a consumir helpers centrais de compatibilidade; leitura aceita `CONCLUIDA/CONCLUIDO`, `CANCELADA/CANCELADO`, `PLANEJADA/PLANEJADO`, `AGENDADO/AGENDADA` e `PENDENTE/PENDING` nos pontos cobertos.
- Deploy necessario?: sim, apenas quando houver decisao explicita de publicar runtime alterado apos validacao final completa.
- Migration necessaria?: nao para a primeira etapa.
- Pode ser GPT-5.4?: sim.
- Precisa GPT-5.5?: nao.
- Documento de referencia: `docs/AIRTRUST_STATUS_ENUM_COMPATIBILITY_v0_5.md`.
- Criterio de aceite: caminhos criticos deixam de usar strings literais soltas e passam a referenciar um contrato central.

### Item 9 - Testes dos modulos beta/ocultos

- Objetivo: subir a cobertura minima de Hospedagem, SGSO, LMS/EAD e EVD.
- Risco: regressao silenciosa em dominios hoje pouco observados.
- Escopo: tenant-scope, leitura/escrita critica, contratos de erro e estados de negocio principais.
- Fora do escopo: cobertura exaustiva de UI e2e ampla.
- Modelo recomendado: GPT-5.4 Alta.
- Deploy necessario?: sim, quando implementado.
- Migration necessaria?: nao.
- Pode ser GPT-5.4?: sim.
- Precisa GPT-5.5?: nao.
- Criterio de aceite: Hospedagem deixa de ter 0 testes e os demais modulos ganham cobertura minima dos fluxos criticos.

## Antes de 10 empresas

### Item 10 - Repository pilot em dominio critico

- Objetivo: reduzir o acoplamento entre regra, SQL e HTTP onde o retorno e maior.
- Risco: cada nova feature ampliar superficie de regressao em arquivos gigantes e SQL inline.
- Escopo: escolher um dominio piloto, provavelmente `dashboard`, `escalas` ou `qualificacoes`.
- Fora do escopo: refatoracao total do worker.
- Modelo recomendado: GPT-5.4 Alta.
- Deploy necessario?: sim, quando implementado.
- Migration necessaria?: nao.
- Pode ser GPT-5.4?: sim.
- Precisa GPT-5.5?: nao.
- Criterio de aceite: um dominio passa a ter acesso a dados centralizado, com testes protegendo o contrato.

### Item 11 - Observabilidade multiempresa

- Objetivo: criar diagnostico operacional por tenant e trilhas de suporte consistentes.
- Risco: expansao sem visibilidade de degradacao por empresa.
- Escopo: sinais por tenant, request correlation, falhas por modulo, limites operacionais.
- Fora do escopo: plataforma completa de observabilidade externa.
- Modelo recomendado: GPT-5.5 Alta.
- Deploy necessario?: sim, quando implementado.
- Migration necessaria?: possivelmente.
- Pode ser GPT-5.4?: somente para docs auxiliares.
- Precisa GPT-5.5?: sim.
- Criterio de aceite: equipe consegue responder "qual tenant, qual request, qual modulo, qual ator" sem ambiguidade.

## Pode esperar

### Item 12 - Refatoracao estrutural ampla

- Objetivo: quebrar arquivos gigantes e reduzir sprawl tecnico.
- Risco: manutencao cara, mas sem bloquear piloto atual isoladamente.
- Escopo: FRMS, SGSO, dashboard, empresas-usuarios e outros hotspots.
- Fora do escopo: freeze de produto.
- Modelo recomendado: GPT-5.4 Alta.
- Deploy necessario?: sim, quando implementado.
- Migration necessaria?: nao.
- Pode ser GPT-5.4?: sim.
- Precisa GPT-5.5?: nao.
- Criterio de aceite: dominios prioritarios ficam menores e com responsabilidades mais claras.

## Nao fazer agora

### Item 13 - Cutover Supabase

- Objetivo: adiar migracao de plataforma ate fechar auth, audit trail, DDL residual e readiness multiempresa.
- Risco: iniciar agora multiplica mudanca estrutural antes de estabilizar o contrato atual.
- Escopo: somente feasibility audit e ordem futura de migracao.
- Fora do escopo: mover schema, dados reais, auth ou storage para Supabase.
- Modelo recomendado: GPT-5.5 Altissimo.
- Deploy necessario?: nao agora.
- Migration necessaria?: sim, em eventual projeto futuro.
- Pode ser GPT-5.4?: nao para cutover; sim para analise documental leve.
- Precisa GPT-5.5?: sim.
- Criterio de aceite: existe apenas um plano futuro de avaliacao, nao uma migracao em andamento.
