# Rollback / compensacao — migration 0466

## Escopo
- Migration: `0466_cae_planning_v3.sql`
- Ambiente permitido para rollback direto: **local/teste descartavel**
- Produção: usar **compensacao lógica** (não fazer `ALTER TABLE DROP COLUMN` em fluxo operacional)

## Por que compensacao
No SQLite/D1, remover colunas adicionadas por migration pode exigir recriação de tabela.
Para evitar risco em base com dados reais, o caminho seguro é compensar estado e manter compatibilidade.

## Compensacao recomendada (sem remover colunas)
```sql
-- Volta flags/config para defaults seguros
UPDATE empresas_config
   SET planejamento_simulador_antecedencia_dias = 90,
       planejamento_simulador_regra_quinzena = 'AMBAS',
       planejamento_simulador_permitir_sessao_compartilhada = 1,
       planejamento_simulador_preferir_mesmo_treinamento = 1,
       planejamento_simulador_preferir_mesma_sessao = 1,
       planejamento_simulador_aprovacao_obrigatoria = 1;

-- Regride propostas em aberto para rascunho/replanejar quando necessário
UPDATE treinamentos_planejados
   SET planejamento_aprovacao_status = 'RASCUNHO',
       planejamento_aprovacao_observacoes = COALESCE(planejamento_aprovacao_observacoes, 'Compensação 0466'),
       planejamento_aprovado_por = NULL,
       planejamento_aprovado_em = NULL,
       planejamento_revalidado_em = NULL
 WHERE planejamento_origem = 'SIMULADOR_PLANEJAMENTO_CAE_V3'
   AND deleted_at IS NULL;
```

## Rollback completo (somente DB descartável)
1. Recriar banco local/teste do zero (`setup:local:reset`) e reaplicar migrations até `0465`.
2. Executar suites de schema e serviços para confirmar comportamento pré-0466.

## Validação pós-compensação
- `src/__tests__/migrations/cae-planning-v3-schema.test.ts` (schema/check/defaults)
- `src/__tests__/services/cae-planning-approval-live.test.ts` (fluxo aprovação/revalidação)
- `src/__tests__/services/cae-planning-materialization-integration.test.ts` (materialização normal/compartilhada)
