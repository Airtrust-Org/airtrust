-- 0284: Corrige modelo SK76 - PERIÓDICO - 03/03: LOFT E CHECK
-- Garante categorias, manobras S76-LOFT-01..22 e o vínculo exato com o modelo.

BEGIN TRANSACTION;

INSERT INTO manobras_categorias (
  codigo, nome, descricao, cor, ordem, ativo, created_at, updated_at
)
VALUES
  ('PRE', 'Preparação e Planejamento', 'Preparação e planejamento pré-voo.', '#1F77B4', 1, 1, datetime('now'), datetime('now')),
  ('SOL', 'Operações de Solo e Decolagem', 'Operações de solo, start, táxi e decolagem.', '#FF7F0E', 2, 1, datetime('now'), datetime('now')),
  ('VOO', 'Condução do Voo e Automação', 'Condução do voo, navegação e uso da automação.', '#2CA02C', 3, 1, datetime('now'), datetime('now')),
  ('EME', 'Gestão de Falhas e Emergências', 'Gestão de falhas, memory items e QRH.', '#D62728', 4, 1, datetime('now'), datetime('now')),
  ('APR', 'Aproximação e Pouso', 'Briefing, estabilização e técnicas de pouso.', '#9467BD', 5, 1, datetime('now'), datetime('now')),
  ('CRM', 'Debriefing e CRM Geral', 'Comunicação, coordenação e debriefing.', '#8C564B', 6, 1, datetime('now'), datetime('now'))
ON CONFLICT(codigo) DO UPDATE SET
  nome = excluded.nome,
  descricao = excluded.descricao,
  cor = excluded.cor,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  updated_at = datetime('now'),
  deleted_at = NULL;

INSERT INTO manobras (
  codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, created_at, updated_at
)
VALUES
  ('S76-LOFT-01','Cálculo de Performance','Precisão em MTOW, CTO1/CTO2, RTO e velocidades ($V_{OSS}$, $V_{1}$, $V_{2}$) para PA/TAS em helidecks offshore CAT A/PC. (RFM SK76, Cap. 5)','PRE','PER','SK76',1,datetime('now'),datetime('now')),
  ('S76-LOFT-02','Análise de Clima e NOTAM','Avaliação de helipontos offshore/onshore, mínimos IFR/VFR e OEI charts do SK76.','PRE','PER','SK76',2,datetime('now'),datetime('now')),
  ('S76-LOFT-03','Configuração de Aviônica (FMS)','Inicialização Honeywell Primus, flight plan via CDU, ZFW/combustível e GPS/VOR/ILS setup. (Primus Guide SK76, Cap. 4)','PRE','PER','SK76',3,datetime('now'),datetime('now')),
  ('S76-LOFT-04','Briefing de Partida','PF/PM roles, perfis Vertical/RAIM e ações OEI pré/pós TDP com climb gradients. (RFM SK76, Seção 4)','PRE','PER','SK76',4,datetime('now'),datetime('now')),
  ('S76-LOFT-05','Disciplina de Checklist','Execução fluida das normal checklists com verificação real antes de "checked". (QRH SK76, Normal Procedures)','SOL','PER','SK76',5,datetime('now'),datetime('now')),
  ('S76-LOFT-06','Monitoramento de Sistemas','$T_q$, ITT (<850°C start), $N_g$ (95-102%), $N_f$ e hidráulicos no start/táxi. (SK76 CEL Manual, Cap. 1)','SOL','PER','SK76',6,datetime('now'),datetime('now')),
  ('S76-LOFT-07','Hover Check','Margem OGE/IGE (~5ft), cyclic centering e AFCS stability antes forward transition. (RFM SK76, Seção 4)','SOL','PER','SK76',7,datetime('now'),datetime('now')),
  ('S76-LOFT-08','Perfil de Decolagem','Trajetórias CAT A (CTO1/CTO2 ou RTO) com V-Speeds e potência planned. (RFM SK76, Seção 4)','SOL','PER','SK76',8,datetime('now'),datetime('now')),
  ('S76-LOFT-09','Gerenciamento do AFCS','Modos SAS/ATT/HDG/ALT com callouts claros no CAS/PFD. (Primus AFCS Guide SK76, Cap. 15)','VOO','PER','SK76',9,datetime('now'),datetime('now')),
  ('S76-LOFT-10','Flight Path Monitoring','PM monitora altitude/heading/Vne (140-155 KIAS), alertando desvios.','VOO','PER','SK76',10,datetime('now'),datetime('now')),
  ('S76-LOFT-11','Navegação e FMS em Rota','Direct-to e waypoints via dual CDU/FMS eficientemente. (Primus FMS Guide, Cap. 9)','VOO','PER','SK76',11,datetime('now'),datetime('now')),
  ('S76-LOFT-12','Consciência Situacional','MFDs (moving map, WXR, TAWS) para terrain/weather avoidance. (Primus Guide, Cap. 8-9)','VOO','PER','SK76',12,datetime('now'),datetime('now')),
  ('S76-LOFT-13','Identificação e Diagnóstico','Leitura prioritária CAS (red/amber) com cross-check instruments. (RFM SK76, Seção 3)','EME','PER','SK76',13,datetime('now'),datetime('now')),
  ('S76-LOFT-14','Ações de Memória','Memory Items imediatos (ex: Engine Fire: Fuel Off, Rotor Brake Off). (RFM/QRH SK76, Seção 3)','EME','PER','SK76',14,datetime('now'),datetime('now')),
  ('S76-LOFT-15','Aplicação do QRH','Lookup rápido e execução precisa de malfunctions/emergencies. (QRH SK76)','EME','PER','SK76',15,datetime('now'),datetime('now')),
  ('S76-LOFT-16','Tomada de Decisão','FORDEC para land ASAP, cont OEI ou divert com performance charts.','EME','PER','SK76',16,datetime('now'),datetime('now')),
  ('S76-LOFT-17','Gestão de Potência OEI','Limites $T_q$/ITT (2min/6min/Cont) no motor remanescente. (RFM SK76, Seção 3)','EME','PER','SK76',17,datetime('now'),datetime('now')),
  ('S76-LOFT-18','Briefing de Aproximação','Estratégia IFR/VFR, missed approach e go-around criteria.','APR','PER','SK76',18,datetime('now'),datetime('now')),
  ('S76-LOFT-19','Estabilização da Aproximação','Config final estável 500ft até 100ft AGL (IAS/sink).','APR','PER','SK76',19,datetime('now'),datetime('now')),
  ('S76-LOFT-20','Técnica de Pouso OEI','Asymmetric thrust control com collective cushion touchdown. (QRH SK76, OEI Landing)','APR','PER','SK76',20,datetime('now'),datetime('now')),
  ('S76-LOFT-21','Comunicação e Coordenação','Sterile cockpit, standard phraseology e task sharing PF/PM.','CRM','PER','SK76',21,datetime('now'),datetime('now')),
  ('S76-LOFT-22','Autocrítica e Análise','Debrief honesto com TEM threats/errors para safety operacional.','CRM','PER','SK76',22,datetime('now'),datetime('now'))
ON CONFLICT(codigo) DO UPDATE SET
  nome = excluded.nome,
  descricao = excluded.descricao,
  categoria = excluded.categoria,
  tipo_sessao = excluded.tipo_sessao,
  tipo_aeronave = excluded.tipo_aeronave,
  ordem = excluded.ordem,
  updated_at = datetime('now'),
  deleted_at = NULL;

DELETE FROM modelos_sessao_manobras
WHERE modelo_id = (
  SELECT id
  FROM modelos_sessao
  WHERE nome = 'SK76 - PERIÓDICO - 03/03: LOFT E CHECK'
    AND deleted_at IS NULL
  LIMIT 1
);

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT
  ms.id,
  m.id,
  CAST(SUBSTR(m.codigo, -2) AS INTEGER) AS ordem,
  1,
  datetime('now'),
  datetime('now')
FROM modelos_sessao ms
JOIN manobras m
  ON m.codigo IN (
    'S76-LOFT-01','S76-LOFT-02','S76-LOFT-03','S76-LOFT-04','S76-LOFT-05','S76-LOFT-06',
    'S76-LOFT-07','S76-LOFT-08','S76-LOFT-09','S76-LOFT-10','S76-LOFT-11','S76-LOFT-12',
    'S76-LOFT-13','S76-LOFT-14','S76-LOFT-15','S76-LOFT-16','S76-LOFT-17','S76-LOFT-18',
    'S76-LOFT-19','S76-LOFT-20','S76-LOFT-21','S76-LOFT-22'
  )
WHERE ms.nome = 'SK76 - PERIÓDICO - 03/03: LOFT E CHECK'
  AND ms.deleted_at IS NULL
ORDER BY ordem;

COMMIT;
