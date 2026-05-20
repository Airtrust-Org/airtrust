PRAGMA foreign_keys = ON;

INSERT INTO usuarios (
  email,
  password_hash,
  nome,
  perfil,
  funcionario_id,
  active,
  created_at,
  updated_at
)
SELECT
  'filipe.daumas@icloud.com',
  '$2b$10$g2ndd.4BDOPg4O0vb.7cGeX88MhzayrKRiwomRatJkuyfKkj9XWPG',
  'Filipe Passaroni Daumas',
  'ADMIN',
  (
    SELECT f.id
    FROM funcionarios f
    WHERE f.deleted_at IS NULL
      AND (
        lower(f.email) = lower('filipe.daumas@voecostadosol.com.br')
        OR lower(f.nome) = lower('Filipe Passaroni Daumas')
      )
    ORDER BY CASE WHEN f.empresa_id = 6 THEN 0 ELSE 1 END, f.id
    LIMIT 1
  ),
  1,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM usuarios
  WHERE lower(email) = lower('filipe.daumas@icloud.com')
    AND deleted_at IS NULL
);

UPDATE usuarios
SET password_hash = '$2b$10$g2ndd.4BDOPg4O0vb.7cGeX88MhzayrKRiwomRatJkuyfKkj9XWPG',
    nome = 'Filipe Passaroni Daumas',
    perfil = 'ADMIN',
    funcionario_id = COALESCE(
      funcionario_id,
      (
        SELECT f.id
        FROM funcionarios f
        WHERE f.deleted_at IS NULL
          AND (
            lower(f.email) = lower('filipe.daumas@voecostadosol.com.br')
            OR lower(f.nome) = lower('Filipe Passaroni Daumas')
          )
        ORDER BY CASE WHEN f.empresa_id = 6 THEN 0 ELSE 1 END, f.id
        LIMIT 1
      )
    ),
    active = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE lower(email) = lower('filipe.daumas@icloud.com');

INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
SELECT u.id, e.id, 'admin', 1, datetime('now')
FROM usuarios u
JOIN empresas e ON e.codigo = 'airtrust' AND e.deleted_at IS NULL
WHERE lower(u.email) = lower('filipe.daumas@icloud.com')
  AND NOT EXISTS (
    SELECT 1
    FROM usuarios_empresas ue
    WHERE ue.usuario_id = u.id AND ue.empresa_id = e.id
  );

INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
SELECT u.id, f.empresa_id, 'admin', 0, datetime('now')
FROM usuarios u
JOIN funcionarios f ON f.id = u.funcionario_id
WHERE lower(u.email) = lower('filipe.daumas@icloud.com')
  AND f.empresa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM usuarios_empresas ue
    WHERE ue.usuario_id = u.id AND ue.empresa_id = f.empresa_id
  );

UPDATE usuarios_empresas
SET is_primary = 0,
    role = CASE WHEN role = 'viewer' THEN 'admin' ELSE role END
WHERE usuario_id = (
  SELECT id FROM usuarios WHERE lower(email) = lower('filipe.daumas@icloud.com') LIMIT 1
);

UPDATE usuarios_empresas
SET role = 'admin',
    is_primary = 1
WHERE usuario_id = (
  SELECT id FROM usuarios WHERE lower(email) = lower('filipe.daumas@icloud.com') LIMIT 1
)
  AND empresa_id = (
    SELECT id FROM empresas WHERE codigo = 'airtrust' AND deleted_at IS NULL LIMIT 1
  );

UPDATE lms_cursos
SET ativo = 0,
    publicado = 0,
    deleted_at = COALESCE(deleted_at, datetime('now')),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND titulo IN ('SCORM Upload Test', 'UI SCORM Upload Test', 'SCORM Null Payload Smoke');

UPDATE lms_matriculas
SET deleted_at = COALESCE(deleted_at, datetime('now')),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND curso_id IN (
    SELECT id
    FROM lms_cursos
    WHERE titulo IN ('SCORM Upload Test', 'UI SCORM Upload Test', 'SCORM Null Payload Smoke')
  );

UPDATE lms_progresso_scorm
SET updated_at = datetime('now'),
    cmi_json = COALESCE(cmi_json, '{}')
WHERE matricula_id IN (
    SELECT id
    FROM lms_matriculas
    WHERE curso_id IN (
      SELECT id
      FROM lms_cursos
      WHERE titulo IN ('SCORM Upload Test', 'UI SCORM Upload Test', 'SCORM Null Payload Smoke')
    )
  );

-- Substitui placeholders gerados pela anonimização ("Funcionario DEV %")
-- por uma lista de nomes fictícios para ambiente de desenvolvimento local.
-- Isso é idempotente: só afeta registros com nome no padrão gerado.
WITH fake_names AS (
  SELECT 1 AS rn, 'Ana Beatriz Silva' AS nome
  UNION ALL SELECT 2, 'Bruno Costa'
  UNION ALL SELECT 3, 'Carlos Eduardo Pereira'
  UNION ALL SELECT 4, 'Daniela Rocha'
  UNION ALL SELECT 5, 'Eduardo Almeida'
  UNION ALL SELECT 6, 'Fernanda Lima'
  UNION ALL SELECT 7, 'Gustavo Carvalho'
  UNION ALL SELECT 8, 'Helena Souza'
  UNION ALL SELECT 9, 'Igor Mendes'
  UNION ALL SELECT 10, 'Juliana Torres'
  UNION ALL SELECT 11, 'Lucas Oliveira'
  UNION ALL SELECT 12, 'Mariana Ribeiro'
  UNION ALL SELECT 13, 'Natan Santos'
  UNION ALL SELECT 14, 'Olivia Martins'
  UNION ALL SELECT 15, 'Pedro Henrique Gomes'
  UNION ALL SELECT 16, 'Rafaela Castro'
  UNION ALL SELECT 17, 'Samuel Barbosa'
  UNION ALL SELECT 18, 'Tais Nogueira'
  UNION ALL SELECT 19, 'Vinicius Ferreira'
  UNION ALL SELECT 20, 'Yasmin Correia'
  UNION ALL SELECT 21, 'Andre Figueiredo'
  UNION ALL SELECT 22, 'Barbara Pinto'
  UNION ALL SELECT 23, 'Caio Monteiro'
  UNION ALL SELECT 24, 'Debora Moreira'
  UNION ALL SELECT 25, 'Everton Dias'
  UNION ALL SELECT 26, 'Flavia Cardoso'
  UNION ALL SELECT 27, 'Gabriel Araujo'
  UNION ALL SELECT 28, 'Heloisa Pires'
  UNION ALL SELECT 29, 'Italo Rodrigues'
  UNION ALL SELECT 30, 'Jaqueline Menezes'
  UNION ALL SELECT 31, 'Katia Alves'
  UNION ALL SELECT 32, 'Leonardo Santos'
  UNION ALL SELECT 33, 'Marcio Ramos'
  UNION ALL SELECT 34, 'Marcelo Guimaraes'
  UNION ALL SELECT 35, 'Natalia Faria'
  UNION ALL SELECT 36, 'Otavio Teixeira'
  UNION ALL SELECT 37, 'Priscila Lima'
  UNION ALL SELECT 38, 'Ricardo Nascimento'
  UNION ALL SELECT 39, 'Sabrina Azevedo'
  UNION ALL SELECT 40, 'Thiago Martins'
  UNION ALL SELECT 41, 'Ursula Rocha'
  UNION ALL SELECT 42, 'Wagner Nunes'
  UNION ALL SELECT 43, 'Xavier Duarte'
  UNION ALL SELECT 44, 'Yuri Pessoa'
  UNION ALL SELECT 45, 'Zelia Campos'
  UNION ALL SELECT 46, 'Adriana Freitas'
  UNION ALL SELECT 47, 'Brenda Lopes'
  UNION ALL SELECT 48, 'Caua Ribeiro'
  UNION ALL SELECT 49, 'Denise Martins'
  UNION ALL SELECT 50, 'Elias Soares'
), matches AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM funcionarios
  WHERE nome LIKE 'Funcionario DEV %' AND deleted_at IS NULL
)
UPDATE funcionarios
SET nome = (
  SELECT fn.nome
  FROM fake_names fn
  WHERE fn.rn = (((SELECT rn FROM matches m WHERE m.id = funcionarios.id) - 1) % (SELECT COUNT(*) FROM fake_names)) + 1
)
WHERE id IN (SELECT id FROM matches);

-- Mesmo tratamento para legacy_funcionarios, se existir
WITH fake_names_legacy AS (
  SELECT 1 AS rn, 'Ana Beatriz Silva' AS nome
  UNION ALL SELECT 2, 'Bruno Costa'
  UNION ALL SELECT 3, 'Carlos Eduardo Pereira'
  UNION ALL SELECT 4, 'Daniela Rocha'
  UNION ALL SELECT 5, 'Eduardo Almeida'
), matches_legacy AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM legacy_funcionarios
  WHERE nome LIKE 'Legacy DEV %'
)
UPDATE legacy_funcionarios
SET nome = (
  SELECT fn.nome
  FROM fake_names_legacy fn
  WHERE fn.rn = (((SELECT rn FROM matches_legacy m WHERE m.id = legacy_funcionarios.id) - 1) % (SELECT COUNT(*) FROM fake_names_legacy)) + 1
)
WHERE id IN (SELECT id FROM matches_legacy);