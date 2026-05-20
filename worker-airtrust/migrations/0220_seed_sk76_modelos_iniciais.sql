-- Migration 0220: Seed SK76 - Modelos iniciais (01/03 a 03/03)
-- Objetivo: adicionar modelos SK76 no módulo Simuladores reutilizando manobras/categorias existentes

-- 1) Criar/atualizar 3 modelos SK76 (INICIAL)
INSERT INTO modelos_sessao (
  codigo,
  nome,
  tipo,
  descricao,
  ordem_no_treinamento,
  duracao_estimada,
  modelo_aeronave,
  tipo_sessao_id,
  created_at,
  updated_at
) VALUES
(
  'SK76-I-01/03',
  '01/03 - FAMILIARIZAÇÃO SK76 - VFR BÁSICO',
  'INICIAL',
  'Familiarização com aeronave SK76',
  1,
  120,
  'SK76',
  (
    SELECT id
    FROM tipos_sessao
    WHERE deleted_at IS NULL
      AND (
        UPPER(codigo) IN ('INI', 'INICIAL')
        OR UPPER(nome) LIKE '%INICIAL%'
      )
    ORDER BY id
    LIMIT 1
  ),
  datetime('now'),
  datetime('now')
),
(
  'SK76-I-02/03',
  '02/03 - EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES',
  'INICIAL',
  'Emergências de motor e autorotações no SK76',
  2,
  120,
  'SK76',
  (
    SELECT id
    FROM tipos_sessao
    WHERE deleted_at IS NULL
      AND (
        UPPER(codigo) IN ('INI', 'INICIAL')
        OR UPPER(nome) LIKE '%INICIAL%'
      )
    ORDER BY id
    LIMIT 1
  ),
  datetime('now'),
  datetime('now')
),
(
  'SK76-I-03/03',
  '03/03 - SISTEMA ELÉTRICO & NOTURNO',
  'INICIAL',
  'Falhas elétricas e treinamento noturno no SK76',
  3,
  120,
  'SK76',
  (
    SELECT id
    FROM tipos_sessao
    WHERE deleted_at IS NULL
      AND (
        UPPER(codigo) IN ('INI', 'INICIAL')
        OR UPPER(nome) LIKE '%INICIAL%'
      )
    ORDER BY id
    LIMIT 1
  ),
  datetime('now'),
  datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome = excluded.nome,
  tipo = excluded.tipo,
  descricao = excluded.descricao,
  ordem_no_treinamento = excluded.ordem_no_treinamento,
  duracao_estimada = excluded.duracao_estimada,
  modelo_aeronave = excluded.modelo_aeronave,
  tipo_sessao_id = COALESCE(excluded.tipo_sessao_id, modelos_sessao.tipo_sessao_id),
  updated_at = datetime('now'),
  deleted_at = NULL;

-- 2) Limpar vínculos antigos para manter ordenação determinística
DELETE FROM modelos_sessao_manobras
WHERE modelo_id IN (
  SELECT id
  FROM modelos_sessao
  WHERE codigo IN ('SK76-I-01/03', 'SK76-I-02/03', 'SK76-I-03/03')
);

-- 3) Vincular manobras existentes (sem criar novos códigos/categorias)

-- SK76-I-01/03
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 1, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 2, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 3, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 4, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 5, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 6, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-LOW-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 7, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-HIG-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 8, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-HOT-65';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 9, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-CST-59';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 10, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-OVS-64';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 11, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-NGO-63';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 12, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-CND-61';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 13, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-TNF-62';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 14, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-FLO-73';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 15, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-2FP-74';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 16, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-EFP-75';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 17, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-OIL-18';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 18, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-LIC-60';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 19, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-EEC-18';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 20, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-IDL-16';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 21, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-GER-27';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-01/03'), id, 22, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-17';

-- SK76-I-02/03
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 1, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-17';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 2, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-OUT-15';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 3, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-EEC-18';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 4, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-IDL-16';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 5, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-CST-59';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 6, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-OVS-64';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 7, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-NGO-63';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 8, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-OIL-18';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 9, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-HOT-65';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 10, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-LOW-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 11, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-HIG-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 12, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-LIC-60';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 13, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-CND-61';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 14, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-TNF-62';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 15, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-FLO-73';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 16, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-2FP-74';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 17, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-EFP-75';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 18, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 19, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 20, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 21, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-02/03'), id, 22, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X1';

-- SK76-I-03/03
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 1, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-GEN-11';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 2, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-BAT-14';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 3, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-AUX-14';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 4, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-DCG-53';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 5, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-BOF-55';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 6, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-DCB-56';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 7, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-ACB-57';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 8, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-28D-58';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 9, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 10, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 11, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 12, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 13, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-OUT-15';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 14, 1, datetime('now') FROM manobras WHERE codigo = 'FLY-BAS-17';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 15, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-FLO-73';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 16, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-LOW-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 17, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-HIG-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 18, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-HOT-65';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 19, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-LIC-60';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 20, 1, datetime('now') FROM manobras WHERE codigo = 'WAR-GER-27';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 21, 1, datetime('now') FROM manobras WHERE codigo = 'CAU-HYP-77';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-03/03'), id, 22, 1, datetime('now') FROM manobras WHERE codigo = 'OPS-NRM-X1';
