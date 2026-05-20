-- 0349_lms_matriculas_ultimo_slide.sql
-- Salvar posição do aluno para retomada em PDF/PPTX/H5P/vídeo

ALTER TABLE lms_matriculas ADD COLUMN ultimo_slide INTEGER DEFAULT 0;
ALTER TABLE lms_matriculas ADD COLUMN ultima_pagina INTEGER DEFAULT 0;
