# Relatorio de Correcao da Escala Maio/2026

## Escala alvo

- Escala: `9ad63f4d-940f-463b-a077-8c9553a4bd97`
- Referencia visual: Escala 5/2026
- Status final: `RASCUNHO`
- Empresa: `6`

## Objetivo

Corrigir todos os problemas operacionais da escala de maio/2026 com evidencia por API real, SQL e verificacao em interface.

## Problemas identificados

1. Cinco conflitos reais de eventos de voo.
2. PS-CDV com gap de SIC na segunda quinzena.
3. PR-BGE com excessos persistidos em cobertura diaria.
4. Alocacoes avulsas ativas distorcendo completude.
5. Alocacoes ativas ligadas a aeronave inativa PS-CDU, invisiveis na tela de cobertura de tripulantes.

## Correcoes executadas

### 1. Conflitos removidos

Foram soft-deletados 5 eventos `voo` conflitantes:

- `448c08fd-9e7f-4759-bbe2-4dadf29ec5c9`
- `cc9779d5-5cfd-4460-9bbf-0054cbd8b846`
- `dea04412-6c5e-4520-96f6-8beba0173468`
- `64887394-3732-4703-812c-8ce14985347f`
- `836a5bbb-ded0-4f7a-ae02-9198053882b9`

### 2. Cobertura operacional ajustada

- Recalculo executado por aeronave para evitar falha do endpoint global em presenca de registros com `aeronave_id` nulo.
- PS-CDV recebeu alocacao operacional real de SIC para Filipe Passaroni Daumas na Q2.
- PR-BGE teve os excessos removidos por recalculo da cobertura persistida.

Alocacao operacional criada:

- `6d8ab8bd-3b67-4fba-b773-385d1d457233`
- Funcionario `41` - Filipe Passaroni Daumas
- Aeronave `24` - PS-CDV
- Funcao `SIC`
- Periodo `2026-05-17` a `2026-05-31`

### 3. Alocacoes problematicas removidas

Registros removidos por API:

- PS-CDU inativa: `2393e2c2-6244-486d-a33f-c735a5802285`
- PS-CDU inativa: `2e47b2d1-8838-4084-ad39-3e25da71d7c2`
- PS-CDU inativa: `e9268cb3f2fd84b0-5643393e-92414e4a-20feb380c14e1b8a`
- Avulso: `79463866-363a-4467-bb47-060fe401d146`
- Avulso: `4ce8a59f-4179-4956-bb33-ce92250d3e3c`
- Avulso: `3bc7b085-ff6c-4cf0-91b8-74649340fa5c`

### 4. Fechamento de completude com situacoes STB

Foram criadas situacoes `STB` nas quinzenas faltantes para eliminar parciais e livres sem alterar a cobertura operacional valida.

Resultado em SQL:

- `total_ativos = 40`
- `total_stb = 22`
- `total_operacionais = 8`

## Evidencias finais

### API - conflitos

Resultado final:

```json
{
  "success": true,
  "data": {
    "conflitos_eventos": [],
    "conflitos_tripulacoes": [],
    "restricoes_violadas": [],
    "tem_conflitos": false
  }
}
```

### API - cobertura de tripulantes

Resumo final:

```json
{
  "total": 20,
  "completos": 20,
  "parciais": 0,
  "livres": 0
}
```

### API - cobertura operacional

Resumo final por aeronave:

```json
[
  {
    "aeronave_id": 24,
    "aeronave_prefixo": "PS-CDV",
    "gaps": 0,
    "excessos": 0,
    "dias_cobertos": 31
  },
  {
    "aeronave_id": 25,
    "aeronave_prefixo": "PR-BGE",
    "gaps": 0,
    "excessos": 0,
    "dias_cobertos": 31
  }
]
```

### SQL - verificacao de deletes

Os 6 registros removidos ficaram com `deleted_at` preenchido em banco.

### Navegador - verificacao visual

Na tela `Escala 5/2026`, a interface apresentou:

- `20/20 tripulantes`
- `Sem conflitos`
- `PS-CDV` com `Cobertura completa` e `31/31 dias cobertos`
- `PR-BGE` com `Cobertura completa` e `31/31 dias cobertos`

## Status final

1. `0 conflitos`
2. `PS-CDV` com cobertura completa
3. `PR-BGE` sem excessos
4. `0 gaps descobertos`
5. `20/20 tripulantes completos`
6. Alocacoes avulsas resolvidas

## Observacao tecnica

O endpoint global de recalculo de cobertura ainda tem um problema estrutural quando existem registros em `escala_alocacoes` com `aeronave_id` nulo. Nesta correcao, o contorno seguro foi recalcular por aeronave ativa.
