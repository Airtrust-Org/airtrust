-- Migration 0367: SK76 — Reaquisição de Experiência Recente
-- Cria 8 novas manobras SK76 + 1 modelo de sessão AERONAVE com 22 manobras.
-- Totalmente idempotente: INSERT OR IGNORE em todos os blocos.
-- Tabelas: manobras, modelos_sessao, modelos_sessao_manobras (modelo_id, manobra_id, ordem)

-- ============================================================
-- PARTE 1 — 8 NOVAS MANOBRAS SK76
-- ============================================================

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-PRE-01',
  'Verificação do diário de bordo e aceite da aeronave',
  'Preparação e Planejamento (PRE)',
  'Verificação do Diário de Bordo (DB) da aeronave: conferência de horas/ciclos, últimas manutenções realizadas, discrepâncias abertas e status de aeronavegabilidade; aceite formal da aeronave pelo piloto em comando antes do voo; verificação da validade dos documentos a bordo (CA, RAB, apólice de seguro, manual de voo). (Ref: RBAC 91 | MGO SK76 — Procedimentos de Aceite)',
  'BASICO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-PRE-02',
  'Walkaround e inspeção externa',
  'Preparação e Planejamento (PRE)',
  'Inspeção pré-voo externa completa do SK76 seguindo o roteiro do RFM: rotor principal (pás, cabeça de rotor, amortecedores), fuselagem, tomadas estáticas, compartimento de motor (visível), trem de pouso, rotor de cauda (pás, caixa de cauda TGB, IGB), luzes externas e antenas. Confirmação de ausência de danos, vazamentos e obstruções. (Ref: RFM SK76, Seção 4 — Pre-Flight Inspection)',
  'BASICO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-PRE-03',
  'Verificação interna e documentação da aeronave',
  'Preparação e Planejamento (PRE)',
  'Verificação interna do cockpit: posicionamento de controles, estado de instrumentos (EFIS, IIDS), verificação de circuitos disjuntores (circuit breakers), equipamentos de segurança (ELT, coletes, balsas conforme aplicável), documentação obrigatória a bordo e checklist de inspeção interna conforme QRH SK76. (Ref: QRH SK76, Normal Procedures — Before Starting Engines)',
  'BASICO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-PRE-04',
  'Planejamento, peso e balanceamento',
  'Preparação e Planejamento (PRE)',
  'Planejamento operacional completo: cálculo de MTOW, peso operacional vazio, carga paga e combustível; verificação do envelope de CG (longitudinal e lateral) com planilha de Peso e Balanceamento do SK76; inserção dos dados no GPS/FMS (Primus 701); análise de METAR/TAF; verificação de NOTAM e seleção de alternado. (Ref: RFM SK76, Seção 5 — Weight & Balance | RBAC 91)',
  'BASICO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-COM-01',
  'Equipamentos de comunicação e navegação',
  'Procedimentos Normais',
  'Seleção e configuração dos equipamentos de comunicação (VHF COM 1/COM 2) e navegação (VOR, ADF, DME, GPS/FMS Primus 701) para a missão; sintonização de frequências ATC e rádio da plataforma; verificação de recepção e identificação de VOR/NDB; setup de transponder (modo C/S) e TCAS se instalado. (Ref: Primus 701 Guide SK76 | AIP Brasil — COM/NAV setup)',
  'BASICO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-ATC-01',
  'Comunicações e interação com órgãos ATC',
  'Gestão de Recursos de Tripulação (CRM)',
  'Uso consistente de fraseologia padrão ICAO/DECEA em todas as fases do voo (solo, decolagem, cruzeiro, aproximação e pouso); readbacks corretos de autorizações e instruções ATC; comunicação em situações não normais (Pan-Pan, prioridade de pouso); coordenação assertiva PF/PM nas comunicações; reporte de posição em rota offshore conforme procedimentos de corredor. (Ref: AIP Brasil — Fraseologia ICAO | FAP: FAP05.2 C3.1, C3.2)',
  'INTERMEDIARIO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-CRM-01',
  'Callouts, briefings e padronização operacional',
  'Gestão de Recursos de Tripulação (CRM)',
  'Execução disciplinada de callouts padrão em todas as fases críticas do voo (power check, TDP/LDP, altitudes, V-speeds, minimums, approach stable); briefings estruturados antes de cada procedimento; disciplina de cockpit estéril (Sterile Cockpit Rule) abaixo de transição; conformidade com MGO/SOP em todos os procedimentos; avaliação de CRM, iniciativa e qualidade das decisões ao longo da sessão. (Ref: MGO SK76 | SOP — Standard Callouts)',
  'BASICO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-NDT-00',
  'Decolagem noturna',
  'Operações de Solo e Decolagem (SOL)',
  'Execução de decolagem noturna no SK76: verificação de iluminação de painel e luzes externas antes da decolagem; transição rigorosa e imediata para instrumentos após liftoff em ambiente noturno; prevenção de desorientação espacial e ilusão de "lure" de luzes externas; gestão de DAFCS nos modos de subida; chamadas de V-speeds e altitudes conforme SOP. (Ref: RFM SK76, Seção 4 | MGO — Operações Noturnas)',
  'INTERMEDIARIO',
  'SK76'
);

-- ============================================================
-- PARTE 2 — MODELO DE SESSÃO
-- tipo = 'AERONAVE', modelo_aeronave = 'SK76', tipo_sessao_id = 9 (PER)
-- ============================================================

INSERT OR IGNORE INTO modelos_sessao (codigo, nome, tipo, descricao, modelo_aeronave, tipo_sessao_id, ativo)
VALUES (
  'S76-REQ-01',
  'SK76 - REAQUISIÇÃO DE EXPERIÊNCIA RECENTE',
  'AERONAVE',
  'Sessão de reaquisição de experiência recente para pilotos do SK76 com experiência recente vencida (31 a 90+ dias). Cobre todos os itens da ementa FORM-OPS-094 Rev00: pré-voo, planejamento, partida, táxi, decolagem VFR e IFR, subida, cruzeiro, navegação, procedimentos de espera, aproximações NPA e ILS, pouso em UM e em aeródromo, CRM e padronização operacional. (Ref: FORM-OPS-094 Rev00 — FTV-SK76-ANV-REQ)',
  'SK76',
  9,
  1
);

-- ============================================================
-- PARTE 3 — 22 VÍNCULOS MANOBRA-MODELO
-- UNIQUE(modelo_id, manobra_id) garante idempotência via INSERT OR IGNORE
-- ============================================================

-- Bloco 1: Pré-voo e Planejamento (1–4)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 1, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-PRE-04';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 2, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-PRE-01';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 3, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-PRE-02';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 4, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-PRE-03';

-- Bloco 2: Solo e Partida (5–8)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 5, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-COM-01';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 6, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-05';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 7, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-NVF-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 8, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-HOV-00';

-- Bloco 3: Decolagem e Saída (9–13)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 9, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-08';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 10, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-TDP-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 11, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-NDT-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 12, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-09';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 13, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-10';

-- Bloco 4: Navegação, Aproximação e Pouso (14–18)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 14, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-11';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 15, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-18';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 16, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-ILS-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 17, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-RNV-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 18, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LDP-00';

-- Bloco 5: CRM e Padronização (19–22)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 19, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-ATC-01';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 20, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-CRM-01';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 21, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-21';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 22, 1 FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-REQ-01' AND m.codigo = 'S76-LOFT-22';
