-- Fix names and descriptions for S76 LOFT manobras

UPDATE manobras SET nome = 'Cálculo de Performance', descricao = 'Precisão em MTOW, CTO1/CTO2, RTO e velocidades ($V_{OSS}$, $V_{1}$, $V_{2}$) para PA/TAS em helidecks offshore CAT A/PC. (RFM SK76, Cap. 5)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-01' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Análise de Clima e NOTAM', descricao = 'Avaliação de helipontos offshore/onshore, mínimos IFR/VFR e OEI charts do SK76.', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-02' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Configuração de Aviônica (FMS)', descricao = 'Inicialização Honeywell Primus, flight plan via CDU, ZFW/combustível e GPS/VOR/ILS setup. (Primus Guide SK76, Cap. 4)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-03' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Briefing de Partida', descricao = 'PF/PM roles, perfis Vertical/RAIM e ações OEI pré/pós TDP com climb gradients. (RFM SK76, Seção 4)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-04' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Disciplina de Checklist', descricao = 'Execução fluida das normal checklists com verificação real antes de "checked". (QRH SK76, Normal Procedures)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-05' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Monitoramento de Sistemas', descricao = '$T_q$, ITT (<850°C start), $N_g$ (95-102%), $N_f$ e hidráulicos no start/táxi. (SK76 CEL Manual, Cap. 1)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-06' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Hover Check', descricao = 'Margem OGE/IGE (~5ft), cyclic centering e AFCS stability antes forward transition. (RFM SK76, Seção 4)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-07' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Perfil de Decolagem', descricao = 'Trajetórias CAT A (CTO1/CTO2 ou RTO) com V-Speeds e potência planned. (RFM SK76, Seção 4)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-08' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Gerenciamento do AFCS', descricao = 'Modos SAS/ATT/HDG/ALT com callouts claros no CAS/PFD. (Primus AFCS Guide SK76, Cap. 15)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-09' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Flight Path Monitoring', descricao = 'PM monitora altitude/heading/Vne (140-155 KIAS), alertando desvios.', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-10' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Navegação e FMS em Rota', descricao = 'Direct-to e waypoints via dual CDU/FMS eficientemente. (Primus FMS Guide, Cap. 9)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-11' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Consciência Situacional', descricao = 'MFDs (moving map, WXR, TAWS) para terrain/weather avoidance. (Primus Guide, Cap. 8-9)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-12' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Identificação e Diagnóstico', descricao = 'Leitura prioritária CAS (red/amber) com cross-check instruments. (RFM SK76, Seção 3)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-13' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Ações de Memória', descricao = 'Memory Items imediatos (ex: Engine Fire: Fuel Off, Rotor Brake Off). (RFM/QRH SK76, Seção 3)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-14' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Aplicação do QRH', descricao = 'Lookup rápido e execução precisa de malfunctions/emergencies. (QRH SK76)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-15' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Tomada de Decisão', descricao = 'FORDEC para land ASAP, cont OEI ou divert com performance charts.', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-16' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Gestão de Potência OEI', descricao = 'Limites $T_q$/ITT (2min/6min/Cont) no motor remanescente. (RFM SK76, Seção 3)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-17' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Briefing de Aproximação', descricao = 'Estratégia IFR/VFR, missed approach e go-around criteria.', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-18' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Estabilização da Aproximação', descricao = 'Config final estável 500ft até 100ft AGL (IAS/sink).', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-19' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Técnica de Pouso OEI', descricao = 'Asymmetric thrust control com collective cushion touchdown. (QRH SK76, OEI Landing)', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-20' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Comunicação e Coordenação', descricao = 'Sterile cockpit, standard phraseology e task sharing PF/PM.', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-21' AND deleted_at IS NULL;

UPDATE manobras SET nome = 'Autocrítica e Análise', descricao = 'Debrief honesto com TEM threats/errors para safety operacional.', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-22' AND deleted_at IS NULL;

-- Verification: list updated rows for the SK76 model
SELECT msm.ordem, m.codigo, m.nome, m.descricao
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
JOIN manobras m ON m.id = msm.manobra_id
WHERE ms.nome = 'SK76 - PERIÓDICO - 03/03: LOFT E CHECK' AND msm.deleted_at IS NULL
ORDER BY msm.ordem;
