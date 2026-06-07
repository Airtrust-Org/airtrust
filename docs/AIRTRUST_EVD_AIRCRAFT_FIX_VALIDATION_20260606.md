# AirTrust — EVD Aircraft Fix Validation

**Data:** 2026-06-06

## Causa

O filtro `somenteAtivas` no backend (`aeronaves.ts:25`) usava:
```sql
UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
```

Este filtro só aceitava status literal 'ATIVO' ou NULL/vazio. Status como
'D' (Disponível), 'ATIVO', 'OK', ou qualquer outro valor não-indisponível
eram excluídos, resultando em "Aeronaves ativas: 0".

## Correção

```sql
UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) NOT IN ('I', 'INATIVO', 'INDISPONIVEL', 'INDISPONÍVEL')
```

Alinhado com `isAeronaveAtiva()` do frontend:
- Status NULL/vazio → tratado como 'ATIVO' → ativo ✅
- Status 'ATIVO', 'D', 'OK', 'Disponivel' → ativo ✅
- Status 'I', 'INATIVO', 'INDISPONIVEL' → inativo (excluído) ✅

## Testes

3 testes de contrato adicionados:
- `somenteAtivas exclui apenas status de indisponibilidade`
- `aeronaves com status NULL ou vazio são tratadas como ATIVO`
- `tenant isolation é mantida no filtro somenteAtivas`

3 testes de tratamento de erro:
- `erro na query retorna 500, não lista vazia`
- `resposta de sucesso sempre inclui array (nunca null/undefined)`
- `lista vazia verdadeira é distinguível de erro`

## Regra de erro

O endpoint distingue:
- **200 + data: []** → realmente sem aeronaves para o tenant
- **500** → erro na query (exceção capturada)

O frontend pode diferenciar pelo HTTP status code.
