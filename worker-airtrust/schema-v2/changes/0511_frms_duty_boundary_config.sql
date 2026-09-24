-- FRMS: limites operacionais configuráveis para encerramento de jornada.
-- 0511
-- Mantém a configuração tenant-scoped em frms_fadiga_config_empresa.
-- Nenhum dado histórico é reescrito por esta migration.

ALTER TABLE frms_fadiga_config_empresa
  ADD COLUMN jornada_pos_corte_minutos INTEGER NOT NULL DEFAULT 30
  CHECK (jornada_pos_corte_minutos >= 0 AND jornada_pos_corte_minutos <= 240);

ALTER TABLE frms_fadiga_config_empresa
  ADD COLUMN jornada_sem_voo_fim TEXT NOT NULL DEFAULT '17:00'
  CHECK (
    length(jornada_sem_voo_fim) = 5
    AND substr(jornada_sem_voo_fim, 3, 1) = ':'
    AND CAST(substr(jornada_sem_voo_fim, 1, 2) AS INTEGER) BETWEEN 0 AND 23
    AND CAST(substr(jornada_sem_voo_fim, 4, 2) AS INTEGER) BETWEEN 0 AND 59
  );
