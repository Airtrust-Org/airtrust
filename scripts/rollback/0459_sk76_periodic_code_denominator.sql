-- Rollback 0459: restaurar /03 -> /04 SOMENTE se nenhuma nova versão /03
-- tiver sido criada depois da correção. Não executar automaticamente.
--
-- data_origin: migration 0459_sk76_periodic_code_denominator.sql
-- evidence_source: d1_migrations + modelos_sessao_versionamento tenant 6
-- safety_rationale: preserva IDs e recusa colisão/versão posterior antes de renomear
-- approved_by: autorização operacional separada obrigatória

CREATE TABLE IF NOT EXISTS _rb0459_guard (id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TRIGGER IF NOT EXISTS _rb0459_preflight
BEFORE INSERT ON _rb0459_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_versionamento
    WHERE empresa_id=6 AND is_current=1
      AND codigo_canonico IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
      )
  ) <> 6 THEN RAISE(ABORT, 'rollback 0459: esperados 6 modelos /03 correntes') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento
    WHERE empresa_id=6
      AND codigo_canonico IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
      )
  ) THEN RAISE(ABORT, 'rollback 0459: código /04 já existe') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM modelos_sessao_versionamento v
    WHERE v.empresa_id=6
      AND v.codigo_canonico IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
      )
      AND v.created_at > COALESCE((
        SELECT applied_at FROM d1_migrations
        WHERE name='0459_sk76_periodic_code_denominator.sql'
        ORDER BY id DESC LIMIT 1
      ), '9999-12-31')
  ) THEN RAISE(ABORT, 'rollback 0459: nova versão /03 criada após a migration') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM modelos_sessao_versionamento v
    JOIN modelos_sessao old_ms ON old_ms.id=v.modelo_id
    JOIN modelos_sessao collision
      ON collision.codigo=REPLACE(old_ms.codigo, '/03', '/04')
     AND collision.id<>old_ms.id
    WHERE v.empresa_id=6
      AND v.codigo_canonico IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
      )
  ) THEN RAISE(ABORT, 'rollback 0459: colisão de código físico /04') END;
END;
INSERT INTO _rb0459_guard(id) VALUES(1);
DROP TRIGGER _rb0459_preflight;
DROP TABLE _rb0459_guard;

DROP TRIGGER IF EXISTS trg_modelo_versao_integridade_update;

UPDATE modelos_sessao
SET codigo=REPLACE(codigo, '/03', '/04'), updated_at=CURRENT_TIMESTAMP
WHERE id IN (
  SELECT modelo_id FROM modelos_sessao_versionamento
  WHERE empresa_id=6
    AND codigo_canonico IN (
      'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
      'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
    )
);

UPDATE modelos_sessao_versionamento
SET codigo_canonico=REPLACE(codigo_canonico, '/03', '/04'), updated_at=CURRENT_TIMESTAMP
WHERE empresa_id=6
  AND codigo_canonico IN (
    'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
    'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
  );

UPDATE simuladores_guias_instrutor
SET codigo=REPLACE(codigo, '/03', '/04'), updated_at=CURRENT_TIMESTAMP
WHERE empresa_id=6 AND deleted_at IS NULL
  AND codigo IN (
    'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
    'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
  );

CREATE TRIGGER IF NOT EXISTS trg_modelo_versao_integridade_update
BEFORE UPDATE ON modelos_sessao_versionamento
BEGIN
  SELECT CASE WHEN NEW.modelo_id <> OLD.modelo_id
    OR NEW.empresa_id <> OLD.empresa_id
    OR NEW.codigo_canonico <> OLD.codigo_canonico
    OR NEW.versao_numero <> OLD.versao_numero
    OR NEW.versao_matriz <> OLD.versao_matriz
    OR COALESCE(NEW.modelo_anterior_id, -1) <> COALESCE(OLD.modelo_anterior_id, -1)
    OR NEW.efetivo_em <> OLD.efetivo_em
    OR NEW.created_at <> OLD.created_at
    THEN RAISE(ABORT, 'identidade de versão é imutável') END;
  SELECT CASE WHEN OLD.is_current = 0 AND NEW.is_current = 1
    THEN RAISE(ABORT, 'versão histórica não pode voltar a vigente; crie versão de reversão auditada') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM modelos_sessao ms WHERE ms.id = NEW.modelo_id AND ms.empresa_id = NEW.empresa_id)
    THEN RAISE(ABORT, 'modelo e empresa divergentes') END;
  SELECT CASE WHEN NEW.is_current = 1 AND NEW.efetivo_ate IS NOT NULL THEN RAISE(ABORT, 'versão corrente não pode ter término') END;
  SELECT CASE WHEN NEW.is_current = 0 AND NEW.efetivo_ate IS NULL THEN RAISE(ABORT, 'versão histórica exige término') END;
  SELECT CASE WHEN NEW.modelo_anterior_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento previous
    WHERE previous.modelo_id = NEW.modelo_anterior_id AND previous.empresa_id = NEW.empresa_id
      AND previous.codigo_canonico = NEW.codigo_canonico AND previous.versao_numero = NEW.versao_numero - 1
      AND previous.efetivo_em <= NEW.efetivo_em
  ) THEN RAISE(ABORT, 'predecessor inválido') END;
END;
