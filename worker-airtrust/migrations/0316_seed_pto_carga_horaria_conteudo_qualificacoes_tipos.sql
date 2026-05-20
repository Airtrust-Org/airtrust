-- ================================================================
-- Migration 0316: PTO carga horaria e conteudo programatico
-- Data: 2026-03-31
-- Objetivo: Preencher qualificacoes_tipos da empresa 6 com base no
--           PRG-OPS-001 (PTO rev. 09 - 01/07/2025)
-- ================================================================

UPDATE qualificacoes_tipos
SET
  carga_horaria = CASE codigo
    WHEN 'B' THEN 4
    WHEN 'C' THEN 4
    WHEN 'D1' THEN 8
    WHEN 'D2' THEN 2
    WHEN 'D3' THEN 20
    WHEN 'D4' THEN 8
    WHEN 'E1' THEN 2
    WHEN 'E2' THEN 2
    WHEN 'E3' THEN 8
    WHEN 'E4' THEN 2
    WHEN 'E5' THEN 2
    WHEN 'E6' THEN 2
    WHEN 'F1' THEN 60
    WHEN 'F2' THEN 32
    WHEN 'G1' THEN 24
    WHEN 'G2' THEN 24
    ELSE carga_horaria
  END,
  conteudo_programatico = CASE codigo
    WHEN 'B' THEN 'Liberação e localização de voos
Princípios e métodos para determinar peso e balanceamento
Cálculo de desempenho para decolagem e pouso
Meteorologia operacional: frentes, gelo, nevoeiro, trovoadas, tesouras de vento e grande altitude
Sistemas de controle de tráfego aéreo e fraseologia
Navegação e uso de auxílios à navegação, incluindo aproximação por instrumentos
Procedimentos de comunicações normais e de emergência
Familiarização com referências visuais em aproximações por instrumentos
Reconhecimento e evasão de condições meteorológicas severas
Operações em condições meteorológicas adversas
Limitações operacionais e parâmetros críticos
Controle de cruzeiro e gerenciamento de combustível
Planejamento de voo'
    WHEN 'C' THEN 'Procedimentos e atribuições da tripulação durante emergências
Localização, funcionamento e operação dos equipamentos de emergência
Equipamentos para pousos na água e evacuações
Equipamentos de primeiros socorros e uso apropriado
Extintores de incêndio portáteis e agentes extintores
Descompressão rápida e efeitos fisiológicos
Fogo a bordo em voo e no solo
Evacuação e pouso na água
Situações médicas envolvendo passageiros ou tripulantes
Interferência ilícita e outros eventos não usuais
Estudo de acidentes e incidentes com lições operacionais aplicáveis'
    WHEN 'D1' THEN 'Princípios do PNAVSEC
Identificação e prevenção de atos de interferência ilícita
Resposta adequada a ameaças contra a aviação civil
Diretrizes do Programa de Treinamento AVSEC da empresa
Requisitos documentais e disponibilidade para auditoria'
    WHEN 'D2' THEN 'Fundamentos do Sistema de Gerenciamento da Segurança Operacional
Princípios de gestão de risco operacional
Cultura justa e segurança sistêmica
Ferramentas e processos previstos no MGSO vigente
Responsabilidades dos tripulantes no SGSO'
    WHEN 'D3' THEN 'Fatores Humanos e erro humano
Consciência situacional
Comunicação interpessoal e assertividade
Liderança e trabalho em equipe
Tomada de decisão e resolução de problemas
Gerenciamento de ameaças e erros (TEM)
Automação e gerenciamento de tecnologia
Cultura justa, disciplina e reporte de eventos
Situações de risco e gerenciamento de fadiga
Cenários práticos de LOFT com integração de competências não técnicas'
    WHEN 'D4' THEN 'Reconhecimento de artigos perigosos
Tratamento adequado de cargas e materiais perigosos
Resposta a situações envolvendo artigos perigosos
Diretrizes do PTAP da empresa
Tópicos obrigatórios por categoria funcional conforme RBAC 175 e IS 175-007F
Controle de validade, reciclagem e arquivamento de registros'
    WHEN 'E1' THEN 'Introdução às operações offshore
Meio ambiente offshore
Helipontos e NORMAN 223
Operação offshore normal
Operação offshore por instrumentos e/ou noturno
Emergência sobre o mar
Determinação da classe de desempenho
Checagem cruzada das informações de performance
Registro e arquivamento da memória de cálculo
Auditoria periódica dos registros de desempenho'
    WHEN 'E2' THEN 'Conceitos, princípios e fundamentos de PBN
Diferenças e aplicações de RNAV e RNP
Especificações de navegação aplicáveis: RNAV 5, RNAV 2, RNAV 1, RNP 4, RNP 2, RNP 1, RNP APCH e RNP AR APCH
Limitações operacionais e requisitos de desempenho
Gerenciamento e monitoramento de desempenho da aeronave
Procedimentos em caso de falha de equipamento ou perda de capacidade PBN
Características e operação dos sistemas de navegação instalados
Entrada, verificação e atualização de dados de navegação
Verificação de integridade e alertas
Utilização de funções avançadas e operação em modo degradado
Integração com FMS, piloto automático e outros sistemas de bordo
Treinamento específico para RNP 1 e RNP APCH'
    WHEN 'E3' THEN 'Equipamentos obrigatórios: colete salva-vidas, rádio portátil, ELT e bote de sobrevivência
Procedimentos em caso de pouso forçado sobre a água
Técnicas básicas de sobrevivência marítima
Risco de hipotermia e tempo de exposição
Coordenação com equipes SAR após amerrissagem ou abandono da aeronave
Treinamento prático de egressão submersa de aeronave (T-HUET)
Integração com padrões OPITO e IOGP aplicáveis'
    WHEN 'E4' THEN 'Procedimentos operacionais específicos da operação aeromédica
Principais perigos e riscos da operação aeromédica
Corporate Resource Management aplicado à interação entre equipes de saúde, voo e solo
Aspectos relativos à saúde do paciente durante o voo
Cuidados para embarque e desembarque de pacientes, acompanhantes e equipamentos
Características do kit de equipamentos aeromédicos instalado nas aeronaves
Procedimentos de evacuação em emergência com paciente a bordo
Briefing ao acompanhante e aos profissionais de saúde
Critérios de segurança ao redor e dentro da aeronave
Simulação prática de embarque, desembarque e evacuação de emergência'
    WHEN 'E5' THEN 'Introdução ao Electronic Flight Bag (EFB)
Aplicativos EFB
Infraestrutura e gestão dos EFBs na empresa
Operação dos EFBs pela empresa'
    WHEN 'E6' THEN 'Introdução aos cenários de sobrevivência
Fatores psicológicos e comportamentais
Ações imediatas após o pouso forçado
Equipamentos de emergência
Técnicas básicas de sobrevivência na selva
Protocolos de comunicação e resgate
Riscos naturais e proteção da saúde'
    WHEN 'F1' THEN 'Características técnicas e limitações gerais da aeronave AW139
Sistema elétrico
Sistema hidráulico
Sistema de combustível
Sistema de rotor principal e de cauda
Sistema de trem de pouso
Sistema de controle de voo (AFCS)
Sistema de navegação e comunicações
Sistema de climatização e pressurização
Alarmes, alertas e instrumentos da cabine
Envelope de voo e desempenho previsto
Restrições operacionais e limitações do POH/RFM
Interpretação de manuais do fabricante: AFM, QRH e FCOM
Procedimentos normais, anormais e de emergência em visão teórica
Considerações sobre operação offshore e transporte aeromédico no AW139
Interface com o EFB'
    WHEN 'F2' THEN 'Características técnicas gerais da família S76
Sistema elétrico
Sistema hidráulico
Sistema de combustível
Sistema de rotor principal e de cauda
Sistema de controle de voo e automação
Sistema de trem de pouso
Sistema de climatização e ventilação
Sistemas de navegação, comunicações e aviônicos integrados
Instrumentação, alertas e sistemas de gerenciamento de voo
Limitações operacionais e desempenho previsto
Interpretação de manuais: AFM, QRH, FCOM e MEL
Procedimentos normais, anormais e de emergência em visão teórica
Considerações operacionais específicas como offshore e aeromédica
Interface com EFB'
    WHEN 'G1' THEN 'Familiarização com cabine, checklist e equipamentos da aeronave
Briefing operacional e preparação para o voo
Início de motor e taxiamento
Decolagens e pousos em diferentes perfis
Operações em plataforma offshore
Operações aeromédicas autorizadas
Manobras em voo normal, anormal e de emergência
Resposta a falha de motor, autorrotação, falhas de sistemas e pane elétrica
Uso de piloto automático e modos de navegação/AFCS
Interação com EFB durante o voo
Procedimentos de aproximação IFR e VFR
Gerenciamento de cabine e CRM em voo
Perigo aviário e prevenção de colisão com aves
Acompanhamento de desempenho com debriefing técnico'
    WHEN 'G2' THEN 'Familiarização com a cabine e painel de instrumentos
Preparação da aeronave e execução de checklist operacional
Início de motor, taxiamento e decolagens em diversos perfis
Voo em condições normais e sob condições controladas de carga e tempo
Manobras em voo nivelado, subida, descida e curvas padronizadas
Situações anormais e procedimentos de emergência simulados
Perda de motor, autorrotação e falhas de sistemas hidráulico e elétrico
Aproximações e pousos em áreas restritas e embarcadas
Gerenciamento automatizado e uso de sistemas de auxílio à navegação
Operações offshore, aeromédicas e sob condições meteorológicas adversas
Comunicação e coordenação da tripulação em ambiente operacional real
Debriefing técnico e autoavaliação supervisionada
Treinamento prático de diferenças entre variantes da família S76'
    ELSE conteudo_programatico
  END,
  updated_at = datetime('now')
WHERE empresa_id = 6
  AND deleted_at IS NULL
  AND codigo IN ('B', 'C', 'D1', 'D2', 'D3', 'D4', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'F1', 'F2', 'G1', 'G2');

-- ================================================================
-- VALIDAÇÃO PÓS-MIGRATION
-- ================================================================
-- SELECT codigo, carga_horaria, substr(conteudo_programatico, 1, 120)
-- FROM qualificacoes_tipos
-- WHERE empresa_id = 6
--   AND codigo IN ('B', 'C', 'D1', 'D2', 'D3', 'D4', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'F1', 'F2', 'G1', 'G2')
-- ORDER BY codigo;