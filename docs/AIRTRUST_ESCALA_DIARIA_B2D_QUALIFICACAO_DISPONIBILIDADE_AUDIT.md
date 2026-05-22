# AIRTRUST v0.4-B2-d — Auditoria dirigida de qualificação, função PIC/SIC e disponibilidade mensal

## 1) Metadados Git
- Data da auditoria: 2026-05-21
- Branch: `main`
- HEAD: `3de4e11704d27b2349faaf4f7b3a396cad5fac4c`
- `origin/main`: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind (`origin/main...HEAD`): `0 4`
- Estado do working tree no início: sem `tracked modified`; apenas docs locais `untracked`.

Nota: esta auditoria foi executada em `HEAD` local à frente de `origin/main`.

## 2) Fontes de dados encontradas
### Backend (rotas)
- `worker-airtrust/src/routes/escalas-evd.ts`
- `worker-airtrust/src/routes/escalas/index.ts`
- `worker-airtrust/src/routes/escalas-pilotos.ts`
- `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts`
- `worker-airtrust/src/routes/escalas-disponibilidade.ts`
- `worker-airtrust/src/routes/escalas-alocacoes-helpers-internal.ts`
- `worker-airtrust/src/routes/escalas-situacoes.ts`
- `worker-airtrust/src/routes/aeronaves.ts`
- `worker-airtrust/src/routes/modelos-aeronave.ts`
- `worker-airtrust/src/routes/funcionarios.ts`
- `worker-airtrust/src/shared/getTripulanteOperacional.ts`

### Frontend
- `src/react-app/pages/escalas/EvdPage.tsx`
- `src/react-app/hooks/useEscalas.ts`
- `src/react-app/pages/escalas/components/Modais/tripulacao-utils.ts`

### Migrations / schema
- `worker-airtrust/migrations/0279_create_escala_voo_diaria.sql`
- `worker-airtrust/migrations/0250_escala_alocacoes.sql`
- `worker-airtrust/migrations/0251_escala_cobertura_diaria.sql`
- `worker-airtrust/migrations/0256_situacoes_sem_aeronave.sql`
- `worker-airtrust/migrations/0229_add_escalas_quinzenas.sql`
- `worker-airtrust/migrations/0247_funcionario_quinzena.sql`
- `worker-airtrust/migrations/0185_fix_funcionarios_modelo_aeronave_id_to_integer.sql`
- `worker-airtrust/migrations/0236_normalize_sk76_funcionarios.sql`
- `worker-airtrust/migrations/0136_rebuild_all_funcionarios_old_refs.sql` (tabela `funcionarios_aeronaves`)
- `worker-airtrust/migrations/0000_production_schema.sql` (baseline legado)

## 3) Cadastro de tripulantes
### Onde está
- Cadastro principal: tabela `funcionarios`.
- Relação operacional por aeronave: `funcionarios_aeronaves` (com `data_inicio`, `data_fim`, `ativo`).
- Enriquecimento operacional consolidado: `getTripulanteOperacional` + `getHabilitacoesBatch`.

### Campos usados hoje para decisão operacional
- Identificação e status: `id`, `nome`, `guerra`, `matricula`, `status`, `ativo`, `empresa_id`.
- Papel textual: `funcao`, `cargo`.
- Modelo/habilitação legada: `modelo_aeronave_id`, `aeronave`.
- Quinzena: `funcionarios.quinzena` (migração 0247).
- Flags auxiliares: `is_instrutor`, `is_checador`.

### Endpoints de seleção para Escalas
- `GET /api/escalas/funcionarios/pilotos`
- `GET /api/escalas/tripulantes-operacionais`
- `GET /api/funcionarios` (usado no `EvdPage` atual para picker PIC/SIC)

## 4) Regra comandante/copiloto (PIC/SIC)
### Situação atual
- Não existe campo explícito e confiável tipo `pode_pic` / `pode_sic` no contrato EVD.
- `escalas-pilotos.ts` classifica piloto/comandante principalmente por `LIKE` textual em `cargo`/`funcao`.
- Frontend também faz inferência textual (`tripulacao-utils.ts`: `COP`, `COM`, `CMT`; fallbacks).
- No EVD atual (`EvdPage`), filtro local de seleção também é textual (`funcao` contém termos de piloto/comandante/PIC/SIC).

### Conclusão
- Fonte atual para distinguir comandante/copiloto existe, mas é **heurística textual**.
- É útil para priorização/UX, mas **não é base segura isolada para bloqueio duro regulatório** sem padronização de papéis.

## 5) Qualificação AW139/SK76
### Onde está a informação
- Cadastro de frota/modelos:
  - `aeronaves` (`prefixo`, `modelo`, `status`)
  - `modelos_aeronave` (normalização `S76`/`SK76` -> `SK76` em rota)
- Habilitação por tripulante:
  - atual/mais confiável: `funcionarios_aeronaves` + vínculo com `aeronaves` ativas (`getHabilitacoesBatch`)
  - legado/fallback: `funcionarios.modelo_aeronave_id`, `funcionarios.aeronave`
- Validação já existente no módulo Escalas Mensais:
  - `verificarHabilitacaoModelo(...)` em `escalas-alocacoes-helpers-internal.ts`
  - considera aeronave ativa e compara aliases `SK76`/`S76`.

### Conclusão
- Há fonte confiável suficiente para bloquear por modelo **quando a aeronave está vinculada a cadastro mestre**.
- No EVD, `aeronave_prefixo`/`aeronave_modelo` ainda são texto livre; sem normalização prévia, o bloqueio pode gerar falso negativo/positivo.

## 6) Achados sobre “W” e “76”
### “76”
- Evidência consistente de uso de `S76`/`SK76` no código/migrations.
- Normalização explícita para `SK76` em múltiplos pontos (`modelos-aeronave`, migração 0236, validações de modelo).
- Conclusão: tratar “76” como alias operacional de SK76 é compatível com o código atual.

### “W”
- Não foi encontrada regra explícita de mapeamento `"W" => "AW139"` no código auditado.
- Busca literal por token `'W'`/`"W"` não retornou mapeamento de negócio.
- Conclusão: **não assumir `W` como AW139** na implementação.

## 7) Aeronaves/prefixos/modelo
### Situação atual
- `GET /api/aeronaves` lista aeronaves com `prefixo`, `modelo`, `status` e filtro opcional `somente_ativas`.
- `GET /api/escalas/tripulantes-operacionais` exige `aeronave_id` e resolve `modelo` operacional (`AW139`/`SK76`).
- EVD (`escala_voo_diaria`) persiste:
  - `aeronave_prefixo` (texto)
  - `aeronave_modelo` (texto)
  - sem FK obrigatória para `aeronaves`.

### Risco
- Divergência entre texto livre do EVD e cadastro mestre de aeronaves.
- Bloqueio por qualificação de modelo fica frágil se o EVD não resolver prefixo -> aeronave cadastrada.

## 8) Disponibilidade mensal (quinzena/folga/afastamentos)
### Estruturas encontradas
- `escalas_mensais`
- `escala_alocacoes`
- `escalas_quinzenas`
- `escala_cobertura_diaria`
- `escala_situacao_tipos`
- `funcionario_ferias`

### Como o sistema representa disponibilidade
- Alocação operacional e situações ficam em `escala_alocacoes`.
- Situações bloqueantes são dirigidas por `escala_situacao_tipos.bloqueia_alocacao`.
- Quinzena do funcionário em `funcionarios.quinzena` (+ referência por `quinzena_id` em alocações).
- Conflitos por período já são checados nas rotas de alocação e em `tripulantes-operacionais`.

### Endpoints úteis
- `GET /api/escalas/disponibilidade?funcionarios=...&data_inicio=...&data_fim=...`
  - consulta eventos publicados/aprovados na escala mensal.
- `GET /api/escalas/tripulantes-operacionais?...`
  - já retorna bloqueios por sobreposição/situação/férias em janela de datas.

### EVD x mensal
- EVD tem `escala_id` opcional (vínculo macro possível).
- Sem uso obrigatório de `escala_id` + sem validação cruzada por data, pode haver divergência entre EVD e escala mensal.

## 9) Status standby / não alocado
### Standby
- `STB` é tipo formal em `escala_situacao_tipos` com `bloqueia_alocacao = 0`.
- Há uso de `standby` no motor de alocações e conflitos.

### Não alocado
- Não há evidência de status persistido dedicado “não escalado” no núcleo.
- Hoje é mais seguro derivar “não alocado” por ausência de alocação ativa na janela + sem situação bloqueante.

## 10) Gaps de dados para bloqueios da próxima fase
1. Papel PIC/SIC confiável:
- gap: falta enum/campo canônico de papel operacional por tripulante para bloquear sem heurística textual.

2. Vínculo EVD com aeronave mestre:
- gap: EVD usa prefixo/modelo texto livre; ausência de `aeronave_id` reduz confiabilidade do bloqueio por qualificação.

3. Disponibilidade macro obrigatória na publicação EVD:
- gap: validação cruzada mensal não está imposta no fluxo EVD atual.

4. Qualificação vencida por modelo:
- gap parcial: há dados de validade em `qualificacoes_historico` e em alguns vínculos, mas regra de vencimento por modelo/função no EVD ainda não está fechada de ponta a ponta.

## 11) Riscos de falso bloqueio
- Inferência por `cargo/funcao` textual para comandante/copiloto.
- Prefixo/modelo digitado no EVD não correspondente ao cadastro real.
- Regras de quinzena tratadas como bloqueio duro sem considerar casos `personalizada`.
- Funcionário com dado legado incompleto (`modelo_aeronave_id`/`aeronave`) sem relação ativa em `funcionarios_aeronaves`.

## 12) Recomendação objetiva para B2-e
### Bloqueios duros implementáveis agora (com menor risco)
1. `PIC` e `SIC` obrigatórios na publicação (já existe).
2. `PIC != SIC` (já existe).
3. Duplicidade temporal de tripulante no mesmo dia/intervalo EVD (já existe).
4. Se `aeronave_prefixo` mapear para aeronave ativa cadastrada:
   - bloquear tripulante sem habilitação para o modelo (`AW139`/`SK76`) reutilizando lógica de `verificarHabilitacaoModelo`/aliases.
5. Bloquear uso de aeronave explicitamente inativa quando houver mapeamento por prefixo.

### Tratar como alerta com justificativa (não bloqueio) nesta etapa
1. Regra comandante/copiloto baseada apenas em texto (`funcao`/`cargo`).
2. Quinzena divergente (`primeira`/`segunda`) quando não houver conflito de período.
3. Falta de correspondência de modelo se o cadastro do tripulante vier só por dado legado ambíguo.

### Exigir preparação adicional antes de bloqueio duro
1. Papel canônico por tripulante (`pode_pic`/`pode_sic` ou equivalente).
2. Vínculo estruturado da EVD com aeronave cadastrada (`aeronave_id`) para bloquear de modo determinístico.
3. Regra oficial de qualificação vencida por modelo/função com fonte única.
4. Estratégia formal para “não alocado” (derivado vs persistido).

## 13) Arquivos candidatos para B2-e
### Backend
- `worker-airtrust/src/routes/escalas-evd.ts`
- `worker-airtrust/src/routes/escalas-alocacoes-helpers-internal.ts` (reuso de validação de habilitação)
- `worker-airtrust/src/shared/getTripulanteOperacional.ts` (reuso para resolução de habilitações/status)
- `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts` (se precisar endpoint auxiliar de elegibilidade)

### Frontend
- `src/react-app/pages/escalas/EvdPage.tsx`

### Possível (se B2-e optar por estruturar vínculo de aeronave)
- migration futura para adicionar referência estruturada de aeronave no EVD (não nesta fase B2-d).

## 14) Decisão final (bloquear x alertar x depois)
### Bloquear (B2-e)
- PIC/SIC obrigatórios e distintos.
- Duplicidade por intervalo.
- Aeronave inativa quando identificada via cadastro.
- Sem habilitação de modelo AW139/SK76 quando houver mapeamento confiável de aeronave.

### Alertar com justificativa (B2-e)
- Possível incompatibilidade comandante/copiloto inferida por texto.
- Divergência de quinzena/preferência operacional sem indisponibilidade real.

### Deixar para depois (B3+)
- Papel operacional canônico por tripulante para bloqueio comandante/copiloto sem heurística.
- Vínculo obrigatório da EVD com `aeronave_id`.
- Regra completa de validade de qualificação por modelo/função (vencida).
- Publicação versionada/PDF e demais fases de distribuição.
