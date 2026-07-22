# AIRTRUST v0.5-H30-C — Benchmark e instrumentação da query de sessões

Data: 2026-05-26  
Fase: benchmark read-only (sem writes, sem migration, sem alteração de contrato)

## 1. Objetivo
Medir com segurança o custo do endpoint `GET /api/simuladores/sessoes`, comparando:
- modo default (payload detalhado, com agregações JSON);
- modo `view=summary` (payload leve, sem `json_group_array`).

Esta fase **não** reescreve a query detalhada nem altera frontend.

## 2. Estado atual do endpoint
Arquivo de referência: [simuladores-sessoes.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/simuladores-sessoes.ts)

- Default:
  - mantém payload completo com `participantes` e `fichas`;
  - usa agregações JSON (`json_group_array`) e múltiplos `JOIN`s;
  - mantém envelope `{ success, data, pagination }`.
- Summary (`view=summary`):
  - evita agregações JSON pesadas;
  - preserva filtros/paginação/tenant/permissões;
  - preserva envelope de resposta e mantém `participantes`/`fichas` como arrays vazios.

## 3. Script de benchmark criado
Script read-only: [benchmark-simuladores-sessoes.sh](<AIRTRUST_ROOT>/scripts/validation/benchmark-simuladores-sessoes.sh)

Uso:
```bash
BASE=https://api.airtrust.online LIMIT=100 OFFSET=0 bash scripts/validation/benchmark-simuladores-sessoes.sh
```

Parâmetros suportados:
- `BASE` (default: `https://api.airtrust.online`)
- `ENDPOINT` (default: `/api/simuladores/sessoes`)
- `LIMIT` / `OFFSET`
- `ROUNDS` (default: `3`)
- `TIMEOUT_SECONDS`
- `DATA_INICIO` / `DATA_FIM` (opcional)
- autenticação:
  - `AUTH_BEARER` (token explícito), ou
  - `AIRTRUST_SMOKE_EMAIL` + `AIRTRUST_SMOKE_PASSWORD` (login automático read-only para obter token)

Métricas coletadas por chamada:
- `http_code`
- `time_total`
- `size_download`
- `success`
- presença de `pagination`
- `data_count` (quando disponível)
- `auth_required`

## 4. Resultado de benchmark (execução desta fase)
Ambiente medido:
- Produção (`BASE=https://api.airtrust.online`)
- Sem credenciais disponíveis no ambiente de execução

Resultado observado (default e summary):
- `http_code=401`
- `success=false`
- `error=Token de autenticação não fornecido`
- `auth_required=true`
- `size_download=140 bytes` (payload de erro equivalente)

Conclusão da medição desta fase:
- endpoint está protegido por auth (comportamento esperado);
- benchmark funcional de payload/latência de dados reais (`success=true`) ficou **limitado por ausência de credenciais**;
- não houve writes nem impacto operacional.

## 5. Conclusão técnica
- O modo `view=summary` permanece a estratégia segura para reduzir custo em telas leves sem quebrar contrato default.
- Não há evidência nova para reescrever a query detalhada neste momento.
- Decisão recomendada: só abrir H30-D (otimização estrutural) com benchmark autenticado reproduzível (prod read-only com credencial de smoke ou ambiente controlado equivalente).

## 6. Próximo passo recomendado
1. Executar o mesmo benchmark com autenticação read-only para capturar `default vs summary` com `success=true`.
2. Se os números justificarem, abrir H30-D com otimização incremental da query detalhada (sem quebrar contrato default).
3. Se não justificar, priorizar H32 (testes por domínio) e manter summary como caminho recomendado para consumo leve.
