-- 0329_escalas_numero_revisao.sql
-- Sistema de revisões de escala publicada
-- Cada vez que uma escala publicada é re-publicada, numero_revisao é incrementado.
-- O snapshot de cada publicação registra o número da revisão correspondente.

ALTER TABLE escalas_mensais ADD COLUMN numero_revisao INTEGER NOT NULL DEFAULT 0;

ALTER TABLE escala_publicacao_snapshots ADD COLUMN revisao INTEGER NOT NULL DEFAULT 0;
