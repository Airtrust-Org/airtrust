-- Migration 0459: corrigir denominador dos códigos do Periódico S-76 de /04 para /03.
--
-- Fonte funcional: migration 0434 já define explicitamente o SK76 Periódico como
-- "3 sessões por ciclo" e os nomes 01/03, 02/03 e Check 03/03. Esta migration
-- corrige exclusivamente a nomenclatura dos seis modelos 01/02 dos ciclos C1-C3.
-- SK76-P-CHECK permanece inalterado.
--
-- Escopo operacional deliberado: empresa_id=6 (Costa do Sol), onde a matriz
-- versionada AW139/S-76 foi aplicada. Nenhum outro tenant é alterado.
--
-- Preservação histórica: IDs de modelos, vínculos de manobras, fichas,
-- agendamentos e vínculos de guia permanecem intactos. A correção é de nome de
-- identidade, não uma nova versão curricular. Códigos físicos das versões e
-- códigos de guia são corrigidos no mesmo passo para evitar identidade dupla.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: worker-airtrust/migrations/0434_atualizar_nomes_periodico_pto_rev10.sql
-- operational_decision: corrigir /04 -> /03 nos seis códigos periódicos S-76,
--   preservando IDs e histórico; não alterar AW139 nem SK76-P-CHECK.
-- dry_run_required: executar preflight/read-only e validar exatamente seis
--   códigos correntes antigos, zero códigos novos e 18 vínculos por modelo.
-- rollback_plan_required: scripts/rollback/0459_sk76_periodic_code_denominator.sql;
--   executar somente antes de qualquer nova versão /03 posterior.

CREATE TABLE IF NOT EXISTS _0459_sk76_code_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);

CREATE TRIGGER IF NOT EXISTS _0459_sk76_code_preflight
BEFORE INSERT ON _0459_sk76_code_guard
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_master WHERE type='table' AND name='modelos_sessao_versionamento'
  ) THEN RAISE(ABORT, '0459 preflight: modelos_sessao_versionamento ausente') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_master WHERE type='table' AND name='simuladores_guias_instrutor'
  ) THEN RAISE(ABORT, '0459 preflight: simuladores_guias_instrutor ausente') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_versionamento
    WHERE empresa_id=6 AND is_current=1
      AND codigo_canonico IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
      )
  ) <> 6 THEN RAISE(ABORT, '0459 preflight: esperados 6 modelos S-76 /04 correntes') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento
    WHERE empresa_id=6
      AND codigo_canonico IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
      )
  ) THEN RAISE(ABORT, '0459 preflight: código /03 já existe no versionamento') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM modelos_sessao_versionamento v
    JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
    WHERE v.empresa_id=6 AND v.is_current=1
      AND v.codigo_canonico IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
      )
      AND (SELECT COUNT(*) FROM modelos_sessao_manobras msm
           WHERE msm.modelo_id=v.modelo_id AND msm.deleted_at IS NULL) <> 18
  ) THEN RAISE(ABORT, '0459 preflight: modelo alvo sem exatamente 18 vínculos ativos') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM modelos_sessao_versionamento v
    JOIN modelos_sessao old_ms ON old_ms.id=v.modelo_id
    JOIN modelos_sessao collision
      ON collision.codigo=REPLACE(old_ms.codigo, '/04', '/03')
     AND collision.id<>old_ms.id
    WHERE v.empresa_id=6
      AND v.codigo_canonico IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
      )
  ) THEN RAISE(ABORT, '0459 preflight: colisão de código físico /03') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM simuladores_guias_instrutor
    WHERE empresa_id=6 AND deleted_at IS NULL
      AND codigo IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
      )
  ) <> 6 THEN RAISE(ABORT, '0459 preflight: esperados 6 guias S-76 /04 ativos') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM simuladores_guias_instrutor
    WHERE empresa_id=6 AND deleted_at IS NULL
      AND codigo IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
      )
  ) THEN RAISE(ABORT, '0459 preflight: guia /03 já existe') END;
END;

INSERT INTO _0459_sk76_code_guard(id) VALUES(1);
DROP TRIGGER _0459_sk76_code_preflight;
DROP TABLE _0459_sk76_code_guard;

-- A identidade de versão é normalmente imutável. Para esta correção de
-- nomenclatura comprovada pela 0434, o trigger é removido apenas durante o
-- UPDATE fechado abaixo e recriado byte-equivalente em seguida.
DROP TRIGGER IF EXISTS trg_modelo_versao_integridade_update;

UPDATE modelos_sessao
SET codigo=REPLACE(codigo, '/04', '/03'), updated_at=CURRENT_TIMESTAMP
WHERE id IN (
  SELECT modelo_id FROM modelos_sessao_versionamento
  WHERE empresa_id=6
    AND codigo_canonico IN (
      'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
      'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
    )
);

UPDATE modelos_sessao_versionamento
SET codigo_canonico=REPLACE(codigo_canonico, '/04', '/03'), updated_at=CURRENT_TIMESTAMP
WHERE empresa_id=6
  AND codigo_canonico IN (
    'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
    'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
  );

UPDATE simuladores_guias_instrutor
SET codigo=REPLACE(codigo, '/04', '/03'), updated_at=CURRENT_TIMESTAMP
WHERE empresa_id=6 AND deleted_at IS NULL
  AND codigo IN (
    'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
    'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
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

CREATE TABLE IF NOT EXISTS _0459_sk76_code_post_guard (
  id INTEGER PRIMARY KEY CHECK(id = 1)
);
CREATE TRIGGER IF NOT EXISTS _0459_sk76_code_postcheck
BEFORE INSERT ON _0459_sk76_code_post_guard
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento
    WHERE empresa_id=6
      AND codigo_canonico IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
      )
  ) THEN RAISE(ABORT, '0459 postcheck: código /04 permaneceu no versionamento') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_versionamento
    WHERE empresa_id=6 AND is_current=1
      AND codigo_canonico IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
      )
  ) <> 6 THEN RAISE(ABORT, '0459 postcheck: não há exatamente 6 modelos /03 correntes') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM simuladores_guias_instrutor
    WHERE empresa_id=6 AND deleted_at IS NULL
      AND codigo IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'
      )
  ) THEN RAISE(ABORT, '0459 postcheck: guia /04 permaneceu ativo') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM simuladores_guias_instrutor
    WHERE empresa_id=6 AND deleted_at IS NULL
      AND codigo IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'
      )
  ) <> 6 THEN RAISE(ABORT, '0459 postcheck: não há exatamente 6 guias /03 ativos') END;
END;
INSERT INTO _0459_sk76_code_post_guard(id) VALUES(1);
DROP TRIGGER _0459_sk76_code_postcheck;
DROP TABLE _0459_sk76_code_post_guard;
