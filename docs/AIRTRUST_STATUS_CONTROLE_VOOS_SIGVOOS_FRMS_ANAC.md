# AirTrust — Resumo Executivo: Controle de Voos N1, SIGVOOS, FRMS & Preparação ANAC

**Data:** 2026-06-14
**Classificação:** Interno — NÃO submeter à ANAC
**Propósito:** Visão consolidada do estado atual das 4 frentes interligadas, sem implementação.

---

## 1. Estado Atual do Controle de Voos N1

- **Nível atual:** N1 parcial / pronto com ressalvas para piloto interno controlado.
  - Telas principais (Dashboard OCC, Lista de voos, Detalhe de voo, Lista de RDV, Detalhe de RDV): conectadas à API real e operando como N1 operacional interno.
  - Telas auxiliares (Jornadas, Indisponibilidades, Hangaragem, Relatórios, Tabelas auxiliares): ainda demonstrativas com dados mock.
  - Pendências de governança: banner N1 e marcadores "demonstrativo" não aplicados em todas as telas; lookups de aircraft/type/nature/responsible exibem IDs raw.
- **Nível alvo:** N1 completo (operacional interno, dados reais, persistência em produção, sem obrigação formal de evidência).
- **O módulo NÃO é regulado, NÃO é fiscal, NÃO é autorizado pela ANAC e NÃO substitui Sigvoos/APUS/papel/eDB/SDRMe.**
- **Verificação N1 end-to-end:** **Pronto com ressalvas** para piloto interno controlado.
- **Ambiente recomendado para piloto:** Preview/staging com acesso restrito (Opção B). Produção com feature flag (Opção C) reservada para Fase 2.
- **Migração 0410 (`0410_controle_voos_n1_schema.sql`):** Criada e testada. PODE aplicar em local e preview/staging aprovado. PROIBIDA em produção sem decisão explícita separada.

### O que já está implementado

| Camada | Item | Status |
|--------|------|--------|
| Backend | Migration 0410 com 8+ tabelas `cv_*` | ✅ |
| Backend | 24 endpoints REST em `/api/controle-voos` | ✅ |
| Backend | RBAC + tenant isolation (`empresa_id`) | ✅ |
| Testes | 36/36 route tests passando | ✅ |
| Testes | 11/11 migration tests passando | ✅ |
| Testes | 7/7 migration governance tests passando | ✅ |
| Build | `tsc --noEmit`, `npm run build`, `npm run lint` | ✅ |
| Frontend | Dashboard OCC conectado à API real | ✅ |
| Frontend | Lista de voos conectada à API real | ✅ |
| Frontend | Detalhe de voo conectado à API real | ✅ |
| Frontend | Lista de RDV conectada à API real | ✅ |
| Frontend | Detalhe de RDV com create/edit/finalize end-to-end | ✅ |
| Frontend | Banner N1 nas telas conectadas | ✅ |
| Seed | Dados iniciais para ambiente local | ✅ |

### O que ainda NÃO está implementado

| Item | Estado |
|------|--------|
| Atribuição de tripulantes no detalhe de voo | ❌ Placeholder "não disponível no N1" |
| IDs de aeronave/tipo/natureza/responsável exibidos como raw | ❌ Falta lookup |
| Lista de RDV lista voos, não RDVs (label incorreto) | ❌ |
| Telas Jornadas, Indisponibilidades, Hangaragem | ❌ Ainda demonstrativas (mock) |
| Tela Relatórios | ❌ Ainda demonstrativa |
| Tela Tabelas auxiliares | ❌ Ainda demonstrativa |
| Banner N1 em TODAS as telas reais (dashboard ainda mostra "prototype") | ❌ |
| Marcador visual explícito nas telas demonstrativas | ❌ |
| Lookup de aircraft/type/nature/responsible por nome | ❌ |
| Fechamento completo de governança N1 (banners + demo markers) | ❌ |

---

## 2. Estado do Piloto Interno Controlado

- **Decisão de ambiente:** Preview/staging com acesso restrito (confirmado em 2026-06-14).
- **Duração recomendada:** 5 dias consecutivos (Dia 0 preparação → Dia 5 Go/No-Go).
- **Participantes previstos:** 1 gestor operacional, 1-2 OCC, 1 piloto observador, 1 admin técnico, 1 product owner, 1 suporte técnico.
- **Checklist pré-piloto:** 12 itens definidos (ambiente, migration, dados, usuários, permissões, banners, comunicação, rollback, stop criteria, suporte, voos selecionados, sponsor confirma fluxo legado).
- **Roteiro operacional diário:** 15 passos por voo + 5 passos de fechamento diário.

### Critérios de Parada (Stop)

O piloto deve ser **imediatamente interrompido** se:
1. Usuário achar que o módulo substitui sistema oficial
2. Ocorrer erro cross-tenant
3. Houver perda de dados
4. Uso como evidência oficial
5. Divergência operacional crítica
6. Falha de permissão
7. Instabilidade severa

### Rollback

Plano de 7 passos: desabilitar acesso → parar entrada de dados → declarar dados sem valor oficial → preservar para análise → retornar ao Sigvoos/APUS/papel → registrar causa → condições para reinício.

### Evidências a Coletar

4 categorias: Operacional (fluxos, RDVs, tempos, divergências), Governança (comunicações, aceitação, registros), Técnica (logs, incidentes, screenshots, tenant isolation), Futura ANAC (disciplina de escopo, rastreabilidade).

---

## 3. Relação com SIGVOOS

- **Estado atual:** SIGVOOS é a fonte canônica operacional atual do FRMS. A Fase 0 de planejamento está **FECHADA**.
- **Implementação BLOQUEADA** até confirmação do fornecedor SIGVOOS sobre existência de ID imutável de voo/trecho/jornada.
- **Descoberta crítica:** Não existe ID estável de voo/trecho/jornada no normalizador atual. O `identificadorSigvoos` identifica tripulante, NÃO voo.
- **Chave composta provisória** definida como hash de 8 campos (empresa_id + data + prefixo + matrícula + origem + destino + ETD + ETA). Inferior a ID nativo.
- **24 perguntas obrigatórias** a enviar ao fornecedor SIGVOOS (IDs, paginação, rate limits, timezone, estados, cancelamentos, alterações, sandbox).
- **Estratégia shadow mode:** SIGVOOS → staging → `cv_*` → cv-frms-adapter → `frms_jornada.origem='CONTROLE_VOOS'` → cálculo sombra (NÃO operacional). Turn só após 11 gates incluindo 7 dias consecutivos sem divergência crítica.
- **Regras de edição manual:** 7 regras + 6 flags de estado (`IMPORTADO_SIGVOOS`, `EDITADO_AIRTRUST`, `CONFLITO_SIGVOOS`, `VALIDADO_AIRTRUST`, `IGNORADO_SIGVOOS`, `SUBSTITUIDO_SIGVOOS`).

---

## 4. Relação com FRMS

- **Estado atual:** FRMS operacional N1 (check-in, score, histórico FIRA/Sigvoos, read-ack, eventos dedicados). **NÃO é SGRF aprovado.**
- **Distinção crítica:** FRMS AirTrust = ferramenta de suporte operacional (cálculo de fadiga, visualização). SGRF (definido por RBAC 117.61 / IS 117-004) só existe quando o operador tem GRF formalmente aceito pela ANAC. Chamar FRMS de "SGRF" sem aceitação = **não conformidade direta com RBAC 117** e risco grave de segurança/legal.
- **Arquitetura futura:** Controle de Voos será a fonte canônica ÚNICA para FRMS após o turn. SIGVOOS passará a ser apenas origem de importação externa.
- **Jornada atual:** Dados vêm do Sigvoos (planejado). Captura de jornada real via RDV é parcial. Documento GRF não existe.
- **11 critérios mínimos para liberar o turn:** 0 divergências críticas, 0 tripulantes não mapeados, 0 voos duplicados, 0 jornadas duplicadas, cancelamentos/remoções corretos, timezone validado, reprocessamento reproduzível, divergências justificadas e aprovadas, alertas/violações equivalentes, acumuladores 7d/28d/365d equivalentes, mínimo 7 dias consecutivos sem divergência crítica.

---

## 5. Relação com Preparação ANAC

- **Estado atual:** Dossiê regulatório existe (v1.0, 2026-06-14). 18 normas oficiais mapeadas. 92 requisitos categorizados. 23 perguntas pendentes. Nenhum consultor contratado. Nenhuma conversa com ANAC realizada.
- **Plano mestre ANAC (2026-06-14):** 3 trilhas (Regulatória/Produto/Técnica), 6 opções de escopo, roadmap 30/60/90/180 dias, 13 decisões bloqueadoras.
- **Opção de escopo recomendada:** Opção C — Controle de Voos N1 (primeiro). eDB e SDRMe adiados.
- **Decisões bloqueadoras (13):** Tipo de assinatura (ICP/Gov.br/CANAC), assinatura offline, PWA vs app nativo, fonte oficial (RDV vs eDB vs MRO), piloto operador, período paralelo papel+digital, cache fiscal PED 30 dias, restore em staging descartável, modo de fiscalização, formato de exportação, caminho Art. 3º (ISO 27000/Blockchain/cópia DB ANAC), contratação de consultor regulatório.
- **Records Core:** Existe apenas como migration experimental (`migrations_experimental/`). NÃO deve avançar além de hardening mínimo sem consumidor real (Controle de Voos N1 NÃO é consumidor de Records Core regulado).
- **Roadmap para primeira conversa com ANAC:** 180 dias, após consultor, decisões e pacote de evidências.

---

## 6. O Que Está Proibido Fazer Agora

### Em todas as frentes
1. ❌ Dizer "homologado", "certificado", "regulado" ou "aprovado pela ANAC"
2. ❌ Chamar FRMS de "SGRF" (não conformidade RBAC 117)
3. ❌ Tratar dados de piloto como evidência oficial ou fiscal
4. ❌ Misturar mock com real silenciosamente
5. ❌ Usar protótipos como oficiais
6. ❌ Tratar PDF como registro primário (sem Records Core)

### Controle de Voos N1
7. ❌ Aplicar migration 0410 em produção sem decisão explícita separada
8. ❌ Implementar eDB, SDRMe, assinatura, MRO, RAS, tablet/offline
9. ❌ Chamar ANAC dizendo que está pronto
10. ❌ Substituir papel/Sigvoos/APUS antes da aprovação do shadow mode
11. ❌ Expandir escopo além do MVP N1 antes do piloto

### SIGVOOS
12. ❌ Usar chave composta provisória como decisão definitiva silenciosa
13. ❌ Colocar payload raw como fonte canônica em `cv_voos`
14. ❌ Sobrescrever campos editados manualmente
15. ❌ Ativar duas fontes canônicas operacionais simultaneamente
16. ❌ Desligar fluxo legado antes da aprovação do shadow mode

### ANAC
17. ❌ Mover migration experimental do Records Core para canônica
18. ❌ Aplicar migration experimental em staging/produção
19. ❌ Implementar assinatura offline antes das decisões
20. ❌ Criar app tablet/PWA regulado
21. ❌ Expandir Records Core sem consumidor real

---

## 7. Próximos Marcos Macro (30/60/90/180 dias)

### 30 dias (até ~2026-07-14)
1. **Fechar governança N1 pendente** — banner N1 em todas as telas reais, marcador "demonstrativo" nas telas mock, lookup de aircraft/type/nature
2. **Decidir escopo ANAC inicial** — confirmar Opção C (Controle de Voos N1 primeiro) e priorizar matriz de 23 dúvidas
3. **Enviar 24 perguntas ao fornecedor SIGVOOS** — obter resposta formal por escrito
4. **Iniciar threat model** de segurança para trilha técnica
5. **Preparar ambiente de preview/staging** para piloto controlado

### 60 dias (até ~2026-08-14)
6. **Executar piloto interno controlado de 5 dias** — preview/staging, usuários reais, coleta de evidências
7. **Decidir Go/No-Go pós-piloto** — com base nos critérios de sucesso e parada
8. **MVP Controle de Voos com dados reais** — se Go, promover correções e iniciar N1 real
9. **Hardening Records Core Fase 1** — mínimo para suportar futuro consumidor

### 90 dias (até ~2026-09-14)
10. **Decidir contratação de consultor regulatório ANAC**
11. **Definir caminho Art. 3º** (ISO 27000 / Blockchain / cópia DB ANAC)
12. **Plano de conversa com ANAC** — roteiro, participantes, pauta
13. **Restore drill em staging descartável** — validar BACKUP-002
14. **Shadow mode SIGVOOS → Controle de Voos → FRMS** — se ID SIGVOOS confirmado

### 180 dias (até ~2026-12-14)
15. **Primeira conversa exploratória com ANAC/POI** — após consultor + decisões + pacote de evidências
16. **Piloto operador identificado** — operador parceiro para período paralelo papel+digital
17. **Decidir assinatura e offline** — ICP-Brasil vs Gov.br vs CANAC, PWA vs nativo
18. **Avaliar promoção do Records Core** de experimental para migration regular de dev

---

## 8. Riscos Principais

| Risco | Severidade | Frente | Mitigação |
|-------|-----------|--------|-----------|
| Confusão entre RDV operacional e sistema oficial | **Crítico** | CV N1 | Banners, comunicação, stop criteria |
| Erro cross-tenant em `cv_*` | **Crítico** | CV N1 | `WHERE empresa_id = ?` em TODAS queries |
| Uso do FRMS como "SGRF" sem aceitação ANAC | **Crítico** | FRMS | Comunicação explícita, documentação |
| Fornecedor SIGVOOS não confirmar ID imutável | **Alto** | SIGVOOS | Chave composta provisória + risco documentado |
| Scope creep para eDB/SDRMe antes do momento certo | **Alto** | ANAC | Proibições explícitas, governança de escopo |
| Piloto gerar evidência tratada como oficial | **Alto** | CV N1 | Declaração explícita, preservação separada |
| Migration 0410 aplicada em produção sem autorização | **Alto** | CV N1 | Gate explícito, aprovação documentada |
| Divergência operacional entre Controle de Voos e Sigvoos | **Médio** | SIGVOOS | Shadow mode, 11 gates, 7 dias sem divergência |
| Records Core sem consumidor real | **Médio** | ANAC | Hardening mínimo, não expandir |
| Dados mock e reais coexistindo sem demarcação | **Médio** | CV N1 | Marcadores visuais, banners |
| Assinatura digital sem decisão de tipo | **Médio** | ANAC | Bloquear implementação até decisão |
| Perda de dados durante restore drill | **Médio** | ANAC | Staging descartável, isolado |

---

## 9. Resumo em 20 Bullets

1. **Controle de Voos N1** está **pronto com ressalvas** — 36 testes passam, build passa, telas principais conectadas à API real.
2. O **piloto interno controlado** de 5 dias está planejado para preview/staging, NÃO produção.
3. **6 telas ainda são demonstrativas** (Jornadas, Indisponibilidades, Hangaragem, Relatórios, Tabelas auxiliares, e alguns placeholders).
4. **Banner N1 e marcadores "demonstrativo"** ainda não foram aplicados em todas as telas (bloqueador de governança).
5. **Migration 0410** NÃO pode ser aplicada em produção sem decisão explícita separada.
6. **SIGVOOS** é a fonte canônica atual do FRMS, mas a implementação da integração está **BLOQUEADA** até confirmação de ID imutável do fornecedor.
7. **Não existe ID estável de voo/trecho** no normalizador SIGVOOS atual — `identificadorSigvoos` identifica tripulante, não voo.
8. **24 perguntas obrigatórias** precisam ser enviadas ao fornecedor SIGVOOS antes de qualquer migration final.
9. **FRMS é ferramenta de suporte operacional, NÃO SGRF.** Chamar de SGRF sem GRF aceito pela ANAC = não conformidade RBAC 117.
10. **Controle de Voos será a fonte canônica única** para FRMS após o turn. Turn só após shadow mode com 11 gates (incluindo 7 dias sem divergência).
11. **Dossiê ANAC** existe com 18 normas mapeadas, 92 requisitos, 23 perguntas pendentes.
12. **Nenhum consultor regulatório** foi contratado. Nenhuma conversa com ANAC foi realizada.
13. **13 decisões bloqueadoras** precisam ser tomadas (assinatura, offline, PWA vs nativo, fonte oficial, etc.).
14. **Records Core** existe apenas como migration experimental — NÃO expandir sem consumidor real.
15. **Opção de escopo recomendada:** Opção C — Controle de Voos N1 primeiro. eDB e SDRMe adiados.
16. **Roadmap para primeira conversa com ANAC:** 180 dias.
17. **10 proibições explícitas** de governança no MVP Spec (não usar termos regulados, não remover banners, etc.).
18. **Estratégia shadow mode** definida para SIGVOOS → Controle de Voos → FRMS com 15 passos de implementação.
19. **Chave composta provisória** existe como fallback, mas é inferior a ID nativo e requer risco documentado.
20. **Nenhum deploy, commit, migration ou alteração de código** está autorizado como parte deste documento.

---

## 10. Próximos 5 Marcos Recomendados

| # | Marco | Frente | Dependências | Estimativa |
|---|-------|--------|-------------|------------|
| M1 | **Fechar governança N1 pendente** (banners, demo markers, lookups) | CV N1 | Nenhuma | ~1-2 semanas |
| M2 | **Enviar 24 perguntas ao fornecedor SIGVOOS** e aguardar resposta | SIGVOOS | Contato com fornecedor | ~2-4 semanas |
| M3 | **Executar piloto interno controlado de 5 dias** em preview/staging | CV N1 | M1 + ambiente staging preparado | ~1 semana |
| M4 | **Decidir Go/No-Go pós-piloto** e planejar N1 real (se Go) | CV N1 | M3 concluído | ~1 semana |
| M5 | **Contratar consultor regulatório ANAC** e definir caminho Art. 3º | ANAC | Decisão de investimento | ~4-8 semanas |

---

## 11. Sugestão de Commit

```
docs(status): executive summary of Controle de Voos N1, SIGVOOS, FRMS & ANAC

Consolidates current state across 4 fronts:
- Controle de Voos N1: pronto com ressalvas, piloto planejado
- SIGVOOS: Fase 0 fechada, implementação bloqueada até ID confirmation
- FRMS: operacional N1, NÃO SGRF, turn futuro via shadow mode
- ANAC: dossiê com 92 requisitos, 23 perguntas pendentes, 180d até 1ª conversa

No code, no deploy, no migrations. Documentation only.
```

---

**Documento criado por:** Claude Code
**Arquivos de referência:** `CONTROLE_DE_VOOS_N1_MVP_SPEC.md`, `CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md`, `CONTROLE_DE_VOOS_N1_END_TO_END_READINESS.md`, `CONTROLE_DE_VOOS_N1_PILOTO_INTERNO_CONTROLADO.md`, `CONTROLE_DE_VOOS_N1_PILOTO_EXECUCAO_CHECKLIST.md`, `CONTROLE_DE_VOOS_N1_DECISAO_AMBIENTE_PILOTO_E_EVIDENCIAS.md`, `DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`, `AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md`, `DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md`
