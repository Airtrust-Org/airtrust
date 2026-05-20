-- Migration 0365: Treinamento Noturno — Unidade Marítima (AW139 e SK76)
-- Cria 21 novas manobras (9 AW139 + 12 SK76) e 2 novos Modelos de Sessão
-- do tipo AERONAVE com 22 manobras cada. Totalmente idempotente (INSERT OR IGNORE).

-- ============================================================
-- PARTE 1A — NOVAS MANOBRAS AW139 (LOFT-NOT-23 a LOFT-NOT-31)
-- ============================================================

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-23',
  'Decolagem Noturna — Unidade Marítima (Helideck)',
  'Operações de Solo e Decolagem (SOL)',
  'Execução do perfil de decolagem noturna a partir de helideck offshore: uso exclusivo de referências de iluminação do deck e instrumentos; gestão da transição para voo pairado e saída noturna do setor da plataforma. Atenção reforçada à perda de referências visuais no afastamento. (Ref: RFM AW139, Cap. 4 | MGO — Operações Noturnas)',
  'INTERMEDIARIO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-24',
  'Transição para Circuito Noturno',
  'Procedimentos Normais',
  'Execução da transição de voo pairado para voo translacional noturno, estabelecendo a aeronave no circuito de tráfego com base exclusivamente em instrumentos e referências de luz da plataforma. Controle de altitude e velocidade durante a fase de transição sem horizonte externo visível. (Ref: RFM AW139, Cap. 4)',
  'INTERMEDIARIO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-25',
  'Perna do Vento (Downwind) Noturna',
  'Procedimentos Normais',
  'Condução da perna do vento no circuito de tráfego noturno offshore: manutenção de altitude, velocidade e alinhamento lateral com referência à iluminação da plataforma; checklists de aproximação; callouts PF/PM disciplinados. (Ref: MGO — Circuito de Tráfego Noturno)',
  'BASICO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-26',
  'Base e Final Noturna — Referências Externas Degradadas',
  'Aproximação e Pouso (APR)',
  'Execução das pernas base e final do circuito noturno com referências visuais externas reduzidas ou ausentes; uso de ângulo de aproximação (HAPI/PAPI ou estimativa visual), instrumentos e iluminação do helideck como únicas referências; identificação e correção de desvios de rampa e alinhamento. (Ref: RFM AW139, Cap. 4 | MGO — Operações Noturnas)',
  'INTERMEDIARIO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-27',
  'Pouso Noturno no Helideck — Referência de Iluminação',
  'Aproximação e Pouso (APR)',
  'Técnica de pouso no helideck em condições noturnas: uso da iluminação perimetral e central do deck como referência primária; controle de razão de descida, centralização sobre o "H" e toque suave; gestão da perda de referências visuais na fase final (últimos 20 ft). Verificação de potência disponível antes do comprometimento. (Ref: RFM AW139, Cap. 4 | MGO — Helideck Noturno)',
  'INTERMEDIARIO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-28',
  'Arremetida Noturna — Helideck',
  'Aproximação e Pouso (APR)',
  'Execução de arremetida a partir da final ou do hover baixo sobre o helideck em ambiente noturno: aplicação suave e progressiva de potência, estabelecimento de atitude de subida com referência imediata aos instrumentos, afastamento seguro dos obstáculos da plataforma e retorno ao circuito. (Ref: RFM AW139, Cap. 4)',
  'INTERMEDIARIO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-29',
  'Circuito Completo Noturno — Variação de Vento',
  'Procedimentos Normais',
  'Execução de circuito completo de tráfego noturno com variação simulada de vento (cruzado e de cauda): ajuste de padrão de circuito, correção de deriva e manutenção de perfil estabilizado de aproximação. Avaliação da adaptabilidade e tomada de decisão em condições variáveis. (Ref: MGO — Circuito de Tráfego Noturno Offshore)',
  'INTERMEDIARIO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-30',
  'Autorotação Noturna — Área Segura',
  'Gestão de Falhas e Emergências (EME)',
  'Execução de autorotação noturna simulada com entrada a partir de voo nivelado: gestão do NR, atitude de planagem, seleção da área de pouso com referências limitadas de iluminação e flare/cushion na fase final. Ênfase na antecipação e na manutenção de consciência situacional sem referências visuais externas claras. (Ref: RFM AW139, Cap. 4 | MGO — Procedimentos de Emergência Noturnos)',
  'AVANCADO',
  'AW139'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'LOFT-NOT-31',
  'Black Hole Effect — Correção e Recuperação',
  'Gestão de Falhas e Emergências (EME)',
  'Reconhecimento e correção do Black Hole Effect durante aproximação final noturna ao helideck: identificação dos sintomas (ilusão de rampa alta, tendência de descida prematura), aplicação de potência corretiva, retorno ao perfil de aproximação correto ou execução de arremetida. Briefing de ilusões visuais noturnas antes do exercício. (Ref: FAA-H-8083-21 Helicopter Flying Handbook, Cap. 13 | MGO — Operações Noturnas)',
  'AVANCADO',
  'AW139'
);

-- ============================================================
-- PARTE 1B — NOVAS MANOBRAS SK76 (S76-LOFT-23 a S76-LOFT-34)
-- ============================================================

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-23',
  'Briefing Noturno — Ilusões Visuais e Black Hole (SK76)',
  'Preparação e Planejamento (PRE)',
  'Briefing pré-voo focado nas ilusões visuais específicas de operação noturna offshore no SK76: Black Hole Effect, autokinesis, ausência de horizonte externo; limitações do sistema de iluminação do helideck; critérios de go-around reforçados; revisão dos mínimos noturnos da empresa. (Ref: RFM SK76, Seção 1 | MGO — Operações Noturnas)',
  NULL,
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-24',
  'Inspeção e Acionamento Noturnos — SK76',
  'Operações de Solo e Decolagem (SOL)',
  'Inspeção pré-voo noturna com uso de lanterna no SK76: pontos críticos de inspeção externa em ambiente escuro; acionamento com atenção especial à iluminação de painel (ajuste de brilho), luzes externas (anti-colisão, de navegação e de pouso) e estabilidade dos sistemas elétricos e hidráulicos. (Ref: QRH SK76, Normal Procedures)',
  NULL,
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-25',
  'Configuração de Cockpit Noturno — SK76',
  'Condução do Voo e Automação (VOO)',
  'Ajuste técnico do cockpit do SK76 para operação noturna: regulagem de brilho dos MFDs e PFD (Primus 701), luzes de cabine no nível mínimo funcional, ativação e verificação das luzes de pouso e hover; confirmação de todos os instrumentos visíveis sem ofuscamento; configuração de áudio e intercomunicação. (Ref: Primus 701 Pilot''s Guide | QRH SK76)',
  NULL,
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-26',
  'Decolagem Noturna — Unidade Marítima (SK76)',
  'Operações de Solo e Decolagem (SOL)',
  'Execução do perfil de decolagem noturna a partir de helideck offshore no SK76: saída com referência exclusiva à iluminação do deck e instrumentos; transição para voo translacional noturno; confirmação de performance e saída segura do setor da plataforma. Gestão dos modos AFCS na saída noturna. (Ref: RFM SK76, Seção 4 | MGO — Operações Noturnas)',
  'INTERMEDIARIO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-27',
  'Perna do Vento (Downwind) Noturna — Helideck Offshore (SK76)',
  'Procedimentos Normais',
  'Condução da perna do vento no circuito de tráfego noturno no SK76: manutenção de altitude e velocidade com referência à iluminação da plataforma; uso dos modos SAS/ATT do AFCS; checklists de aproximação e callouts PF/PM. Disciplina de sterile cockpit na perna do vento. (Ref: MGO — Circuito de Tráfego Noturno | Primus AFCS Guide SK76)',
  'INTERMEDIARIO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-28',
  'Base e Final Noturna — Referências Externas Degradadas (SK76)',
  'Aproximação e Pouso (APR)',
  'Execução das pernas base e final do circuito noturno no SK76 com referências visuais externas limitadas; uso de HAPI ou estimativa visual do ângulo de aproximação combinada com instrumentos; identificação e correção de desvios de rampa; critérios de estabilização (500 ft AGL estabilizado). (Ref: RFM SK76, Seção 4 | MGO — Operações Noturnas)',
  'INTERMEDIARIO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-29',
  'Pouso Noturno no Helideck — Referência de Iluminação (SK76)',
  'Aproximação e Pouso (APR)',
  'Técnica de pouso no helideck noturno no SK76: referência primária na iluminação perimetral e central do deck; controle de razão de descida e centralização sobre o "H"; gestão da perda de referências visuais na fase final (últimos 15–20 ft); confirmação de potência disponível e committal point. (Ref: RFM SK76, Seção 4 | MGO — Helideck Noturno)',
  'INTERMEDIARIO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-30',
  'Arremetida Noturna — Helideck (SK76)',
  'Aproximação e Pouso (APR)',
  'Execução de arremetida noturna a partir da final ou hover baixo sobre o helideck no SK76: potência progressiva, atitude de subida com captura imediata de instrumentos, afastamento lateral dos obstáculos da plataforma e retorno ao circuito. Coordenação PF/PM e callouts padronizados. (Ref: RFM SK76, Seção 4)',
  'INTERMEDIARIO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-31',
  'Circuito Completo Noturno — Variação de Vento (SK76)',
  'Procedimentos Normais',
  'Execução de circuito completo noturno no SK76 com variação simulada de vento (cruzado e de cauda): ajuste do padrão de circuito, correção de deriva lateral, adaptação do perfil de aproximação e tomada de decisão sobre prosseguir ou arremeter. Avaliação da consciência situacional em condições variáveis. (Ref: MGO — Circuito Noturno Offshore)',
  'INTERMEDIARIO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-32',
  'Autorotação Noturna — Área Segura (SK76)',
  'Gestão de Falhas e Emergências (EME)',
  'Execução de autorotação noturna simulada no SK76 com entrada a partir de voo nivelado: gestão do NR, manutenção de atitude de planagem, seleção de área de pouso com referências de iluminação limitadas, flare e cushion na fase final. Ênfase na antecipação e no controle preciso sem referências visuais claras. (Ref: RFM SK76, Seção 4 | MGO — Procedimentos de Emergência Noturnos)',
  'AVANCADO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-33',
  'Black Hole Effect — Correção e Recuperação (SK76)',
  'Gestão de Falhas e Emergências (EME)',
  'Reconhecimento e correção do Black Hole Effect durante aproximação final noturna ao helideck no SK76: identificação dos sintomas (ilusão de rampa alta, tendência de descida prematura abaixo do perfil), aplicação de potência corretiva e retorno ao ângulo correto ou arremetida imediata. Briefing obrigatório de ilusões visuais noturnas antes do exercício. (Ref: FAA-H-8083-21 Helicopter Flying Handbook, Cap. 13 | MGO — Operações Noturnas)',
  'AVANCADO',
  'SK76'
);

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, nivel_dificuldade, tipo_aeronave)
VALUES (
  'S76-LOFT-34',
  'Pouso sem Iluminação de Helideck — Falha de Iluminação (SK76)',
  'Gestão de Falhas e Emergências (EME)',
  'Simulação de falha total da iluminação do helideck durante a final: decisão imediata de arremeter ou prosseguir com referências alternativas (luz de pouso da aeronave, balizamento mínimo visível); execução de arremetida de emergência ou pouso com luz de pouso própria. Ênfase no processo de decisão sob pressão e na comunicação imediata com a plataforma. (Ref: MGO — Contingências de Iluminação | RFM SK76, Seção 4)',
  'AVANCADO',
  'SK76'
);

-- ============================================================
-- PARTE 2A — MODELO DE SESSÃO: Treinamento Noturno AW139
-- tipo_sessao_id = 9 (PER — Periódico)
-- ============================================================

INSERT OR IGNORE INTO modelos_sessao (codigo, nome, tipo, descricao, modelo_aeronave, tipo_sessao_id, ativo)
VALUES (
  'A139-NOT-01',
  'Treinamento Noturno — Unidade Marítima (AW139)',
  'AERONAVE',
  'Ficha de treinamento noturno em circuito de tráfego e pouso/decolagem em unidade marítima (helideck offshore) para a aeronave AW139. Cobre planejamento noturno, configuração de cockpit, circuito completo, pousos e decolagens noturnos, arremetidas, autorotação noturna, Black Hole Effect e CRM.',
  'AW139',
  9,
  1
);

-- ============================================================
-- PARTE 2B — MODELO DE SESSÃO: Treinamento Noturno SK76
-- tipo_sessao_id = 9 (PER — Periódico)
-- ============================================================

INSERT OR IGNORE INTO modelos_sessao (codigo, nome, tipo, descricao, modelo_aeronave, tipo_sessao_id, ativo)
VALUES (
  'S76-NOT-01',
  'Treinamento Noturno — Unidade Marítima (SK76)',
  'AERONAVE',
  'Ficha de treinamento noturno em circuito de tráfego e pouso/decolagem em unidade marítima (helideck offshore) para a aeronave SK76. Cobre briefing noturno, inspeção e acionamento, configuração de cockpit, hover, circuito completo noturno, pousos e decolagens, arremetidas, autorotação noturna, Black Hole Effect e CRM/debrief.',
  'SK76',
  9,
  1
);

-- ============================================================
-- PARTE 3 — VÍNCULOS MANOBRA-MODELO (modelos_sessao_manobras)
-- Usa subselect para resolver IDs dinamicamente — idempotente via
-- UNIQUE(modelo_id, manobra_id) + INSERT OR IGNORE
-- ============================================================

-- --- MODELO AW139: 22 manobras em sequência ---

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 1, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-04';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 2, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-05';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 3, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-06';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 4, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-08';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 5, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'FLY-BAS-X3';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 6, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-23';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 7, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-24';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 8, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-25';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 9, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-26';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 10, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-15';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 11, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'OPS-APP-X4';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 12, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-27';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 13, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-28';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 14, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-29';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 15, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-30';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 16, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-16';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 17, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-31';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 18, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-09';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 19, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-11';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 20, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'OPS-OFF-X2';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 21, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-21';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 22, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'A139-NOT-01' AND m.codigo = 'LOFT-NOT-22';

-- --- MODELO SK76: 22 manobras em sequência ---

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 1, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-23';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 2, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-NVF-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 3, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-24';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 4, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-HOV-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 5, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-25';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 6, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-TDP-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 7, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-26';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 8, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-NDL-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 9, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-27';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 10, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-28';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 11, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-18';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 12, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-19';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 13, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-29';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 14, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-30';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 15, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LDP-00';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 16, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-31';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 17, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-AUT-70';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 18, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-32';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 19, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-33';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 20, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-21';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 21, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-22';

INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, 22, 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'S76-NOT-01' AND m.codigo = 'S76-LOFT-34';
