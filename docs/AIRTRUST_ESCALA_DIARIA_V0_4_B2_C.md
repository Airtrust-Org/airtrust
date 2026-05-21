# AIRTRUST v0.4-B2-c — Justificativa operacional estruturada na Escala Diária

## 1) Objetivo
Implementar trilha auditável mínima para justificativas operacionais da Escala Diária (EVD), substituindo a dependência exclusiva de `observacoes` quando houver revisão FRMS/operacional relevante.

## 2) Estado inicial
- Branch: `main`
- HEAD inicial da fase: `2b792197918fd528d1da7323ba04ffef52a2645e`
- `origin/main`: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind no início: `0 3` (HEAD local 3 commits à frente de `origin/main`)
- Working tree inicial: sem tracked modified; docs locais untracked pré-existentes.

## 3) Migration criada (local, não aplicada remotamente)
Arquivo criado:
- `worker-airtrust/migrations/0370_create_escala_voo_diaria_justificativas.sql`

Tabela:
- `escala_voo_diaria_justificativas`

Campos:
- `id` (PK)
- `empresa_id`
- `escala_voo_diaria_id`
- `funcionario_id` (opcional)
- `papel` (PIC/SIC/OUTRO)
- `origem_alerta` (FRMS/REPOUSO/DUPLICIDADE/OPERACIONAL/OUTRO)
- `tipo_alerta` (opcional)
- `nivel_alerta` (opcional)
- `decisao` (MANTER_ESCALA/SUBSTITUIR/ACIONAR_STANDBY/ADICIONAR_OBSERVACAO/OUTRO)
- `justificativa` (obrigatória)
- `alerta_ref_id` (opcional)
- `criado_por` (opcional)
- `created_at`
- `deleted_at`

Índices:
- `(empresa_id, escala_voo_diaria_id)`
- `(empresa_id, funcionario_id)`
- `(empresa_id, created_at)`

## 4) Endpoints criados/ajustados
Arquivo:
- `worker-airtrust/src/routes/escalas-evd.ts`

Novos endpoints:
- `GET /api/evd/:id/justificativas`
  - Lista justificativas não deletadas do item EVD, ordenadas por `created_at DESC`.
- `POST /api/evd/:id/justificativas`
  - Cria justificativa estruturada com validação `zod` estrita (`.strict()`).

Ajuste no endpoint de publicação:
- `POST /api/evd/:id/publicar`
  - Continua validando bloqueios duros existentes.
  - Passa a aceitar body opcional:
    - `require_justificativa?: boolean`
    - `justificativa?: { ...payload estruturado... }`
  - Se `justificativa` vier no body, persiste na tabela estruturada antes da publicação.
  - Se `require_justificativa = true`, exige justificativa estruturada já existente **ou** fallback legado em `observacoes` (>= 10 chars).

## 5) Regra de privacidade
- A Escala Diária permanece exibindo apenas sinais operacionais resumidos FRMS.
- Não foram adicionados campos sensíveis de check-in (KSS, sono detalhado, sintomas, meds/álcool, texto clínico) ao contrato da escala.
- O endpoint de justificativa usa schema estrito com apenas campos operacionais previstos.

## 6) Vínculo da justificativa ao EVD
- Cada justificativa é vinculada por `escala_voo_diaria_id` + `empresa_id`.
- Permite rastreio por item de escala, data e tripulante relacionado.

## 7) Compatibilidade com `observacoes`
- `observacoes` permanece como campo de observações gerais.
- Em publicação com `require_justificativa=true`, `observacoes` segue como fallback transitório apenas quando não houver justificativa estruturada.
- Fonte preferencial passa a ser `escala_voo_diaria_justificativas`.

## 8) Limitações desta fase
- Sem publicação versionada completa.
- Sem PDF oficial.
- Sem integração de envio (e-mail/WhatsApp).
- Sem validações estruturais adicionais de qualificação AW139/SK76, comandante/copiloto e disponibilidade mensal.
- Sem mudanças em FRMS core e sem mudanças em SIGVOOS/cron.

## 9) Próximos passos sugeridos
1. B2-c1: exigir justificativa estruturada obrigatória em todos os cenários de override (sem fallback legado) após janela de transição.
2. B2-c2: validações de elegibilidade operacional (qualificação AW139/SK76, comandante/copiloto e disponibilidade mensal).
3. B3: publicação versionada e trilha de snapshots da escala diária.
4. B3/B4: exportação PDF e fluxo de distribuição controlado.
