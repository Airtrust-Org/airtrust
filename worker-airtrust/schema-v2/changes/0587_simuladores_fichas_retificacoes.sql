-- 0587: Retificacao formal, append-only, de fichas de simulador ja assinadas.
-- Nenhuma linha de fichas_sessao / fichas_sessao_manobras e alterada: a retificacao e um registro
-- novo que referencia a ficha, guarda o snapshot original (com SHA-256), o motivo, o fundamento
-- normativo, a evidencia nova, a decisao de um responsavel distinto do solicitante e as
-- assinaturas do instrutor e do aluno da ficha original.
-- Aditivo: sem DROP, sem ALTER TABLE RENAME, sem backfill.

CREATE TABLE IF NOT EXISTS fichas_sessao_retificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ficha_id INTEGER NOT NULL REFERENCES fichas_sessao(id),
  status TEXT NOT NULL DEFAULT 'SOLICITADA' CHECK(status IN ('SOLICITADA', 'APROVADA', 'CONCLUIDA', 'REJEITADA', 'CANCELADA')),
  motivo TEXT NOT NULL CHECK(length(trim(motivo)) >= 20),
  fundamento_normativo TEXT NOT NULL CHECK(length(trim(fundamento_normativo)) >= 10),
  evidencia_nova TEXT NOT NULL CHECK(length(trim(evidencia_nova)) >= 10),
  snapshot_original_sha256 TEXT NOT NULL CHECK(length(snapshot_original_sha256) = 64),
  snapshot_original_json TEXT NOT NULL,
  solicitante_usuario_id TEXT NOT NULL,
  decisao_usuario_id TEXT,
  decisao_em TEXT,
  decisao_observacao TEXT,
  assinatura_instrutor_usuario_id TEXT,
  assinatura_instrutor_em TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_aluno_usuario_id TEXT,
  assinatura_aluno_em TEXT,
  assinatura_aluno_ip TEXT,
  resultado_final_retificado TEXT CHECK(resultado_final_retificado IS NULL OR resultado_final_retificado IN ('APROVADO', 'REPROVADO')),
  concluida_em TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fichas_sessao_retificacoes_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retificacao_id INTEGER NOT NULL REFERENCES fichas_sessao_retificacoes(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ficha_manobra_id INTEGER NOT NULL REFERENCES fichas_sessao_manobras(id),
  codigo TEXT,
  categoria TEXT,
  resultado_original TEXT,
  resultado_retificado TEXT NOT NULL CHECK(length(trim(resultado_retificado)) >= 1),
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(retificacao_id, ficha_manobra_id)
);

-- Uma unica retificacao em andamento por ficha.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fichas_retificacoes_aberta_por_ficha
  ON fichas_sessao_retificacoes(ficha_id) WHERE status IN ('SOLICITADA', 'APROVADA');
CREATE INDEX IF NOT EXISTS idx_fichas_retificacoes_empresa_ficha
  ON fichas_sessao_retificacoes(empresa_id, ficha_id, id);
CREATE INDEX IF NOT EXISTS idx_fichas_retificacoes_itens_retificacao
  ON fichas_sessao_retificacoes_itens(retificacao_id);

-- So se retifica ficha da mesma empresa que ja tenha assinatura do instrutor.
CREATE TRIGGER IF NOT EXISTS trg_fichas_retificacoes_insert_guard
BEFORE INSERT ON fichas_sessao_retificacoes
BEGIN
  SELECT RAISE(ABORT, 'RETIFICACAO_FICHA_NAO_ASSINADA_OU_OUTRO_TENANT')
  WHERE NOT EXISTS (
    SELECT 1 FROM fichas_sessao f
    WHERE f.id = NEW.ficha_id AND f.empresa_id = NEW.empresa_id
      AND (f.assinatura_instrutor_timestamp IS NOT NULL OR f.assinatura_instrutor = 1)
  );
  SELECT RAISE(ABORT, 'RETIFICACAO_NASCE_SOLICITADA')
  WHERE NEW.status <> 'SOLICITADA';
END;

-- Append-only: nada e apagado.
CREATE TRIGGER IF NOT EXISTS trg_fichas_retificacoes_no_delete
BEFORE DELETE ON fichas_sessao_retificacoes
BEGIN
  SELECT RAISE(ABORT, 'RETIFICACAO_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS trg_fichas_retificacoes_itens_no_delete
BEFORE DELETE ON fichas_sessao_retificacoes_itens
BEGIN
  SELECT RAISE(ABORT, 'RETIFICACAO_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS trg_fichas_retificacoes_itens_no_update
BEFORE UPDATE ON fichas_sessao_retificacoes_itens
BEGIN
  SELECT RAISE(ABORT, 'RETIFICACAO_ITENS_IMUTAVEIS');
END;

-- Itens: so entram enquanto a retificacao esta SOLICITADA e pertencem a mesma ficha/empresa.
CREATE TRIGGER IF NOT EXISTS trg_fichas_retificacoes_itens_insert_guard
BEFORE INSERT ON fichas_sessao_retificacoes_itens
BEGIN
  SELECT RAISE(ABORT, 'RETIFICACAO_ITEM_FORA_DE_SOLICITADA_OU_TENANT')
  WHERE NOT EXISTS (
    SELECT 1 FROM fichas_sessao_retificacoes r
    WHERE r.id = NEW.retificacao_id AND r.empresa_id = NEW.empresa_id AND r.status = 'SOLICITADA'
  );
  SELECT RAISE(ABORT, 'RETIFICACAO_ITEM_DE_OUTRA_FICHA')
  WHERE NOT EXISTS (
    SELECT 1 FROM fichas_sessao_retificacoes r
    JOIN fichas_sessao_manobras m ON m.id = NEW.ficha_manobra_id AND m.ficha_id = r.ficha_id
    WHERE r.id = NEW.retificacao_id
  );
END;

-- Cabecalho: campos de identidade/snapshot imutaveis; estados terminais congelados;
-- transicoes validas; decisor distinto do solicitante; conclusao exige as duas assinaturas.
CREATE TRIGGER IF NOT EXISTS trg_fichas_retificacoes_update_guard
BEFORE UPDATE ON fichas_sessao_retificacoes
BEGIN
  SELECT RAISE(ABORT, 'RETIFICACAO_ESTADO_TERMINAL_IMUTAVEL')
  WHERE OLD.status IN ('CONCLUIDA', 'REJEITADA', 'CANCELADA');
  SELECT RAISE(ABORT, 'RETIFICACAO_IDENTIDADE_IMUTAVEL')
  WHERE NEW.empresa_id <> OLD.empresa_id OR NEW.ficha_id <> OLD.ficha_id
     OR NEW.motivo <> OLD.motivo OR NEW.fundamento_normativo <> OLD.fundamento_normativo
     OR NEW.evidencia_nova <> OLD.evidencia_nova
     OR NEW.snapshot_original_sha256 <> OLD.snapshot_original_sha256
     OR NEW.snapshot_original_json <> OLD.snapshot_original_json
     OR NEW.solicitante_usuario_id <> OLD.solicitante_usuario_id;
  SELECT RAISE(ABORT, 'RETIFICACAO_TRANSICAO_INVALIDA')
  WHERE NEW.status <> OLD.status AND NOT (
    (OLD.status = 'SOLICITADA' AND NEW.status IN ('APROVADA', 'REJEITADA', 'CANCELADA')) OR
    (OLD.status = 'APROVADA' AND NEW.status IN ('CONCLUIDA', 'CANCELADA'))
  );
  SELECT RAISE(ABORT, 'RETIFICACAO_DECISOR_IGUAL_SOLICITANTE')
  WHERE NEW.status IN ('APROVADA', 'REJEITADA') AND NEW.status <> OLD.status
    AND (NEW.decisao_usuario_id IS NULL OR NEW.decisao_usuario_id = NEW.solicitante_usuario_id
         OR NEW.decisao_em IS NULL);
  SELECT RAISE(ABORT, 'RETIFICACAO_ASSINATURAS_INCOMPLETAS')
  WHERE NEW.status = 'CONCLUIDA' AND (
    NEW.assinatura_instrutor_usuario_id IS NULL OR NEW.assinatura_instrutor_em IS NULL
    OR NEW.assinatura_aluno_usuario_id IS NULL OR NEW.assinatura_aluno_em IS NULL
    OR NEW.resultado_final_retificado IS NULL OR NEW.concluida_em IS NULL
  );
  SELECT RAISE(ABORT, 'RETIFICACAO_ASSINATURA_IMUTAVEL')
  WHERE (OLD.assinatura_instrutor_usuario_id IS NOT NULL AND (
           NEW.assinatura_instrutor_usuario_id IS NOT OLD.assinatura_instrutor_usuario_id
           OR NEW.assinatura_instrutor_em IS NOT OLD.assinatura_instrutor_em))
     OR (OLD.assinatura_aluno_usuario_id IS NOT NULL AND (
           NEW.assinatura_aluno_usuario_id IS NOT OLD.assinatura_aluno_usuario_id
           OR NEW.assinatura_aluno_em IS NOT OLD.assinatura_aluno_em));
  SELECT RAISE(ABORT, 'RETIFICACAO_ASSINATURA_ANTES_DA_DECISAO')
  WHERE OLD.status = 'SOLICITADA' AND NEW.status = 'SOLICITADA'
    AND (NEW.assinatura_instrutor_usuario_id IS NOT NULL OR NEW.assinatura_aluno_usuario_id IS NOT NULL);
END;
