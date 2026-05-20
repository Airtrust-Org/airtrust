-- ⚡ MIGRATION 0200: Performance Optimization - Composite Indexes
-- Auditoria 2026-01-14 - Ganho estimado: 20-30%
-- 
-- PROBLEMA: Queries com múltiplos filtros fazem table scan
-- SOLUÇÃO: Indexes compostos para padrões de query comuns
--
-- IMPACTO: 
-- - Qualificações: WHERE funcionario_id + data_vencimento (usado 100+ vezes/dia)
-- - Funcionários: Busca por nome + status (usado em dropdowns)
-- - Fichas: Filtro por sessão + status (usado em listas)

-- ============================================================
-- QUALIFICAÇÕES HISTÓRICO - Composite Indexes
-- ============================================================

-- Index composto para filtro mais comum: funcionário + vencimento
-- Usado em: /api/qualificacoes/historico?funcionario_id=X
CREATE INDEX IF NOT EXISTS idx_qh_func_venc_deleted 
ON qualificacoes_historico(funcionario_id, data_vencimento, deleted_at)
WHERE deleted_at IS NULL;

-- Index para busca por categoria + vencimento
-- Usado em: filtros de dashboard e relatórios
CREATE INDEX IF NOT EXISTS idx_qh_categoria_venc 
ON qualificacoes_historico(qualificacao_id, data_vencimento, deleted_at)
WHERE deleted_at IS NULL;

-- Index para renovadas + data
-- Usado em: filtro de qualificações renovadas
CREATE INDEX IF NOT EXISTS idx_qh_renovada_data 
ON qualificacoes_historico(renovada, data_vencimento, deleted_at)
WHERE deleted_at IS NULL AND renovada = 1;

-- ============================================================
-- FUNCIONÁRIOS - Search Optimization
-- ============================================================

-- Index para busca por nome (NOCASE) + status
-- Usado em: dropdown de seleção de funcionários, buscas
CREATE INDEX IF NOT EXISTS idx_func_nome_status_deleted 
ON funcionarios(nome COLLATE NOCASE, status, deleted_at)
WHERE deleted_at IS NULL;

-- Index para matrícula + status (busca rápida)
-- Usado em: busca por matrícula em modais
CREATE INDEX IF NOT EXISTS idx_func_matricula_status 
ON funcionarios(matricula, status, deleted_at)
WHERE deleted_at IS NULL;

-- Index para modelo aeronave + ativo
-- Usado em: filtros por aeronave
CREATE INDEX IF NOT EXISTS idx_func_aeronave_ativo 
ON funcionarios(modelo_aeronave_id, status, deleted_at)
WHERE deleted_at IS NULL;

-- ============================================================
-- FICHAS SESSÃO - Filtros de Lista
-- ============================================================

-- Index para sessão + status
-- Usado em: /simuladores/fichas?sessao=X
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_status 
ON fichas_sessao(agendamento_slot_id, resultado_final, deleted_at)
WHERE deleted_at IS NULL;

-- Index para aluno + data
-- Usado em: pasta virtual, histórico de fichas
CREATE INDEX IF NOT EXISTS idx_fichas_aluno_data 
ON fichas_sessao(colaborador_id_aluno, created_at, deleted_at)
WHERE deleted_at IS NULL;

-- Index para instrutor + aprovado
-- Usado em: relatórios de instrutor
CREATE INDEX IF NOT EXISTS idx_fichas_instrutor_aprovado 
ON fichas_sessao(colaborador_id_instrutor, aprovado, deleted_at)
WHERE deleted_at IS NULL;

-- ============================================================
-- SIMULADOR AGENDAMENTOS - Calendário
-- ============================================================

-- Index para data + simulador (query mais comum do calendário)
-- Usado em: /api/simuladores/agenda?data=X&simulador=Y
CREATE INDEX IF NOT EXISTS idx_agenda_data_simulador 
ON simulador_agendamentos(data, simulador_id, deleted_at)
WHERE deleted_at IS NULL;

-- Index para examinador + is_check
-- Usado em: filtros de checks e examinadores
CREATE INDEX IF NOT EXISTS idx_agenda_examinador_check 
ON simulador_agendamentos(examinador_id, is_check, deleted_at)
WHERE deleted_at IS NULL AND examinador_id IS NOT NULL;

-- ============================================================
-- DOCUMENTOS (Certificados) - Download Performance
-- ============================================================

-- Index para qualificação + tipo (usado em certificados)
-- Usado em: /certificados/historico/:id/certificados
CREATE INDEX IF NOT EXISTS idx_docs_qualif_tipo 
ON documentos(qualificacao_historico_id, tipo_documento, deleted_at)
WHERE deleted_at IS NULL AND qualificacao_historico_id IS NOT NULL;

-- Index para funcionário + tipo + deleted
-- Usado em: pasta virtual, aba certificados
CREATE INDEX IF NOT EXISTS idx_docs_func_tipo_deleted 
ON documentos(funcionario_id, tipo_documento, deleted_at)
WHERE deleted_at IS NULL AND funcionario_id IS NOT NULL;

-- ============================================================
-- AUDITORIA - Análise de Impacto
-- ============================================================

-- Validar indexes criados
SELECT 
  'Indexes criados' as status,
  COUNT(*) as total_indexes
FROM sqlite_master 
WHERE type='index' 
  AND name LIKE 'idx_%'
  AND sql LIKE '%2026-01-14%';

-- Análise de uso (executar após 1 semana)
-- SELECT * FROM sqlite_stat1 WHERE idx LIKE 'idx_qh_%' OR idx LIKE 'idx_func_%';

-- ============================================================
-- NOTAS DE IMPLEMENTAÇÃO
-- ============================================================
-- 
-- Performance Gains (estimados):
-- - Queries de qualificações: 50-70% mais rápidas
-- - Buscas de funcionários: 40-60% mais rápidas  
-- - Listagens de fichas: 30-50% mais rápidas
-- - Calendário: 40-60% mais rápido
--
-- Disk Space:
-- - Cada index: ~50-200KB
-- - Total estimado: ~2MB
-- - Aceitável para ganho de performance
--
-- Maintenance:
-- - Indexes atualizados automaticamente em INSERT/UPDATE/DELETE
-- - Zero overhead para desenvolvedor
-- - SQLite otimiza automaticamente query plans
--
-- Rollback:
-- DROP INDEX IF EXISTS idx_qh_func_venc_deleted;
-- (repetir para cada index)
-- 
