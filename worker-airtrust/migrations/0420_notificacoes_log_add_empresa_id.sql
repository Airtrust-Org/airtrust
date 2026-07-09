-- Migration 0420: adiciona empresa_id a notificacoes_log (tenant scope)
--
-- Contexto (auditoria de multi-tenancy 2026-07-08, revisada 2026-07-09): GET
-- /api/notificacoes/log e GET /api/notificacoes/whatsapp/overview expunham dados
-- de TODAS as empresas para qualquer usuário autenticado, porque notificacoes_log
-- nunca teve coluna empresa_id. notificacoes_log guarda dado pertencente a um
-- funcionário (CPF, nome, corpo de mensagem) e portanto a uma empresa.
--
-- DECISÃO DE MODELO DE DADOS (formal, 2026-07-09):
--   - notificacoes_log  -> tenant-scoped por empresa_id (esta migration).
--   - notificacoes_config -> permanece GLOBAL por design (7 linhas em produção,
--     regras de "avisar N dias antes" por tipo/canal/urgência, sem qualquer dado
--     por-funcionário ou por-empresa; mesmo padrão de padroes_escala/
--     restricoes_tripulacao/frms_configuracao_limites). NÃO recebe empresa_id
--     nesta nem em nenhuma migration futura enquanto essa decisão de produto não
--     mudar — se um dia precisar de override por empresa, isso é uma migration
--     nova e deliberada, não uma coluna nullable nunca usada. A escrita de
--     notificacoes_config já é restrita a platform-admin no código
--     (worker-airtrust/src/routes/notificacoes.ts, isPlatformAdminContext).
--
-- BACKFILL — CORREÇÃO DE FORMATO DE CPF (vs. versão original arquivada em
-- Airtrust_BACKUP_QUARANTINE_20260708/0420_notificacoes_add_empresa_id.sql):
-- a versão original comparava funcionarios.cpf = notificacoes_log.funcionario_cpf
-- por igualdade exata. Empiricamente, notificacoes_log.funcionario_cpf é 100%
-- armazenado pontuado ("XXX.XXX.XXX-XX"), enquanto funcionarios.cpf é majoritariamente
-- sem pontuação — a comparação exata deixava ~52% das linhas (43.479 de 83.318 em
-- produção, checado 2026-07-08 e novamente 2026-07-09) com empresa_id NULL, e sob o
-- filtro `WHERE nl.empresa_id = ?` da aplicação isso as tornaria invisíveis para
-- TODOS os tenants — uma regressão silenciosa de dados pior que o vazamento que a
-- migration deveria corrigir. Normalizando pontuação dos dois lados, 100% dessas
-- linhas encontram um funcionário ativo real (checado novamente 2026-07-09,
-- unmatched_after_normalize = 0). Este arquivo usa a comparação normalizada.
--
-- PRÉ-REQUISITO OBRIGATÓRIO ANTES DE RODAR EM QUALQUER AMBIENTE: executar
-- 0420_notificacoes_log_add_empresa_id_preflight_audit.sql (mesma pasta) e
-- confirmar cpfs_duplicados_entre_empresas = 0 nesse ambiente. Se não for 0,
-- NÃO rodar esta migration sem antes decidir manualmente o desempate para os
-- CPFs duplicados (o tie-break automático abaixo é só uma rede de segurança
-- determinística, não uma resolução correta de ambiguidade real).
--
-- IDEMPOTÊNCIA: SQLite/D1 não suportam `ADD COLUMN IF NOT EXISTS`. O fluxo de
-- aplicação documentado neste repo (CLAUDE.md) usa `wrangler d1 execute --file=`
-- direto, que NÃO consulta o ledger d1_migrations — rodar este arquivo duas vezes
-- no mesmo ambiente falha alto (erro "duplicate column name") na primeira
-- instrução, sem corromper dado. Antes de rodar, confirme com
-- `PRAGMA table_info(notificacoes_log);` que a coluna ainda não existe.
--
-- ROLLBACK: ver 0420_notificacoes_log_add_empresa_id_rollback.sql (mesma pasta).
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference:
--     Auditoria de tenant isolation 2026-07-08/09 — branch
--     fix/tenant-isolation-notificacoes-20260708, commit 9555b123 (código) +
--     este arquivo (schema). Vazamento cross-tenant real em GET /api/notificacoes/log
--     e GET /api/notificacoes/whatsapp/overview, confirmado em produção.
--   operational_decision:
--     Backfill re-executável: WHERE empresa_id IS NULL garante que rodar o UPDATE
--     de novo não sobrescreve linhas já resolvidas. A ALTER TABLE ADD COLUMN em si
--     não é idempotente (ver seção IDEMPOTÊNCIA acima) — depende de rodar uma
--     única vez por ambiente. Sem DEFAULT: linhas sem match ficam NULL (fail-closed,
--     nunca "inventa" uma empresa). notificacoes_config permanece global, sem
--     empresa_id, por decisão de produto documentada no topo deste arquivo.
--   dry_run_required:
--     1. Rodar 0420_notificacoes_log_add_empresa_id_preflight_audit.sql no ambiente
--        alvo e confirmar cpfs_duplicados_entre_empresas = 0 e
--        unmatched_apos_normalizacao aceitável (idealmente 0).
--     2. Aplicar em staging primeiro; validar GET /log e GET /whatsapp/overview
--        com dados reais de pelo menos 2 empresas distintas.
--     3. Conferir sem_empresa_id na verificação pós-backfill deste arquivo.
--   rollback_plan_required:
--     Ver 0420_notificacoes_log_add_empresa_id_rollback.sql — DROP COLUMN é
--     suportado (coluna simples, sem UNIQUE/CHECK/PK). Rollback não precisa
--     reverter dado: a coluna e seu backfill são aditivos, não sobrescrevem nem
--     apagam nenhuma coluna pré-existente de notificacoes_log.

ALTER TABLE notificacoes_log ADD COLUMN empresa_id INTEGER;

UPDATE notificacoes_log
SET empresa_id = (
  SELECT f.empresa_id
  FROM funcionarios f
  WHERE REPLACE(REPLACE(f.cpf, '.', ''), '-', '') =
        REPLACE(REPLACE(notificacoes_log.funcionario_cpf, '.', ''), '-', '')
    AND f.deleted_at IS NULL
  ORDER BY f.id ASC
  LIMIT 1
)
WHERE empresa_id IS NULL
  AND funcionario_cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notificacoes_log_empresa_id ON notificacoes_log(empresa_id);

-- Verificação pós-backfill (apenas leitura, não altera dados). Se
-- sem_empresa_id > 0, essas linhas ficam invisíveis sob o filtro
-- tenant-scoped da aplicação até investigação manual — não silenciar isso.
SELECT
  'notificacoes_log backfill' AS check_name,
  COUNT(*) AS total,
  COUNT(empresa_id) AS com_empresa_id,
  COUNT(*) - COUNT(empresa_id) AS sem_empresa_id
FROM notificacoes_log;
