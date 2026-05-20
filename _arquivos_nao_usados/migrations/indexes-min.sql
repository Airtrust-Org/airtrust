-- Índices mínimos para tabelas core
CREATE INDEX IF NOT EXISTS idx_func_del_v4 ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_hab_del_v4 ON habilitacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_hab_func_v4 ON habilitacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qual_del_v4 ON qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_man_del_v4 ON manobras(deleted_at);
