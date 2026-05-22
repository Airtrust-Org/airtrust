# FRMS — Relatorio Completo de Implementacao e Correcao

**Data:** 11 de marco de 2026  
**Projeto:** AirTrust FRMS  
**Escopo:** consolidacao de tudo que foi executado nos prompts anteriores, incluindo calculo, banco, reprocessamento, validacao e correcao visual do heatmap.

---

## 1. Objetivo

Corrigir o modulo FRMS para que a efetividade deixasse de ficar artificialmente em 100%, passasse a refletir penalidades reais de fadiga e fosse exibida corretamente no dashboard, na ficha individual e no heatmap diario.

---

## 2. Linha do Tempo Consolidada

### Fase A — Sintoma inicial observado na UI

- O dashboard FRMS exibia quase todos os tripulantes como 100% ou verde constante.
- A tela indicava falta de variancia realista entre jornadas.
- O primeiro sintoma era calculo incorreto.

### Fase B — Correcao do motor de calculo

Foram identificados e corrigidos 3 bugs criticos no calculo de efetividade:

1. `fator_basica_pct` entrava no `total_fatorizado_jornada` com sinal positivo.
2. `fator_basica_pct` era inflado por um `x100` extra.
3. Seis fatores de penalidade tinham sinal invertido no default e/ou no banco.

Arquivos envolvidos:

- `worker-airtrust/src/lib/frms/calculos.ts`
- `worker-airtrust/src/lib/frms/types.ts`

### Fase C — Descoberta do override no banco

- Mesmo com o TypeScript corrigido, a producao ainda usava valores positivos armazenados em `frms_configuracao_limites`.
- Isso fazia o banco sobrescrever os defaults corretos do codigo.
- A restauracao de configuracoes padrao corrigiu os sinais persistidos no D1.

### Fase D — Descoberta do timeout no reprocessamento total

- O endpoint `POST /api/frms/reprocessar` rodava via `waitUntil`.
- Em producao, o Cloudflare Workers nao concluia o reprocessamento de todos os tripulantes antes do timeout.
- Resultado pratico: parte dos registros era recalculada, parte ficava com dados antigos.

### Fase E — Solucao operacional de reprocessamento

- Foi criado o endpoint sincrono `POST /api/frms/reprocessar/:tripulante_id`.
- Os 17 tripulantes ativos foram reprocessados individualmente.
- Os registros ativos deixaram de usar o calculo legado.

### Fase F — Correcao da rastreabilidade

- Foi criada a migration `0269_frms_effectiveness_fix_tracking.sql`.
- Ela adiciona `processado_com_bug` em `frms_fatorizacao_jornada`.
- Os registros antigos foram marcados com `1` e os novos registros reprocessados passaram a ser gravados com `0`.

### Fase G — Correcao do heatmap diario

- Mesmo com a API e o banco corretos, o heatmap ainda mostrava a mesma cor todos os dias para um mesmo tripulante.
- Causa raiz: o frontend usava um unico `effectiveness_pct` vindo de `acumulo-frota` e repetia esse snapshot em todas as celulas do periodo.
- Isso era um bug visual e semantico do heatmap, separado do motor de calculo.
- A API do heatmap passou a retornar `effectiveness_pct` e `effectiveness_nivel` por dia.
- O frontend passou a usar `dayData.effectiveness_pct` em cada celula.

---

## 3. Bugs Corrigidos

### 3.1 Bug de total sempre positivo

**Arquivo:** `worker-airtrust/src/lib/frms/calculos.ts`

Antes:

- `fator_basica_pct` era somado no total.
- Como ele e positivo, o total ficava enviesado para cima.
- A formula final clampava tudo em 100%.

Depois:

- `fator_basica_pct` ficou apenas como diagnostico.
- `total_fatorizado_jornada` passou a usar apenas penalidades reais.

### 3.2 Bug do `x100` extra

**Arquivo:** `worker-airtrust/src/lib/frms/calculos.ts`

Antes:

- `fator_basica_pct` podia ficar em escala incorreta.

Depois:

- passou a ser `duracaoMin / FDP_MAXIMO_HORAS * 60`, sem inflacao artificial.

### 3.3 Sinais invertidos de fadiga

**Arquivo:** `worker-airtrust/src/lib/frms/types.ts`

Corrigidos:

- `NOTURNO_FATOR`
- `CICLO_EMBARCADO_PCT_MAX`
- `APRESENTACAO_AMANHECER_FATOR`
- `HV_MUITAS_FATOR`
- `FATOR_BASE_AWAY_PCT`
- `FATOR_ACLIMATADO_NAO_PCT`

### 3.4 Bug visual do heatmap

**Arquivos:**

- `worker-airtrust/src/routes/frms.ts`
- `src/react-app/pages/frms/components/FrmsHeatmap.tsx`
- `src/react-app/pages/frms/FrmsDashboard.tsx`

Antes:

- o modo `Efetividade` do heatmap usava `effectivenessMap` por tripulante
- cada dia herdava o mesmo valor
- a curva visual nao respeitava a serie temporal real

Depois:

- o endpoint `/api/frms/heatmap` passou a retornar a efetividade diaria mais recente para cada `tripulante_id + data`
- o componente usa `dayData.effectiveness_pct` por celula
- dias sem jornada ou sem fatorizacao ficam sem dado, em vez de herdarem um valor global do tripulante

---

## 4. Alteracoes em Banco de Dados

### 4.1 Migration criada

**Arquivo:** `worker-airtrust/migrations/0269_frms_effectiveness_fix_tracking.sql`

Objetivos:

- adicionar `processado_com_bug`
- reforcar sinais negativos de configuracao no banco
- marcar o estoque antigo para rastreabilidade

### 4.2 Limitacao da cadeia de migrations

`wrangler d1 migrations apply` nao foi utilizavel nesse repositorio para essa entrega porque a cadeia historica para em:

- `0030_preclean_extend_qualificacoes_tipos.sql`

Erro observado:

```text
ERROR: not authorized: SQLITE_AUTH
```

Por isso, a migration 0269 foi aplicada diretamente com `wrangler d1 execute --remote`.

---

## 5. Endpoints Criados ou Ajustados

### Criado

- `POST /api/frms/reprocessar/:tripulante_id`

Finalidade:

- reprocessar um unico tripulante de forma sincrona
- contornar o timeout do reprocessamento total em background

### Ajustado

- `GET /api/frms/heatmap`

Novo comportamento:

- continua retornando compliance diario do rolling
- passa a retornar tambem `effectiveness_pct` e `effectiveness_nivel` do proprio dia

---

## 6. Reprocessamento Executado

Os seguintes tripulantes foram reprocessados individualmente com sucesso:

```text
35 -> 13 jornadas
32 -> 11 jornadas
19 -> 9 jornadas
22 -> 11 jornadas
10 -> 12 jornadas
15 -> 12 jornadas
7 -> 14 jornadas
40 -> 14 jornadas
39 -> 3 jornadas
42 -> 3 jornadas
3 -> 6 jornadas
37 -> 4 jornadas
41 -> 1 jornada
38 -> 12 jornadas
6 -> 2 jornadas
1 -> 31 jornadas
5 -> 0 jornadas
```

---

## 7. Validacoes Executadas

### 7.1 Testes automatizados

Comando:

```bash
npm run test:frms-calculos
```

Output final:

```text
Test Files  3 passed (3)
Tests  136 passed (136)
```

### 7.2 Build

Comando:

```bash
npm run build
```

Output principal:

```text
vite v6.4.1 building for production...
✓ 3630 modules transformed.
```

### 7.3 Pre-reprocessamento com rastreabilidade

Output da aplicacao da 0269 no D1 remoto:

```text
PRE-REPROCESS_TRACKING | total=158 | com_100=43 | media_pct=88.1 | min=60 | max=100
```

### 7.4 Validacao cientifica em producao

Resultados observados:

```text
CENARIO_1_DIURNA
media_pct = 89.8
amostras = 41

CENARIO_2_NOTURNA
media_pct = 85.4
amostras = 13

CENARIO_3_REPOUSO_RUIM
penalidade_repouso_pct = -10.0
amostras = 13

CENARIO_4_CICLO_AVANCADO
amostras = 0
```

### 7.5 Validacao final da distribuicao

```text
total_jornadas = 158
ainda_100 = 43
media_geral_pct = 88.1
pior_caso_pct = 60
melhor_caso_pct = 100
verde = 75
atencao = 72
amarelo = 1
vermelho = 10
ainda_marcados_bug = 0
```

Interpretacao correta:

- **nao** faz sentido exigir `ainda_100 = 0`
- 100% e legitimo quando o total de penalidades do dia e 0
- o criterio correto e haver variancia real entre dias e entre tripulantes

### 7.6 Validacao especifica do heatmap para Magioli

Consulta feita apos publicar o novo `/api/frms/heatmap`:

```text
Max Monteiro Magioli
('2026-02-16', 85, 'atencao')
('2026-02-17', 85, 'atencao')
('2026-02-18', 85, 'atencao')
('2026-02-19', 95, 'verde')
('2026-02-20', 95, 'verde')
('2026-02-23', 85, 'atencao')
('2026-02-24', 80, 'atencao')
('2026-02-25', 90, 'verde')
('2026-02-26', 100, 'verde')
unique_effectiveness = [80, 85, 90, 95, 100]
```

Conclusao:

- o Magioli **nao** tem mais um unico valor repetido em todos os dias
- o heatmap passou a respeitar a curva real da serie diaria

---

## 8. Status de Deploy

### API

Publicado com sucesso.

Version ID observada apos o fix do heatmap:

```text
247bd6b7-87ae-4f46-b527-f2058b899345
```

Health check:

```json
{ "success": true, "status": "healthy" }
```

### Frontend principal

O deploy direto em Cloudflare Pages continuou bloqueado por permissao do token:

```text
Authentication error [code: 10000]
```

### Frontend alternativo

O `worker-frontend` foi publicado, mas a rota `/frms` retornou `HTTP 500`, portanto nao foi considerada entrega valida do frontend principal.

---

## 9. Estado Final do Sistema

### Resolvido

- motor de calculo corrigido
- configuracoes persistidas no D1 corrigidas
- reprocessamento completo executado por tripulante
- rastreabilidade adicionada com `processado_com_bug`
- heatmap de efetividade corrigido para usar valor diario
- testes e build verdes
- API de producao atualizada

### Ainda pendente

- publicar o frontend principal em `airtrust.online` com credencial Cloudflare que tenha permissao para Pages
- validar visualmente em sessao autenticada no browser apos publicar o bundle novo do frontend principal

---

## 10. Arquivos Relevantes

- `worker-airtrust/src/lib/frms/calculos.ts`
- `worker-airtrust/src/lib/frms/types.ts`
- `worker-airtrust/src/lib/frms/db-service.ts`
- `worker-airtrust/src/routes/frms.ts`
- `worker-airtrust/migrations/0269_frms_effectiveness_fix_tracking.sql`
- `worker-airtrust/scripts/teste_cenarios_icao.sql`
- `src/react-app/pages/frms/components/FrmsHeatmap.tsx`
- `src/react-app/pages/frms/FrmsDashboard.tsx`
- `src/react-app/pages/frms/FrmsFichaTripulante.tsx`
- `src/react-app/hooks/useFrms.ts`
- `FRMS-CALCULOS-AUDITORIA-2026-03.md`

---

## 11. Conclusao

O problema original teve duas camadas distintas:

1. **calculo** incorreto de effectiveness
2. **apresentacao** incorreta do heatmap, que repetia um snapshot unico em todos os dias

As duas camadas foram tratadas.

No estado atual:

- a API calcula corretamente
- os dados historicos ativos foram reprocessados
- o heatmap agora recebe efetividade por dia
- a curva temporal de cada tripulante pode variar corretamente, como demonstrado no caso do Magioli
