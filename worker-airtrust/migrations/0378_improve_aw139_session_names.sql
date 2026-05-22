-- Migration 0378: Melhorar nomes e descrições das sessões INICIAL do AW139
-- Referência: nomenclatura detalhada das sessões do SK76

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 01/12 - FAMILIARIZAÇÃO VFR, PROCEDIMENTOS BÁSICOS E PRIMEIRAS ANORMALIDADES',
    descricao = 'Familiarização com a aeronave AW139, procedimentos básicos de voo VFR e introdução às primeiras anormalidades',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-01/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 02/12 - EMERGÊNCIAS DE MOTOR, OEI E AUTORROTAÇÃO',
    descricao = 'Emergências de motor, operação OEI (One Engine Inoperative) e técnicas de autorrotação',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-02/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 03/12 - SISTEMA ELÉTRICO, BARRAS, GERADORES E ANORMALIDADES',
    descricao = 'Sistema elétrico, configuração de barras, geradores e falhas relacionadas',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-03/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 04/12 - INTRODUÇÃO IFR, NAVEGAÇÃO E APROXIMAÇÕES',
    descricao = 'Introdução ao voo IFR, navegação instrumental e procedimentos de aproximação',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-04/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 05/12 - AFCS, FLIGHT DIRECTOR, EFIS E DEGRADAÇÕES EM IFR',
    descricao = 'AFCS (Automatic Flight Control System), Flight Director, EFIS e degradações em ambiente IFR',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-05/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 06/12 - POWERPLANT AVANÇADO, FADEC E FALHAS COMBINADAS DE MOTOR',
    descricao = 'Powerplant avançado, sistema FADEC e falhas combinadas de motor',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-06/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 07/12 - AVIÔNICOS, FALHAS DUPLAS E GERENCIAMENTO DE EMERGÊNCIA',
    descricao = 'Aviônicos, falhas duplas de sistemas e gerenciamento de emergências',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-07/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 08/12 - MGB, TRANSMISSÃO, ROTOR DE CAUDA E HIDRÁULICO',
    descricao = 'Main Gearbox (MGB), transmissão, rotor de cauda e sistema hidráulico',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-08/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 09/12 - FOGO, FUMAÇA, EMERGÊNCIA EM CABINE E ALTO ESTRESSE',
    descricao = 'Emergências de fogo, fumaça, procedimentos em cabine e gerenciamento de alto estresse',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-09/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 10/12 - OPERAÇÃO OFFSHORE, IFR/OEI COMPLEXA E APROXIMAÇÕES CRÍTICAS',
    descricao = 'Operações offshore, cenários IFR/OEI complexos e aproximações críticas',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-10/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 11/12 - LOFT / LINE ORIENTED FLIGHT TRAINING',
    descricao = 'Treinamento LOFT (Line Oriented Flight Training) e preparação para o check final',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-11/12' AND deleted_at IS NULL;

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - 12/12 - PROFICIENCY CHECK / CONSOLIDAÇÃO FINAL',
    descricao = 'Proficiency check e consolidação final do treinamento inicial AW139',
    updated_at = datetime('now')
WHERE codigo = 'A139-I-12/12' AND deleted_at IS NULL;

-- Verificação
SELECT codigo, nome, descricao FROM modelos_sessao
WHERE codigo LIKE 'A139-I-%'
  AND deleted_at IS NULL
ORDER BY codigo;
