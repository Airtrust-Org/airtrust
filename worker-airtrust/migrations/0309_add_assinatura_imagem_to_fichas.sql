-- Migration 0309: Add signature image columns to fichas_sessao
ALTER TABLE fichas_sessao ADD COLUMN assinatura_aluno_imagem TEXT;
ALTER TABLE fichas_sessao ADD COLUMN assinatura_instrutor_imagem TEXT;
