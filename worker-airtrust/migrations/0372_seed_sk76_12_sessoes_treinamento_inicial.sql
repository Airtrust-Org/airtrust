-- =============================================================================
-- 0372: SK76 — Treinamento Inicial (12 sessões)
-- Cria 12 modelos de sessão INICIAL para o SK76 e vincula as manobras
-- já existentes (migração 0222) em ordem com classificação PF em observacoes.
-- Idempotente: ON CONFLICT DO UPDATE para modelos, DELETE+INSERT para vínculos.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: MODELOS DE SESSÃO (12 sessões)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ordem_no_treinamento, duracao_estimada, modelo_aeronave, tipo_sessao_id, created_at, updated_at)
VALUES
(
  'SK76-I-01/12',
  '01/12 - FAMILIARIZAÇÃO VFR, PROCEDIMENTOS BÁSICOS E PRIMEIRAS ANORMALIDADES',
  'INICIAL',
  'Familiarização com o SK76, procedimentos normais VFR e introdução às principais anormalidades de motor, combustível, óleo e hidráulico.',
  1, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-02/12',
  '02/12 - EMERGÊNCIAS DE MOTOR, OEI E AUTORROTAÇÃO',
  'INICIAL',
  'Aprofundamento em falhas de motor (Categorias A e B), pairado, cruzeiro e aproximação. Autorrotação para água. Introdução a aproximações OEI.',
  2, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-03/12',
  '03/12 - SISTEMA ELÉTRICO, BARRAS, GERADORES E REFERÊNCIAS',
  'INICIAL',
  'Falhas no sistema elétrico DC e AC, inversores, barramento essencial, feeder e perda de referências 26 VAC e EFIS. Voo IFR com aproximações de precisão e não precisão.',
  3, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-04/12',
  '04/12 - INTRODUÇÃO IFR, NAVEGAÇÃO E APROXIMAÇÕES',
  'INICIAL',
  'Programação GPS/HSI/EFIS, decolagem SID, aproximações ILS/RNP/VOR/NDB, arremetida e aproximação perdida IFR. Introdução a falhas de piloto automático e flight director.',
  4, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-05/12',
  '05/12 - AFCS, FLIGHT DIRECTOR, EFIS E DEGRADAÇÕES EM IFR',
  'INICIAL',
  'Falhas de AFCS, flight director, EFIS e dados de voo. Operação IFR em modo degradado. Consolidação de aproximações OEI e falhas de motor em IFR.',
  5, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-06/12',
  '06/12 - POWERPLANT AVANÇADO, DECU E FALHAS COMBINADAS DE MOTOR',
  'INICIAL',
  'Revisão completa do sistema DECU (falhas menor, degradada, total em 1 ou 2 motores). Consolidação de todas as categorias de falha de motor e combustível.',
  6, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-07/12',
  '07/12 - FALHAS DUPLAS, ENERGIA E GERENCIAMENTO DE EMERGÊNCIA',
  'INICIAL',
  'Falhas duplas de motor em pairado, decolagem e cruzeiro. Autorrotação e gerenciamento de emergência com múltiplas falhas simultâneas.',
  7, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-08/12',
  '08/12 - MGB, TRANSMISSÃO, ROTOR DE CAUDA E HIDRÁULICO',
  'INICIAL',
  'Falhas na MGB, transmissão, servo do rotor de cauda, amortecedores e sistema hidráulico principal. Consolidação de manobras OEI e aproximações IFR.',
  8, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-09/12',
  '09/12 - FOGO, FUMAÇA, EMERGÊNCIA EM CABINE E ALTO ESTRESSE',
  'INICIAL',
  'Incêndio no motor, cabine e compartimento de bagagem. Fumaça na cabine. Gerenciamento de múltiplas emergências sob alto estresse.',
  9, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-10/12',
  '10/12 - OPERAÇÃO IFR/OEI COMPLEXA E APROXIMAÇÕES CRÍTICAS',
  'INICIAL',
  'Integração de falhas de motor com operação IFR avançada. Aproximações de precisão e não precisão com OEI. Gestão de AFCS em voo IFR degradado.',
  10, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-11/12',
  '11/12 - LOFT / LINE ORIENTED FLIGHT TRAINING',
  'INICIAL',
  'Voo orientado por linha com cenário operacional realista. Integração de todas as habilidades técnicas e de CRM. Falhas inseridas no contexto de missão.',
  11, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
),
(
  'SK76-I-12/12',
  '12/12 - PROFICIENCY CHECK / CONSOLIDAÇÃO FINAL',
  'INICIAL',
  'Verificação de proficiência final cobrindo todas as manobras críticas: motor, duplas, IFR, AFCS, elétrico, fogo, MGB e hidráulico.',
  12, 120, 'SK76',
  (SELECT id FROM tipos_sessao WHERE deleted_at IS NULL AND (UPPER(codigo) IN ('INI','INICIAL') OR UPPER(nome) LIKE '%INICIAL%') ORDER BY id LIMIT 1),
  datetime('now'), datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome               = excluded.nome,
  tipo               = excluded.tipo,
  descricao          = excluded.descricao,
  ordem_no_treinamento = excluded.ordem_no_treinamento,
  duracao_estimada   = excluded.duracao_estimada,
  modelo_aeronave    = excluded.modelo_aeronave,
  tipo_sessao_id     = COALESCE(excluded.tipo_sessao_id, modelos_sessao.tipo_sessao_id),
  updated_at         = datetime('now'),
  deleted_at         = NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: VÍNCULOS MANOBRAS → MODELOS
-- observacoes armazena a classificação PF: 'A', 'B' ou 'AB'
-- ─────────────────────────────────────────────────────────────────────────────

-- Limpa vínculos antigos para re-inserção determinística
DELETE FROM modelos_sessao_manobras
WHERE modelo_id IN (
  SELECT id FROM modelos_sessao
  WHERE codigo IN (
    'SK76-I-01/12','SK76-I-02/12','SK76-I-03/12','SK76-I-04/12',
    'SK76-I-05/12','SK76-I-06/12','SK76-I-07/12','SK76-I-08/12',
    'SK76-I-09/12','SK76-I-10/12','SK76-I-11/12','SK76-I-12/12'
  )
);

-- ── SESSÃO 01/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  4, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  5, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  6, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  8, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCUMN' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 10, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCUDG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-COMBX' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FLWNR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 13, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-OILMT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGC' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-01/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;

-- ── SESSÃO 02/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  3, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  4, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  5, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  7, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 10, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCU1M' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 11, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCU2M' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-N1TQF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 13, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-OILMT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-COMBX' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FLWNR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-02/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;

-- ── SESSÃO 03/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGC' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  3, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-SOBGD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  4, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  5, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALEB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALIV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALFF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PER26' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id,  9, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALRM' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 10, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALEF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALAD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PERAT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 13, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-03/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;

-- ── SESSÃO 04/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  4, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  5, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  7, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  8, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id,  9, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALPA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 10, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALFD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALTS' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALAD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 13, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PERAT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 14, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PER26' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MGBSF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-04/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-INCMO' AND deleted_at IS NULL;

-- ── SESSÃO 05/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALPA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALFD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALTS' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  4, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALEF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  5, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALAD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  6, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PERAT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALRM' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 10, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 13, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-COMBX' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-05/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FLWNR' AND deleted_at IS NULL;

-- ── SESSÃO 06/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCUMN' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCUDG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCU1M' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  4, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCU2M' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  5, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  6, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 10, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-N1TQF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 11, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-COMBX' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 12, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FLWNR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 13, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-OILMT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-06/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;

-- ── SESSÃO 07/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  1, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DUAHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  2, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DUADC' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DUACZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  4, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  5, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  6, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  7, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  8, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 10, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 13, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DCU2M' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-COMBX' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-07/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-INCMO' AND deleted_at IS NULL;

-- ── SESSÃO 08/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MGBSF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MGBOL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-CHPTG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  4, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-SERTQ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  5, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-SERJM' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AMOTV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  7, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-TRSRC' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  8, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-CTRRC' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 10, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 13, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-08/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;

-- ── SESSÃO 09/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-INCMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-INCCB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FUMBG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  4, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-OILMT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  5, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MGBOL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MGBSF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALEB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 10, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALIV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 13, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-09/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;

-- ── SESSÃO 10/12 ─────────────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  4, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  5, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id,  9, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 10, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 12, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALPA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 13, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALFD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PERAT' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALAD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-10/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-INCMO' AND deleted_at IS NULL;

-- ── SESSÃO 11/12 (LOFT) ──────────────────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-PRGGP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  2, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DECSI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  3, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  4, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  5, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id,  9, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 10, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGC' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 11, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 12, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALPA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 13, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALFD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-INCMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MGBSF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 17, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 18, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXAL' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-11/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCB' AND deleted_at IS NULL;

-- ── SESSÃO 12/12 (PROFICIENCY CHECK) ─────────────────────────────────────────
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  1, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUAB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  2, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-POUMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  3, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-AUTAG' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  4, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  5, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCB' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  6, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  7, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTCZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  8, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MOTAP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id,  9, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DUAHV' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 10, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DUADC' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 11, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-DUACZ' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 12, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPR' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 13, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXNP' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 14, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXOI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 15, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-APXPI' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 16, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-ARRIF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 17, 1, 'PF:A',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALPA' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 18, 1, 'PF:B',  datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALFD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 19, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-FALGD' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 20, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-INCMO' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 21, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-MGBSF' AND deleted_at IS NULL;
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at)
SELECT (SELECT id FROM modelos_sessao WHERE codigo='SK76-I-12/12'), id, 22, 1, 'PF:AB', datetime('now'), datetime('now') FROM manobras WHERE codigo='76-HIDPB' AND deleted_at IS NULL;
