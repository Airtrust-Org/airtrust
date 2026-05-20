-- ============================================================
-- 0284 — FRAT Multi-level Approval + Bowtie Risk improvements
-- ============================================================

-- ── FRAT Avaliações: track current approval level ────────────────────────────
ALTER TABLE sgso_frat_avaliacoes ADD COLUMN nivel_aprovacao_atual TEXT NOT NULL DEFAULT 'L1';

-- ── FRAT Aprovações: tag which level each approval record belongs to ─────────
ALTER TABLE sgso_frat_aprovacoes ADD COLUMN nivel TEXT NOT NULL DEFAULT 'L1';

-- ── NC → Barrier link support ────────────────────────────────────────────────
-- barreira_id is used in application logic only; NCs already carry relato_id.
-- This index helps auto-degrade queries resolve fast if barreira_id is stored.

-- ── Bowtie Cenários: optional base probability for residual risk calculation ─
ALTER TABLE sgso_bowtie_cenarios ADD COLUMN probabilidade_base REAL NOT NULL DEFAULT 1.0;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sgso_frat_avaliacoes_nivel ON sgso_frat_avaliacoes(empresa_id, nivel_aprovacao_atual, status);
CREATE INDEX IF NOT EXISTS idx_sgso_frat_aprovacoes_nivel ON sgso_frat_aprovacoes(avaliacao_id, nivel);
