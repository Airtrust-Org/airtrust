# Manifesto de Reconciliação — Categoria EAD Costa do Sol (Empresa 6)

## Categoria EAD Canônica

| Campo | Valor |
|---|---|
| ID | 13 |
| Nome | EAD |
| Cor | #EABA0C |
| Empresa | 6 (Costa do Sol Táxi Aéreo) |
| Estado esperado | ativo=1, deleted_at=NULL |

## Caso Rômulo Harfield Castanheira de Menezes (CANAC 15722-4)

| Histórico ID | Categoria Atual | Categoria Esperada | Ação |
|---|---|---|---|
| 5305 | Teórico (id=3) | EAD (id=13) | Corrigir categoria_id |
| 5307 | Teórico (id=3) | EAD (id=13) | Corrigir categoria_id |
| 5308 | Teórico (id=3) | EAD (id=13) | Corrigir categoria_id |
| 5321 | EAD (id=13, inativa) | EAD (id=13, ativa) | Reativar categoria |
| 5323 | EAD (id=13, inativa) | EAD (id=13, ativa) | Reativar categoria |
| 5373 | EAD (id=13, inativa) | EAD (id=13, ativa) | Reativar categoria |
| 5374 | EAD (id=13, inativa) | EAD (id=13, ativa) | Reativar categoria |
| 5375 | EAD (id=13, inativa) | EAD (id=13, ativa) | Reativar categoria |
| 5440 | EAD (id=13, inativa) | EAD (id=13, ativa) | Reativar categoria |

## Operações

1. Reativar categoria EAD: `UPDATE qualificacoes_categorias SET ativo=1 WHERE id=13 AND empresa_id=6`
2. Garantir cor canônica: `UPDATE qualificacoes_categorias SET cor='#EABA0C' WHERE id=13 AND empresa_id=6`
3. Corrigir tipos EAD: `UPDATE qualificacoes_tipos SET categoria_id=13 WHERE empresa_id=6 AND UPPER(categoria)='EAD' AND (categoria_id IS NULL OR categoria_id \!= 13)`
4. Corrigir históricos Rômulo: `UPDATE qualificacoes_historico SET categoria_id=13 WHERE id IN (5305,5307,5308) AND empresa_id=6`
5. Preencher categoria_id NULL: `UPDATE qualificacoes_historico SET categoria_id=13 WHERE empresa_id=6 AND categoria_id IS NULL AND qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(categoria)='EAD')`

## Rollback via executor (--rollback-output)
