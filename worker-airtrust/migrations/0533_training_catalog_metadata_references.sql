-- 0533_training_catalog_metadata_references.sql
-- Adds explicit course references and aligns training metadata with current controlled documents.
-- Tenant-scoped data correction for Costa do Sol (empresa_id=6).
-- Maintenance validity decision: qualifications that were 36 months are reduced to 24 months by Training Management decision.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-catalog-metadata-references-0533.md

ALTER TABLE qualificacoes_tipos ADD COLUMN referencias TEXT;
ALTER TABLE lms_cursos ADD COLUMN referencias TEXT;

-- A — Doutrinamento Básico
UPDATE qualificacoes_tipos
   SET nome='Doutrinamento Básico',
       descricao='Integrar o tripulante à organização e às responsabilidades, regulamentos, certificados, especificações operativas, manuais e políticas básicas aplicáveis às operações da Costa do Sol.',
       conteudo_programatico='• Atribuições e responsabilidades do tripulante de voo
• Regras e regulamentos aplicáveis
• COA e Especificações Operativas
• Partes relevantes do MGO
• Noções sobre Artigos Perigosos
• Fundamentos de SGSO, AVSEC e CRM',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
RBAC 135
IS 135-003D
COA e Especificações Operativas vigentes',
       observacoes='Somente treinamento inicial conforme PTO Rev.10.',
       carga_horaria=12,
       carga_horaria_inicial=12,
       carga_horaria_recorrente=NULL,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='A' AND ativo=1 AND deleted_at IS NULL;

-- AUD_COMP — Auditoria Comportamental — Designados
UPDATE qualificacoes_tipos
   SET nome='Auditoria Comportamental — Designados',
       descricao='Capacitar profissionais designados para realizar auditorias comportamentais preventivas, com observação objetiva, abordagem positiva, classificação de desvios, registro e encaminhamento adequado de achados.',
       conteudo_programatico='• Finalidade preventiva e não punitiva
• observação antes da abordagem
• reação do observado
• abordagem positiva
• desvio, desvio crítico, desvio sistêmico, desvio comportamental e condição insegura
• categorias A–F
• registro objetivo no FORM-SGI-054
• risco iminente e paralisação
• encaminhamento de achados',
       referencias='PRG-SGI-005 Rev.05
MNL-SGI-001 Rev.09
FORM-SGI-054
ISO 45001:2018
Procedimento de Auditoria Comportamental vigente',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='AUD_COMP' AND ativo=1 AND deleted_at IS NULL;

-- B — Conhecimentos Gerais da Aeronave
UPDATE qualificacoes_tipos
   SET nome='Conhecimentos Gerais da Aeronave',
       descricao='Assegurar ao tripulante conhecimento dos sistemas, limitações, desempenho, peso e balanceamento, navegação, comunicações, meteorologia e demais conhecimentos gerais necessários à operação segura da aeronave.',
       conteudo_programatico='• Liberação e localização de voos
• Princípios e métodos para determinar peso e balanceamento
• Cálculo de desempenho para decolagem e pouso
• Meteorologia operacional: frentes, gelo, nevoeiro, trovoadas, tesouras de vento e grande altitude
• Sistemas de controle de tráfego aéreo e fraseologia
• Navegação e uso de auxílios à navegação, incluindo aproximação por instrumentos
• Procedimentos de comunicações normais e de emergência
• Familiarização com referências visuais em aproximações por instrumentos
• Reconhecimento e evasão de condições meteorológicas severas
• Operações em condições meteorológicas adversas
• Limitações operacionais e parâmetros críticos
• Controle de cruzeiro e gerenciamento de combustível
• Planejamento de voo',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
RFM/FCOM/QRH do modelo
RBAC 135
IS 135-003D',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='B' AND ativo=1 AND deleted_at IS NULL;

-- C — Emergências Gerais
UPDATE qualificacoes_tipos
   SET nome='Emergências Gerais',
       descricao='Preparar o tripulante para reconhecer e responder a emergências, utilizar equipamentos de emergência, executar evacuação e pouso na água e atuar adequadamente em situações médicas e de fogo.',
       conteudo_programatico='• Procedimentos e atribuições da tripulação durante emergências
• Localização, funcionamento e operação dos equipamentos de emergência
• Equipamentos para pousos na água e evacuações
• Equipamentos de primeiros socorros e uso apropriado
• Extintores de incêndio portáteis e agentes extintores
• Descompressão rápida e efeitos fisiológicos
• Fogo a bordo em voo e no solo
• Evacuação e pouso na água
• Situações médicas envolvendo passageiros ou tripulantes
• Interferência ilícita e outros eventos não usuais
• Estudo de acidentes e incidentes com lições operacionais aplicáveis',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
RBAC 135
IS 135-003D
Manuais e equipamentos de emergência aplicáveis',
       observacoes='Inclui sessões práticas/simuladas obrigatórias conforme o currículo aplicável; o EAD representa a parcela teórica quando utilizado.',
       carga_horaria=2,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='C' AND ativo=1 AND deleted_at IS NULL;

-- COD_ETICA — Código de Ética e Conduta
UPDATE qualificacoes_tipos
   SET nome='Código de Ética e Conduta',
       descricao='Apresentar princípios, valores e regras de conduta esperados na Costa do Sol, promovendo integridade, respeito, prevenção de conflitos de interesse e uso adequado dos canais de reporte.',
       conteudo_programatico='• Princípios, valores e responsabilidades individuais
• Integridade, legalidade e tomada de decisão ética
• Conflitos de interesse
• Presentes, hospitalidades e relacionamento com terceiros
• Prevenção a fraude, corrupção e favorecimento indevido
• Respeito, diversidade, assédio e discriminação
• Confidencialidade, informação e uso responsável de recursos
• Canais de denúncia e proteção contra retaliação
• Consequências e responsabilidades por violações',
       referencias='Código de Ética e Conduta da Costa do Sol vigente
MNL-SGI-001 Rev.09
Políticas de integridade e canais de reporte vigentes',
       observacoes=NULL,
       carga_horaria=NULL,
       carga_horaria_inicial=NULL,
       carga_horaria_recorrente=NULL,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='COD_ETICA' AND ativo=1 AND deleted_at IS NULL;

-- COL_SEL — Gerenciamento de Resíduos e Coleta Seletiva
UPDATE qualificacoes_tipos
   SET nome='Gerenciamento de Resíduos e Coleta Seletiva',
       descricao='Capacitar empregados para segregação, acondicionamento, armazenamento temporário e destinação adequada de resíduos, incluindo resposta a derramamentos e resíduos provenientes de manutenção.',
       conteudo_programatico='• Segregação
• recipientes e identificação conforme procedimento vigente
• armazenamento temporário
• derramamento/contaminação
• resíduos de manutenção
• responsabilidades
• erros comuns
• fluxo e destino de descarte conforme PGRS/procedimento ambiental',
       referencias='PRG-SGI-005 Rev.05
MNL-SGI-001 Rev.09
PGRS/procedimento ambiental vigente
Lei nº 12.305/2010 — Política Nacional de Resíduos Sólidos',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='COL_SEL' AND ativo=1 AND deleted_at IS NULL;

-- CRM_DIR_RBAC119 — CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)
UPDATE qualificacoes_tipos
   SET nome='CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)',
       descricao='Capacitar ocupantes dos cargos de direção requeridos pelos RBAC 119.65 e 119.69 nos princípios de CRM e fatores humanos relevantes às responsabilidades gerenciais e à segurança operacional.',
       conteudo_programatico='• Evolução do CRM e modelos de fatores humanos
• normas e diretrizes em fatores humanos
• cultura organizacional e de segurança
• erro humano, desempenho humano e limitações
• processos de comunicação
• formação e manutenção de equipe
• liderança e trabalho em equipe
• consciência situacional
• monitoramento, intervenção e tomada de decisão
• automação e interface homem-tecnologia
• gerenciamento da carga de trabalho, pressão, estresse, fadiga e vigilância
• efeitos do uso de álcool e outras drogas sobre o desempenho
• responsabilidades estratégicas e táticas dos gestores na Política de Fatores Humanos/CRM, prevenção de condições latentes e gerenciamento de ameaças e erros. Modalidade: EaD, conforme IS 00-010B item 5.3.5.2
• carga horária estimada: 4 horas, conforme item 5.3.5.4',
       referencias='RBAC 119.65
RBAC 119.69
IS 00-010B, item 5.3.5
PRG-SSO-002 — Programa de CRM Rev.03',
       observacoes='Aplicável aos ocupantes dos cargos de direção requeridos pelos RBAC 119.65 e 119.69. A IS 00-010B recomenda o treinamento quando um novo gestor assume função requerida e não estabelece recorrência automática para este curso.',
       carga_horaria=4,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=NULL,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='CRM_DIR_RBAC119' AND ativo=1 AND deleted_at IS NULL;

-- D2 — SGSO — Segurança Operacional e Gestão de Riscos
UPDATE qualificacoes_tipos
   SET nome='SGSO — Segurança Operacional e Gestão de Riscos',
       descricao='Capacitar empregados nos fundamentos do Sistema de Gerenciamento da Segurança Operacional, identificação de perigos, gestão de riscos, garantia, promoção, gestão de mudanças e resposta a emergências.',
       conteudo_programatico='• Princípios do SGSO
• política/normas
• estrutura, metas e objetivos
• identificação de perigos
• avaliação/mitigação de riscos
• monitoramento/medição
• gestão da mudança
• melhoria contínua
• programas de segurança
• notificações
• vistorias
• PRE
• RELPREV
• promoção e difusão da segurança',
       referencias='MNL-SSO-001 — MGSO Rev.18
PRG-SGI-005 Rev.05
RBAC 119 e RBAC 135
Requisitos ANAC de SGSO aplicáveis',
       observacoes=NULL,
       carga_horaria=4,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       validade=36,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='D2' AND ativo=1 AND deleted_at IS NULL;

-- E1 — Operações Offshore
UPDATE qualificacoes_tipos
   SET nome='Operações Offshore',
       descricao='Preparar tripulantes para operações offshore, abrangendo ambiente marítimo, helideques, procedimentos normais e por instrumentos/noturnos, riscos, limitações e resposta a emergências.',
       conteudo_programatico='• Introdução às Operações Offshore
• Meio Ambiente Offshore
• Helipontos- NORMAM-223/DPC e legislação correlata
• design e marcações de helidecks
• chevron, TD/PM, valores D e t, LOS, gradiente 1:5 e HMS
• significado do alinhamento do “H” em relação ao OFS
• correção da trajetória de aproximação e uso do círculo TD/PM
• Operação Offshore Normal
• Operação Offshore por Instrumentos e/ou Noturno
• Emergência Sobre o Mar
• Operações em embarcações de pequeno e médio porte em movimento
• Determinação da Classe de Desempenho
• Familiarização específica, quando exigida por contrato/cliente, para plataformas, helipontos ou ambientes offshore diferenciados',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
NORMAM-223/DPC vigente
SOP do modelo aplicável
IOGP 690 aplicável',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E1' AND ativo=1 AND deleted_at IS NULL;

-- E2 — PBN – Navegação Baseada em Performance
UPDATE qualificacoes_tipos
   SET nome='PBN – Navegação Baseada em Performance',
       descricao='Capacitar tripulantes nos conceitos e procedimentos de Performance-Based Navigation, incluindo RNAV/RNP, requisitos de desempenho, monitoramento, limitações e contingências.',
       conteudo_programatico='• Conceitos, princípios e fundamentos de PBN
• Diferenças e aplicações de RNAV e RNP
• Especificações de navegação aplicáveis: RNAV 5, RNAV 2, RNAV 1, RNP 4, RNP 2, RNP 1, RNP APCH e RNP AR APCH
• Limitações operacionais e requisitos de desempenho
• Gerenciamento e monitoramento de desempenho da aeronave
• Procedimentos em caso de falha de equipamento ou perda de capacidade PBN
• Características e operação dos sistemas de navegação instalados
• Entrada, verificação e atualização de dados de navegação
• Verificação de integridade e alertas
• Utilização de funções avançadas e operação em modo degradado
• Integração com FMS, piloto automático e outros sistemas de bordo
• Treinamento específico para RNP 1 e RNP APCH',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
RBAC 135
AIP Brasil
Publicações DECEA/ANAC PBN aplicáveis',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E2' AND ativo=1 AND deleted_at IS NULL;

-- E4 — Operação Aeromédica
UPDATE qualificacoes_tipos
   SET nome='Operação Aeromédica',
       descricao='Preparar tripulantes para operações aeromédicas, abordando riscos, coordenação entre equipes, cuidados com paciente, equipamentos e procedimentos específicos de embarque, voo e desembarque.',
       conteudo_programatico='• Procedimentos operacionais específicos da operação aeromédica
• Principais perigos e riscos da operação aeromédica
• Corporate Resource Management aplicado à interação entre equipes de saúde, voo e solo
• Aspectos relativos à saúde do paciente durante o voo
• Cuidados para embarque e desembarque de pacientes, acompanhantes e equipamentos
• Características do kit de equipamentos aeromédicos instalado nas aeronaves
• Procedimentos de evacuação em emergência com paciente a bordo
• Briefing ao acompanhante e aos profissionais de saúde
• Critérios de segurança ao redor e dentro da aeronave
• Simulação prática de embarque, desembarque e evacuação de emergência',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
IS 135-005A
RBAC 135
Procedimentos aeromédicos aplicáveis',
       observacoes='O conteúdo EAD representa a parcela teórica. A qualificação completa deve preservar exercício prático e avaliação previstos no programa aplicável.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E4' AND ativo=1 AND deleted_at IS NULL;

-- E5 — EFB – Electronic Flight Bag
UPDATE qualificacoes_tipos
   SET nome='EFB – Electronic Flight Bag',
       descricao='Capacitar o tripulante para uso seguro e padronizado do Electronic Flight Bag, incluindo aplicativos, gestão de informação, limitações e procedimentos operacionais da empresa.',
       conteudo_programatico='• Introdução ao Electronic Flight Bag (EFB)
• Aplicativos EFB
• Infraestrutura e gestão dos EFBs na empresa
• Operação dos EFBs pela empresa',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
Programa/procedimento EFB vigente
RBAC 135
Orientações ANAC aplicáveis ao EFB',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E5' AND ativo=1 AND deleted_at IS NULL;

-- E6 — Operações em Terrenos Desabitados
UPDATE qualificacoes_tipos
   SET nome='Operações em Terrenos Desabitados',
       descricao='Preparar tripulantes para operações em terrenos desabitados, com ênfase em sobrevivência, equipamentos de emergência, fatores humanos, comunicação, resgate e proteção da saúde.',
       conteudo_programatico='• Introdução aos cenários de sobrevivência
• Fatores psicológicos e comportamentais
• Ações imediatas após o pouso forçado
• Equipamentos de emergência
• Técnicas básicas de sobrevivência na selva
• Protocolos de comunicação e resgate
• Riscos naturais e proteção da saúde',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
RBAC 135
Procedimentos e equipamentos de sobrevivência e emergência da empresa',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E6' AND ativo=1 AND deleted_at IS NULL;

-- FDM-EAD — FDM - Flight Data Monitoring
UPDATE qualificacoes_tipos
   SET nome='FDM - Flight Data Monitoring',
       descricao='Capacitar integrantes designados da equipe FDM/HFDM nos princípios do programa, tratamento de eventos, confidencialidade, Cultura Justa, análise de dados e integração com o SGSO.',
       conteudo_programatico='• Conceito, finalidade e funcionamento do FDM
• princípios do programa
• responsabilidades
• confidencialidade e Cultura Justa
• tratamento/análise de eventos
• papel do colaborador
• benefícios
• fluxo de acompanhamento
• integração com o SGSO',
       referencias='MNL-SSO-002 — Programa/Manual FDM vigente
IOGP 690-2, item 8C.2
MNL-SSO-001 — MGSO Rev.18',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-EAD' AND ativo=1 AND deleted_at IS NULL;

-- FOD — FOD — Prevenção de Danos por Objetos Estranhos
UPDATE qualificacoes_tipos
   SET nome='FOD — Prevenção de Danos por Objetos Estranhos',
       descricao='Capacitar empregados para identificar, prevenir, remover e reportar Foreign Object Debris/Damage, reduzindo riscos a aeronaves, pessoas, equipamentos e à operação.',
       conteudo_programatico='• Conceito de FOD/FO
• fontes e fatores contribuintes
• riscos a aeronaves, pessoas e operação
• housekeeping e inspeção
• controle de ferramentas e materiais
• prevenção em pátio/hangar/base
• identificação, remoção e reporte
• responsabilidades individuais e organizacionais',
       referencias='MNL-SSO-001 — MGSO Rev.18
PRG-SGI-005 Rev.05
Procedimento FOD/housekeeping operacional vigente',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FOD' AND ativo=1 AND deleted_at IS NULL;

-- GATEKEEPER — Gatekeeper
UPDATE qualificacoes_tipos
   SET nome='Gatekeeper',
       descricao='Capacitar profissionais formalmente designados para a função de Gatekeeper no processo FDM, com foco em abordagem, debriefing, confidencialidade, ética e tratamento de eventos.',
       conteudo_programatico='• Objetivo e papel do Gatekeeper
• princípios e processo FDM
• preparação e abordagem
• debriefing
• confidencialidade e Cultura Justa
• estudos de caso
• Comitê FDM
• erros comuns, ética e cenários práticos',
       referencias='MNL-SSO-002 — Programa/Manual FDM vigente
IOGP 690-2, item 8C.2
MNL-SSO-001 — MGSO Rev.18',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='GATEKEEPER' AND ativo=1 AND deleted_at IS NULL;

-- HELIWISE — HUMS - Heliwise
UPDATE qualificacoes_tipos
   SET nome='HUMS - Heliwise',
       descricao='Capacitar profissionais designados no uso operacional da plataforma Heliwise e na interpretação inicial de dados HUMS, alertas, tendências e registros associados às aeronaves da empresa.',
       conteudo_programatico='• Introdução do Conceito de HUMS
• Apresentação da Operação do HUMS
• Uso da Ground Station
• Apresentação dos procedimentos relacionados ao download e análise primária do HUMS
• Tratamento e registro de alarmes
• Defeitos mais comuns',
       referencias='MNL-MNT-003 — Manual do HUMS Rev.06
ITR-MNT-013 — Download e Análise do HUMS AW139 Rev.03
Documentação Heliwise/HUMS aplicável',
       observacoes='Treinamento complementar específico Heliwise/HUMS. Não substitui automaticamente o treinamento HUMS-VXP previsto no PTM.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='HELIWISE' AND ativo=1 AND deleted_at IS NULL;

-- I — Instrutor de Voo — Solo
UPDATE qualificacoes_tipos
   SET nome='Instrutor de Voo — Solo',
       descricao='Desenvolver competências de instrução de solo, planejamento didático, briefing, debriefing, padronização, avaliação e gestão de erros para instrutores de voo da empresa.',
       conteudo_programatico='• Responsabilidades e postura do instrutor
• Princípios de aprendizagem de adultos e didática aplicada
• Planejamento de aula e definição de objetivos
• Briefing e debriefing eficazes
• Padronização de procedimentos e demonstrações
• Identificação e correção de erros
• CRM, TEM e fatores humanos na instrução
• Avaliação de desempenho e registros de treinamento
• Procedimentos do PTO aplicáveis aos instrutores',
       referencias='PRG-OPS-001 — PTO Rev.10
RBAC 61
RBAC 135
IS 135-003D',
       observacoes='O PTO prevê 2h para quem já possui qualificação INVA e 8h para quem não possui INVA. O cadastro de 2h representa a condição aplicável ao público já qualificado; casos distintos exigem carga individual adequada.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='I' AND ativo=1 AND deleted_at IS NULL;

-- INTEGRA — Integração Corporativa
UPDATE qualificacoes_tipos
   SET nome='Integração Corporativa',
       descricao='Apresentar ao novo empregado a estrutura, valores, responsabilidades, canais, documentos e requisitos básicos de segurança, qualidade, emergência e qualificação da Costa do Sol.',
       conteudo_programatico='• Onboarding corporativo
• estrutura e responsabilidades
• como localizar informação vigente
• canais corporativos
• comportamento e comunicação
• resposta mínima a emergências
• visão do sistema de qualificações
• encaminhamento para treinamentos específicos sem duplicar seus conteúdos',
       referencias='PRG-SGI-005 Rev.05
MNL-SGI-001 Rev.09
NR-01
Políticas e procedimentos corporativos vigentes',
       observacoes='Treinamento de integração inicial. Recorrência somente quando determinada por mudança relevante, ação programada ou requisito específico aplicável.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=NULL,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND ativo=1 AND deleted_at IS NULL;

-- INTRO_SGQ — Doutrinamento em Segurança e Qualidade
UPDATE qualificacoes_tipos
   SET nome='Doutrinamento em Segurança e Qualidade',
       descricao='Integrar o empregado aos princípios do Sistema de Gestão Integrado, às políticas de qualidade, saúde, segurança e meio ambiente e às responsabilidades e documentos aplicáveis à sua atividade.',
       conteudo_programatico='• SGI, políticas e responsabilidades, documentos e procedimentos
• para Manutenção: organograma, políticas (SGI, álcool/drogas, Cultura Justa, reporte), MGM/MOM/MCQ/PTM, procedimentos de manutenção, PTM, legislação aeronáutica e acesso a publicações técnicas',
       referencias='PRG-SGI-005 Rev.05
MNL-SGI-001 Rev.09
ISO 9001:2015
ISO 14001:2015
ISO 45001:2018',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTRO_SGQ' AND ativo=1 AND deleted_at IS NULL;

-- JUST_CULTURE — Cultura Justa — Reporte, Erros e Responsabilização
UPDATE qualificacoes_tipos
   SET nome='Cultura Justa — Reporte, Erros e Responsabilização',
       descricao='Desenvolver compreensão comum sobre Cultura Justa, diferenciação entre erro e violação, reporte, aprendizagem organizacional e responsabilização proporcional.',
       conteudo_programatico='• Conceito e objetivo de Cultura Justa
• diferenciação entre erro e violação
• reporte
• responsabilidades
• análise de comportamento
• intervenções cabíveis
• proteção da cultura de segurança
• responsabilização proporcional
• aprendizagem organizacional',
       referencias='PRG-SGI-005 Rev.05
MNL-SSO-001 — MGSO Rev.18
Política de Cultura Justa vigente',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='JUST_CULTURE' AND ativo=1 AND deleted_at IS NULL;

-- LGPD — LGPD - Lei Geral de Proteção de Dados
UPDATE qualificacoes_tipos
   SET nome='LGPD - Lei Geral de Proteção de Dados',
       descricao='Capacitar empregados nos princípios e responsabilidades da Lei Geral de Proteção de Dados, promovendo tratamento adequado, segurança, confidencialidade e resposta a incidentes envolvendo dados pessoais.',
       conteudo_programatico='• Conceitos de dado pessoal, dado pessoal sensível e tratamento
• Princípios da proteção de dados pessoais
• Bases legais e finalidade do tratamento
• Direitos dos titulares
• Papéis de controlador, operador e encarregado
• Segurança da informação, privacidade por padrão e controle de acesso
• Compartilhamento, retenção e descarte de dados
• Incidentes de segurança e comunicação interna
• Boas práticas no uso de e-mail, sistemas, documentos e dispositivos
• Responsabilidades individuais e procedimentos corporativos',
       referencias='Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais
Políticas corporativas de privacidade e segurança da informação
Procedimento de resposta a incidentes de dados vigente',
       observacoes=NULL,
       carga_horaria=NULL,
       carga_horaria_inicial=NULL,
       carga_horaria_recorrente=NULL,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LGPD' AND ativo=1 AND deleted_at IS NULL;

-- LOSA — LOSA — Line Operations Safety Audit
UPDATE qualificacoes_tipos
   SET nome='LOSA — Line Operations Safety Audit',
       descricao='Capacitar observadores e profissionais designados nos princípios da Line Operations Safety Audit, Threat and Error Management, observação de linha, codificação e tratamento confidencial dos dados.',
       conteudo_programatico='• Finalidade e princípios LOSA
• TEM
• observação normal de linha
• independência/confidencialidade
• papel e conduta do observador
• ameaças, erros e estados indesejados
• codificação/registro
• qualidade de dados
• debriefing quando aplicável
• análise agregada e integração LOSA/FDM/SGSO',
       referencias='Programa LOSA da Costa do Sol vigente
MNL-SSO-001 — MGSO Rev.18
Metodologia LOSA adotada pela empresa',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=48,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LOSA' AND ativo=1 AND deleted_at IS NULL;

-- MNT_AW139 — AW139 - Manutenção
UPDATE qualificacoes_tipos
   SET nome='AW139 - Manutenção',
       descricao='Capacitar profissionais de manutenção nos sistemas, práticas e procedimentos necessários à manutenção, manutenção preventiva e alterações das aeronaves AW139 e seus motores, conforme o escopo aprovado da Costa do Sol.',
       conteudo_programatico='• Conteúdo baseado no Manual de Manutenção do fabricante
• Descrição e funcionamento dos sistemas da aeronave
• Estrutura
• Transmissões dos rotores principal e de cauda
• Sistema de combustível
• Sistema elétrico
• Sistema hidráulico
• Comandos de voo
• Proteção contra fogo
• Aquecimento e ventilação
• Iluminação
• Comunicação
• Navegação
• Interfaces da célula com o motor
• Instalação do motor
• Indicações, comandos e lubrificação do motor
• Sistema de partida
• Escapamento',
       referencias='PRG-MNT-002 — PTM Rev.07, item 20.6
RBAC 145
IS 145-010C
IS 119-010A
Manuais técnicos Leonardo AW139 aplicáveis',
       observacoes='Recorrência configurada em 24 meses por decisão da Gerência de Treinamento, critério interno mais restritivo que o ciclo de 36 meses previsto no PTM e compatível com exigências contratuais quando aplicáveis.',
       carga_horaria=12,
       carga_horaria_inicial=40,
       carga_horaria_recorrente=12,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_AW139' AND ativo=1 AND deleted_at IS NULL;

-- MNT_HUMS — HUMS-VXP
UPDATE qualificacoes_tipos
   SET nome='HUMS-VXP',
       descricao='Familiarizar mecânicos, inspetores e engenheiros com o sistema HUMS, sua Ground Station, o download e a análise primária de dados, além do tratamento e registro de alertas.',
       conteudo_programatico='• Introdução ao conceito de HUMS
• Apresentação da operação do HUMS
• Uso da Ground Station
• Procedimentos relacionados ao download e análise primária do HUMS
• Tratamento e registro de alarmes
• Defeitos mais comuns',
       referencias='PRG-MNT-002 — PTM Rev.07, item 20.10
MNL-MNT-003 — Manual do HUMS Rev.06
Instruções técnicas HUMS aplicáveis',
       observacoes='Recorrência configurada em 24 meses por decisão da Gerência de Treinamento, critério interno mais restritivo que o ciclo de 36 meses previsto no PTM.',
       carga_horaria=2,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=2,
       validade=36,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_HUMS' AND ativo=1 AND deleted_at IS NULL;

-- MNT_IIO_APRS — Inspeção IIO & APRS
UPDATE qualificacoes_tipos
   SET nome='Inspeção IIO & APRS',
       descricao='Capacitar profissionais designados para atividades de inspeção, Inspeção de Itens Obrigatórios e Aprovação para Retorno ao Serviço, conforme as responsabilidades e limites regulamentares aplicáveis.',
       conteudo_programatico='• Introduções e definições básicas
• Apresentação da legislação aeronáutica relacionada com as atividades de inspeção, IIO e APRS
• Diferenças entre inspeção e APRS
• Apresentação do sistema de inspeção de uma organização de manutenção
• Apresentação da função de inspeção (RBAC 145.155)
• Apresentação do conceito de APRS (RBAC 43.5 e RBAC 145.157)
• Documentos de APRS
• Etiqueta de Aprovação de Aeronavegabilidade (SEGVOO 003)
• Registro de Grande Alteração/Reparo (SEGVOO 001)
• Procedimentos IIO contidos no MGM
• Conceito de Item de Inspeção Obrigatória (IIO)
• Requisitos para pessoal de inspeção obrigatória – RBAC 135.429
• Procedimentos para reinspeção de IIO
• Métodos de inspeção IIO
• Relação de IIO',
       referencias='PRG-MNT-002 — PTM Rev.07, item 20.16
RBAC 43.5
RBAC 145.155
RBAC 145.157
MGM, MOM e MCQ vigentes',
       observacoes='Recorrência configurada em 24 meses por decisão da Gerência de Treinamento, critério interno mais restritivo que o ciclo de 36 meses previsto no PTM.',
       carga_horaria=4,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       validade=36,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_IIO_APRS' AND ativo=1 AND deleted_at IS NULL;

-- MNT_INTEGRACAO_DOUTRINACAO — Integração / Doutrinação de Manutenção
UPDATE qualificacoes_tipos
   SET nome='Integração / Doutrinação de Manutenção',
       descricao='Integrar o profissional de manutenção à organização, às responsabilidades, políticas, manuais, procedimentos, legislação aeronáutica e métodos de trabalho aplicáveis à Gerência de Manutenção.',
       conteudo_programatico='• Organização da Empresa – Organograma
• Políticas: Sistema de Gestão Integrado, Álcool e Drogas, Cultura Justa, Reporte Voluntário etc
• Atribuições e Responsabilidades (MGM/MOM/MCQ/PTM)
• Procedimentos de Manutenção (MGM/MOM/MCQ/PTM)
• Programa de Treinamento de Manutenção
• Conhecimentos Gerais de Legislação Aeronáutica
• Rede Interna: acesso a publicações técnicas',
       referencias='PRG-MNT-002 — PTM Rev.07, itens 8.3 e 20.3
RBAC 145
IS 145-010C
IS 119-010A
MGM, MOM e MCQ vigentes',
       observacoes='Carga inicial de 8h e recorrente de 4h conforme o treinamento de Doutrinação do PTM. Aplicabilidade conforme função e matriz de treinamento.',
       carga_horaria=4,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO' AND ativo=1 AND deleted_at IS NULL;

-- MNT_MCQ — MCQ - Manual de Controle de Qualidade
UPDATE qualificacoes_tipos
   SET nome='MCQ - Manual de Controle de Qualidade',
       descricao='Familiarizar o pessoal de manutenção com o Manual de Controle de Qualidade, o sistema de qualidade, as responsabilidades de inspeção, controle, auditoria e tratamento de não conformidades.',
       conteudo_programatico='• Finalidade, escopo e estrutura do Manual de Controle de Qualidade
• Responsabilidades do sistema de qualidade e da inspeção
• Controle de processos e inspeções de manutenção
• Registros, rastreabilidade e evidências de conformidade
• Tratamento de não conformidades e ações corretivas
• Auditorias, monitoramento e melhoria do sistema
• Controle de documentação e publicações aplicáveis
• Interfaces do MCQ com MGM, MOM e PTM',
       referencias='MNL-MNT-005 — MCQ Rev.08
PRG-MNT-002 — PTM Rev.07, item 20.3
RBAC 145
IS 145-010C',
       observacoes='Recorrência configurada em 24 meses por decisão da Gerência de Treinamento. O MCQ também integra a Doutrinação de Manutenção; sua aplicação como curso específico deve seguir a matriz vigente.',
       carga_horaria=NULL,
       carga_horaria_inicial=NULL,
       carga_horaria_recorrente=NULL,
       validade=36,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MCQ' AND ativo=1 AND deleted_at IS NULL;

-- MNT_MEL — MEL - Lista de Equipamentos Mínimos
UPDATE qualificacoes_tipos
   SET nome='MEL - Lista de Equipamentos Mínimos',
       descricao='Capacitar o pessoal de manutenção na filosofia, estrutura e aplicação da MEL aprovada, inclusive procedimentos de liberação, placarização e controle de itens inoperantes.',
       conteudo_programatico='• Origem e filosofia da MEL
• Conteúdo geral da MEL
• Seções aplicáveis dos manuais da Costa do Sol
• Procedimentos para uso da MEL
• Sinalização dos itens inoperantes com placares
• Autorizações para retardo da correção de itens da MEL
• Despacho e liberação de voo
• Procedimentos relacionados à MEL',
       referencias='PRG-MNT-002 — PTM Rev.07, item 20.11
MEL aprovada das aeronaves da empresa
MGM e MGO vigentes
Procedimentos aplicáveis',
       observacoes='Aplicabilidade conforme função e designação na matriz de treinamento da Manutenção.',
       carga_horaria=2,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MEL' AND ativo=1 AND deleted_at IS NULL;

-- MNT_MGM — MGM - Manual Geral de Manutenção
UPDATE qualificacoes_tipos
   SET nome='MGM - Manual Geral de Manutenção',
       descricao='Familiarizar o pessoal de manutenção com a organização, responsabilidades, políticas e procedimentos estabelecidos no Manual Geral de Manutenção da Costa do Sol.',
       conteudo_programatico='• Estrutura, finalidade e controle do Manual Geral de Manutenção
• Organização, atribuições e responsabilidades da Gerência de Manutenção
• Planejamento, execução e controle de manutenção
• Controle de aeronavegabilidade e discrepâncias
• Registros técnicos e rastreabilidade
• Controle de materiais, peças, ferramentas e equipamentos
• Liberação e retorno ao serviço conforme aplicável
• Manutenção contratada e interfaces com provedores
• Interfaces com MOM, MCQ e PTM',
       referencias='MNL-MNT-001 — MGM Rev.10
PRG-MNT-002 — PTM Rev.07, item 20.3
RBAC 135
RBAC 145
IS 119-010A',
       observacoes='Recorrência configurada em 24 meses por decisão da Gerência de Treinamento. O MGM também integra a Doutrinação de Manutenção; sua aplicação como curso específico deve seguir a matriz vigente.',
       carga_horaria=NULL,
       carga_horaria_inicial=NULL,
       carga_horaria_recorrente=NULL,
       validade=36,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MGM' AND ativo=1 AND deleted_at IS NULL;

-- MNT_MOM — MOM - Manual da Organização de Manutenção
UPDATE qualificacoes_tipos
   SET nome='MOM - Manual da Organização de Manutenção',
       descricao='Familiarizar o pessoal da Organização de Manutenção com o escopo, responsabilidades, instalações, procedimentos e sistema de qualidade descritos no Manual da Organização de Manutenção.',
       conteudo_programatico='• Estrutura e escopo aprovado da Organização de Manutenção
• Organização, pessoal, atribuições e responsabilidades
• Instalações, recursos, ferramentas e calibração
• Procedimentos de execução e inspeção de manutenção
• Aprovação para retorno ao serviço e registros
• Controle e rastreabilidade de materiais e componentes
• Serviços contratados e subcontratados
• Sistema de qualidade, auditorias e não conformidades
• Reporte de ocorrências e controle documental',
       referencias='MNL-MNT-004 — MOM Rev.08
PRG-MNT-002 — PTM Rev.07, item 20.3
RBAC 145
IS 145-010C',
       observacoes='Recorrência configurada em 24 meses por decisão da Gerência de Treinamento. O MOM também integra a Doutrinação de Manutenção; sua aplicação como curso específico deve seguir a matriz vigente.',
       carga_horaria=NULL,
       carga_horaria_inicial=NULL,
       carga_horaria_recorrente=NULL,
       validade=36,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MOM' AND ativo=1 AND deleted_at IS NULL;

-- MUDA — Gestão de Mudanças
UPDATE qualificacoes_tipos
   SET nome='Gestão de Mudanças',
       descricao='Capacitar empregados e gestores para identificar, planejar, avaliar riscos, comunicar, implementar, monitorar e encerrar mudanças organizacionais, técnicas ou operacionais de forma controlada.',
       conteudo_programatico='• Triagem de mudança
• objetivo/alcance
• partes interessadas
• pessoas e competência
• identificação de riscos/impactos/requisitos
• ações, responsáveis e prazos
• comunicação
• mudanças temporárias/emergenciais
• go-live
• monitoramento
• risco residual
• encerramento',
       referencias='MNL-SGI-001 Rev.09
MNL-SSO-001 — MGSO Rev.18
PRG-SGI-005 Rev.05
ISO 9001:2015
ISO 14001:2015
ISO 45001:2018',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MUDA' AND ativo=1 AND deleted_at IS NULL;

-- N — MGO - Manual Geral de Operações
UPDATE qualificacoes_tipos
   SET nome='MGO - Manual Geral de Operações',
       descricao='Familiarizar tripulantes com a estrutura, responsabilidades e procedimentos estabelecidos no Manual Geral de Operações vigente, promovendo aplicação padronizada nas atividades operacionais.',
       conteudo_programatico='• Estrutura e propósito do MGO
• Responsabilidades dos tripulantes
• Controle operacional e comunicação
• Procedimentos de contingência
• Conformidade regulatória e operacional',
       referencias='MNL-OPS-001 — MGO Rev.14
RBAC 135
IS 135-002G
PRG-OPS-001 — PTO Rev.10',
       observacoes=NULL,
       carga_horaria=1,
       carga_horaria_inicial=1,
       carga_horaria_recorrente=1,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='N' AND ativo=1 AND deleted_at IS NULL;

-- NR-05 — NR-05 — CIPA
UPDATE qualificacoes_tipos
   SET nome='NR-05 — CIPA',
       descricao='Capacitar membros e participantes aplicáveis da CIPA nos conhecimentos necessários à prevenção de acidentes e doenças relacionadas ao trabalho, conforme o enquadramento vigente da NR-05.',
       conteudo_programatico='• Objetivos e atribuições da CIPA
• Organização, composição e funcionamento conforme enquadramento aplicável
• Identificação de perigos e avaliação de riscos ocupacionais
• Medidas de prevenção e hierarquia de controles
• Acidentes e doenças relacionadas ao trabalho
• Investigação, análise e prevenção de ocorrências
• Participação dos trabalhadores e comunicação de riscos
• Noções de resposta a emergências e primeiros socorros
• Prevenção e combate ao assédio e outras formas de violência no trabalho
• Direitos, deveres e responsabilidades dos membros',
       referencias='NR-05 vigente
NR-01
FORM-SGI-037 — Matriz de Treinamento de QSMS
PRG-SGI-005 Rev.05',
       observacoes='A carga horária depende do grau de risco e do enquadramento da organização na NR-05. Não atribuir carga fixa sem a classificação aplicável.',
       carga_horaria=NULL,
       carga_horaria_inicial=NULL,
       carga_horaria_recorrente=NULL,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-05' AND ativo=1 AND deleted_at IS NULL;

-- NR-11 — NR-11 - Transporte, Movimentação, Armazenagem e Manuseio de Materiais
UPDATE qualificacoes_tipos
   SET nome='NR-11 - Transporte, Movimentação, Armazenagem e Manuseio de Materiais',
       descricao='Orientar trabalhadores sobre movimentação, transporte, armazenamento e manuseio seguro de materiais, considerando equipamentos, cargas, circulação, estabilidade e riscos específicos da atividade.',
       conteudo_programatico='• Movimentação e armazenamento seguro
• capacidade/condição de equipamentos
• circulação
• estabilidade de cargas
• linha de fogo
• inspeção
• núcleo geral e trilhas específicas para equipamento motorizado e içamento, quando aplicáveis',
       referencias='NR-11 vigente
NR-01 / PGR
FORM-SGI-037 — Matriz de Treinamento de QSMS
Procedimentos de movimentação e armazenagem aplicáveis',
       observacoes='A trilha geral não substitui capacitações específicas exigidas para determinados equipamentos, operadores ou atividades.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-11' AND ativo=1 AND deleted_at IS NULL;

-- NR-20 — NR-20 — Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis
UPDATE qualificacoes_tipos
   SET nome='NR-20 — Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis',
       descricao='Capacitar trabalhadores abrangidos pela NR-20 para atuação segura com inflamáveis e combustíveis, conforme atividade desempenhada, contato com o processo e classe da instalação.',
       conteudo_programatico='• Perigos e riscos de inflamáveis/combustíveis
• controles
• fontes de ignição
• segurança no processo
• PT quando aplicável
• resposta a emergências
• conteúdos e prática específicos conforme classe da instalação, acesso, contato e atividade',
       referencias='NR-20 vigente — Anexo I
NR-01 / PGR
FORM-SGI-037 — Matriz de Treinamento de QSMS
PRG-SGI-005 Rev.05',
       observacoes='O título foi generalizado para evitar classificar indevidamente o treinamento como “Iniciação”. A matriz vigente adota 16h inicial e 4h de atualização; a aplicabilidade deve permanecer condicionada à atividade, ao contato com o processo e à classe da instalação conforme NR-20.',
       carga_horaria=4,
       carga_horaria_inicial=16,
       carga_horaria_recorrente=4,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-20' AND ativo=1 AND deleted_at IS NULL;

-- NR-26 — NR-26 - Produtos Químicos, Rotulagem e FDS
UPDATE qualificacoes_tipos
   SET nome='NR-26 - Produtos Químicos, Rotulagem e FDS',
       descricao='Capacitar trabalhadores para reconhecer perigos de produtos químicos por meio do GHS, rotulagem preventiva e FDS, aplicando controles seguros de manuseio, armazenamento e resposta inicial.',
       conteudo_programatico='• GHS
• rotulagem preventiva
• FDS e suas seções
• identificação de perigos
• riscos
• prevenção
• incompatibilidades
• armazenamento e manuseio
• medidas de resposta inicial e emergência
• acesso às informações de segurança',
       referencias='NR-26 vigente
ABNT NBR 14725 aplicável
FORM-SGI-037 — Matriz de Treinamento de QSMS
PRG-SGI-005 Rev.05',
       observacoes='Carga de 2h adotada internamente para esta trilha; requisitos específicos devem acompanhar os produtos e atividades efetivamente existentes.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-26' AND ativo=1 AND deleted_at IS NULL;

-- NR-35 — NR-35 - Trabalho em Altura
UPDATE qualificacoes_tipos
   SET nome='NR-35 - Trabalho em Altura',
       descricao='Capacitar trabalhadores autorizados para trabalho em altura no planejamento, análise de risco, prevenção de quedas, sistemas de proteção e procedimentos de emergência e resgate.',
       conteudo_programatico='• Prevenção/evitação de exposição
• análise de risco
• condições impeditivas
• sistemas e medidas de proteção
• EPI/SPIQ
• inspeção
• riscos de queda
• planejamento, organização e execução
• emergências e resgate
• responsabilidades e supervisão',
       referencias='NR-35 vigente, inclusive Portaria MTE nº 1.259/2026
NR-01 / PGR
FORM-SGI-037 — Matriz de Treinamento de QSMS
PRG-SGI-005 Rev.05',
       observacoes='A partir da Portaria MTE nº 1.259/2026, os treinamentos inicial, periódico e eventual da NR-35 devem ser presenciais. O conteúdo EAD pode ser usado apenas como material preparatório/complementar e não gera sozinho a qualificação regulamentar.',
       carga_horaria=8,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=8,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-35' AND ativo=1 AND deleted_at IS NULL;

-- NR06 — NR-06 - Equipamento de Proteção Individual
UPDATE qualificacoes_tipos
   SET nome='NR-06 - Equipamento de Proteção Individual',
       descricao='Capacitar trabalhadores quanto à seleção, uso, ajuste, limitações, inspeção, conservação e responsabilidades relacionadas aos Equipamentos de Proteção Individual utilizados em suas atividades.',
       conteudo_programatico='• Risco
• seleção do EPI
• proteção e limitações
• colocação/ajuste
• inspeção
• conservação/higienização
• substituição
• defeitos
• responsabilidades
• instruções do fabricante/importador e aplicação por atividade',
       referencias='NR-06 vigente
NR-01 / PGR
FORM-SGI-037 — Matriz de Treinamento de QSMS
PRG-SGI-005 Rev.05',
       observacoes='Carga de 2h adotada internamente para esta trilha. A NR-06 exige orientação/capacitação adequada ao EPI e à atividade, sem estabelecer carga horária universal para todos os casos.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR06' AND ativo=1 AND deleted_at IS NULL;

-- P — CFIT - Controlled Flight Into Terrain
UPDATE qualificacoes_tipos
   SET nome='CFIT - Controlled Flight Into Terrain',
       descricao='Desenvolver conhecimentos e estratégias para prevenção de Controlled Flight Into Terrain, reconhecimento de ameaças associadas ao terreno e resposta adequada a alertas TAWS/EGPWS.',
       conteudo_programatico='• Conceito e histórico de CFIT
• Fatores contribuintes e cenários de maior risco
• Consciência situacional e gerenciamento da trajetória
• Altimetria, cartas, procedimentos e aproximação estabilizada
• TAWS/EGPWS: funções, limitações e alertas
• Resposta a alertas e manobra de escape
• CRM, comunicação e tomada de decisão
• Go-around como barreira de prevenção
• Estudos de caso e lições aprendidas',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
RBAC 135
IS 135-003D
Procedimentos TAWS/EGPWS e manuais de voo aplicáveis',
       observacoes=NULL,
       carga_horaria=4,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='P' AND ativo=1 AND deleted_at IS NULL;

-- PETRO-OURO — Regras de Ouro — Petrobras
UPDATE qualificacoes_tipos
   SET nome='Regras de Ouro — Petrobras',
       descricao='Apresentar e reforçar as Regras de Ouro da Petrobras aplicáveis às atividades contratadas, mantendo rastreabilidade da realização do treinamento oficial requerido.',
       conteudo_programatico='• Conteúdo oficial Petrobras
• o AirTrust deve registrar evidência/conclusão e não substituir nem reinterpretar o treinamento oficial',
       referencias='Petrobras — Regras de Ouro vigentes
Requisitos contratuais aplicáveis',
       observacoes='Somente treinamento inicial de 1h, salvo exigência contratual superveniente.',
       carga_horaria=1,
       carga_horaria_inicial=1,
       carga_horaria_recorrente=NULL,
       validade=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PETRO-OURO' AND ativo=1 AND deleted_at IS NULL;

-- PPSP — PPSP — Prevenção do Risco Associado ao Uso Indevido de Substâncias Psicoativas
UPDATE qualificacoes_tipos
   SET nome='PPSP — Prevenção do Risco Associado ao Uso Indevido de Substâncias Psicoativas',
       descricao='Capacitar empregados abrangidos pelo PPSP sobre prevenção do uso indevido de substâncias psicoativas, riscos à segurança, responsabilidades, testagem, confidencialidade e canais de apoio.',
       conteudo_programatico='• Política e objetivos do PPSP
• substâncias psicoativas e efeitos
• riscos à segurança
• responsabilidades do empregado e da organização
• prevenção
• sinais e fatores de risco
• procedimentos do programa
• testagem e confidencialidade conforme aplicável
• assistência/encaminhamento
• consequências administrativas conforme programa
• canais de apoio',
       referencias='RBAC 120
PRG-SSO-005 — PPSP vigente',
       observacoes='Atualização conforme RBAC 120 e programa PPSP vigente.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=60,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PPSP' AND ativo=1 AND deleted_at IS NULL;

-- PPSP_SUP — PPSP para Supervisores ARSO
UPDATE qualificacoes_tipos
   SET nome='PPSP para Supervisores ARSO',
       descricao='Capacitar supervisores e profissionais ARSO nas responsabilidades adicionais do PPSP, incluindo reconhecimento de situações de risco, suspeita justificada, encaminhamento, documentação e confidencialidade.',
       conteudo_programatico='• Conteúdo PPSP acrescido das responsabilidades do supervisor/ARSO: reconhecimento e resposta a situações de risco, encaminhamento, documentação, confidencialidade, limites de atuação, comunicação e aplicação dos procedimentos do programa',
       referencias='RBAC 120
PRG-SSO-005 — PPSP vigente',
       observacoes='Atualização conforme RBAC 120 e programa PPSP vigente.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=60,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PPSP_SUP' AND ativo=1 AND deleted_at IS NULL;

-- PRE — PRE - Plano de Resposta à Emergências
UPDATE qualificacoes_tipos
   SET nome='PRE - Plano de Resposta à Emergências',
       descricao='Capacitar empregados designados para compreender e executar suas atribuições no Plano de Resposta a Emergências, incluindo acionamento, comunicação, coordenação, registros e retorno à normalidade.',
       conteudo_programatico='• Organização e acionamento do PRE
• papéis e responsabilidades
• comunicação e notificações
• resposta inicial
• coordenação interna/externa
• proteção de pessoas e evidências
• bases e cenários aplicáveis
• registros
• exercícios/simulados
• retorno à normalidade e lições aprendidas',
       referencias='Plano de Resposta a Emergências vigente
MNL-SSO-001 — MGSO Rev.18
PRG-SGI-005 Rev.05
RBAC 135 aplicável',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PRE' AND ativo=1 AND deleted_at IS NULL;

-- PT6C-67C — PT6C-67C - Manutenção
UPDATE qualificacoes_tipos
   SET nome='PT6C-67C - Manutenção',
       descricao='Capacitar profissionais de manutenção nos sistemas, práticas padrão, limitações, inspeções e procedimentos aplicáveis ao motor PT6C-67C.',
       conteudo_programatico='• Limitações de Aeronavegabilidade / Tempos Limites / Cheques de Manutenção / Limites Operacionais
• Práticas Padrões (ATA 70)
• Grupo Motopropulsor (ATA 71)
• Motor (ATA 72)
• Controle e Combustível do Motor (ATA 73)
• Ignição (ATA 74)
• Ar (ATA 75)
• Indicação do Motor (ATA 77)
• Óleo (ATA 79)',
       referencias='PRG-MNT-002 — PTM Rev.07, item 20.9
Manuais técnicos Pratt & Whitney PT6C-67C aplicáveis
RBAC 145
IS 145-010C',
       observacoes='Carga corrigida para 16h inicial e 8h recorrente conforme PTM Rev.07. Recorrência mantida em 24 meses por decisão da Gerência de Treinamento, critério interno mais restritivo que o ciclo de 36 meses do PTM.',
       carga_horaria=8,
       carga_horaria_inicial=16,
       carga_horaria_recorrente=8,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PT6C-67C' AND ativo=1 AND deleted_at IS NULL;

-- REG-ANAC — Regulação ANAC
UPDATE qualificacoes_tipos
   SET nome='Regulação ANAC',
       descricao='Familiarizar tripulantes com os principais regulamentos, instruções suplementares e publicações aeronáuticas aplicáveis, assegurando sua correta consulta e aplicação operacional.',
       conteudo_programatico='• SID, STAR, ROTAER, AIP-Brasil e cartas aeronáuticas
• RBACs, ISs, AICs e NOTAMs
• Utilização do SARPAS e consulta ao AISWEB
• Normas operacionais e de segurança aplicáveis',
       referencias='RBAC 61
RBAC 91
RBAC 135
Instruções Suplementares aplicáveis
AIP Brasil, ROTAER, AISWEB e NOTAM
Publicações DECEA aplicáveis',
       observacoes='Inicial 1h. Periódico 1h anual.',
       carga_horaria=1,
       carga_horaria_inicial=1,
       carga_horaria_recorrente=1,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='REG-ANAC' AND ativo=1 AND deleted_at IS NULL;

-- SOP_AW139 — AW139 — Padronização Operacional (SOP)
UPDATE qualificacoes_tipos
   SET nome='AW139 — Padronização Operacional (SOP)',
       descricao='Padronizar a atuação da tripulação do AW139 segundo a filosofia operacional da Costa do Sol, os procedimentos normais, anormais e de emergência, os perfis, callouts, checklists e critérios de estabilização.',
       conteudo_programatico='• Filosofia operacional e princípios de padronização
• Atribuições de PIC, SIC, PF e PM
• Procedimentos normais e uso de checklists
• Perfis operacionais, callouts e critérios de estabilização
• Gerenciamento de automação, FMS e modos do Flight Director
• Procedimentos anormais e de emergência
• Coordenação de cabine, CRM e Threat and Error Management
• Operações onshore e offshore aplicáveis
• Revisão de limitações e pontos críticos do SOP',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
SOP AW139 vigente
RFM/FCOM/QRH AW139
RBAC 135
IS 135-003D',
       observacoes=NULL,
       carga_horaria=4,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=4,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='SOP_AW139' AND ativo=1 AND deleted_at IS NULL;

-- SOP_S76 — SK76 — Padronização Operacional (SOP)
UPDATE qualificacoes_tipos
   SET nome='SK76 — Padronização Operacional (SOP)',
       descricao='Padronizar a atuação da tripulação do S-76 segundo a filosofia operacional da Costa do Sol, os procedimentos normais, anormais e de emergência, os perfis, callouts e checklists aplicáveis.',
       conteudo_programatico='• Filosofia operacional da empresa
• Procedimentos normais e anormais
• Uso de checklists
• Integração com FCOM e OM-B',
       referencias='PRG-OPS-001 — PTO Rev.10
MNL-OPS-001 — MGO Rev.14
SOP S-76 vigente
RFM/FCOM/QRH S-76
RBAC 135
IS 135-003D',
       observacoes=NULL,
       carga_horaria=4,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=4,
       validade=12,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='SOP_S76' AND ativo=1 AND deleted_at IS NULL;

-- STOP_WORK — Stop Work — Autoridade para Interromper Atividades Inseguras
UPDATE qualificacoes_tipos
   SET nome='Stop Work — Autoridade para Interromper Atividades Inseguras',
       descricao='Assegurar que empregados compreendam sua autoridade e responsabilidade para interromper atividades inseguras, comunicar o risco e somente permitir a retomada após restabelecimento de condições seguras.',
       conteudo_programatico='• Objetivo e fundamento do Stop Work
• autoridade e responsabilidade de interromper atividade insegura
• reconhecimento de condições/práticas de risco
• comunicação respeitosa
• paralisação e controle do risco
• retomada somente após condições seguras
• registro/reporte e aprendizagem
• proteção contra retaliação dentro da política aplicável',
       referencias='PRG-SGI-005 Rev.05
MNL-SGI-001 Rev.09
MNL-SSO-001 — MGSO Rev.18
Política Stop Work vigente',
       observacoes=NULL,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='STOP_WORK' AND ativo=1 AND deleted_at IS NULL;

-- Training Management decision: maintenance qualifications previously configured at 36 months use a stricter 24-month AirTrust cycle.
UPDATE qualificacoes_tipos
   SET validade=24,
       observacoes=CASE
         WHEN COALESCE(TRIM(observacoes),'')='' THEN 'Recorrência configurada em 24 meses por decisão da Gerência de Treinamento, critério interno mais restritivo que o ciclo documental de 36 meses quando aplicável.'
         WHEN INSTR(observacoes,'24 meses por decisão da Gerência de Treinamento')>0 THEN observacoes
         ELSE TRIM(observacoes) || CHAR(10) || 'Recorrência configurada em 24 meses por decisão da Gerência de Treinamento, critério interno mais restritivo que o ciclo documental de 36 meses quando aplicável.' END,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('MNT_ARRIEL2','MNT_ARRIEL2_DESM_MOD','MNT_HUMS','MNT_IRM','MNT_IIO_APRS','MNT_MCQ','MNT_MGM','MNT_MOM') AND validade=36 AND ativo=1 AND deleted_at IS NULL;

-- Keep existing qualification-history snapshots coherent with the stricter 24-month maintenance cycle.
UPDATE qualificacoes_historico AS qh
   SET validade_meses=24,
       data_vencimento=CASE WHEN COALESCE(TRIM(qh.data_conclusao),'')='' THEN qh.data_vencimento ELSE date(qh.data_conclusao,'+24 months') END,
       updated_at=datetime('now')
 WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM qualificacoes_tipos qt
                WHERE qt.empresa_id=6 AND qt.ativo=1 AND qt.deleted_at IS NULL
                  AND UPPER(TRIM(qt.codigo)) IN ('MNT_ARRIEL2','MNT_ARRIEL2_DESM_MOD','MNT_HUMS','MNT_IRM','MNT_IIO_APRS','MNT_MCQ','MNT_MGM','MNT_MOM')
                  AND (qh.qualificacao_id=qt.id OR UPPER(TRIM(COALESCE(qh.qualificacao_codigo,'')))=UPPER(TRIM(qt.codigo))));

UPDATE qualificacoes_tipos SET area_id=(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(TRIM(nome))='QSMS' AND ativo=1 AND deleted_at IS NULL LIMIT 1), updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LGPD' AND ativo=1 AND deleted_at IS NULL;

UPDATE lms_cursos AS c
   SET titulo=(SELECT qt.nome FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       descricao=(SELECT qt.descricao FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       conteudo_programatico=(SELECT qt.conteudo_programatico FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       observacoes=(SELECT qt.observacoes FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       referencias=(SELECT qt.referencias FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_inicial_horas=(SELECT qt.carga_horaria_inicial FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_recorrente_horas=(SELECT qt.carga_horaria_recorrente FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_minutos=COALESCE((SELECT ROUND(60*COALESCE(qt.carga_horaria_recorrente,qt.carga_horaria_inicial,qt.carga_horaria)) FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),0),
       updated_at=datetime('now')
 WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL
   AND c.qualificacao_tipo_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('A','AUD_COMP','B','C','COD_ETICA','COL_SEL','CRM_DIR_RBAC119','D2','E1','E2','E4','E5','E6','FDM-EAD','FOD','GATEKEEPER','HELIWISE','I','INTEGRA','INTRO_SGQ','JUST_CULTURE','LGPD','LOSA','MNT_AW139','MNT_HUMS','MNT_IIO_APRS','MNT_INTEGRACAO_DOUTRINACAO','MNT_MCQ','MNT_MEL','MNT_MGM','MNT_MOM','MUDA','N','NR-05','NR-11','NR-20','NR-26','NR-35','NR06','P','PETRO-OURO','PPSP','PPSP_SUP','PRE','PT6C-67C','REG-ANAC','SOP_AW139','SOP_S76','STOP_WORK') AND ativo=1 AND deleted_at IS NULL);

-- Regulatory training that requires presencial/hybrid completion must not be granted by EAD completion alone.
UPDATE lms_cursos SET gerar_qualificacao_ao_concluir=0, updated_at=datetime('now') WHERE empresa_id=6 AND qualificacao_tipo_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('NR-20','NR-35') AND ativo=1 AND deleted_at IS NULL) AND deleted_at IS NULL;

UPDATE treinamento_requisitos SET modalidade_requerida='PRESENCIAL', auto_matricular_ead=0, updated_at=datetime('now') WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-35' AND ativo=1 AND deleted_at IS NULL LIMIT 1);

UPDATE treinamento_requisitos SET modalidade_requerida='HIBRIDO', auto_matricular_ead=0, updated_at=datetime('now') WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-20' AND ativo=1 AND deleted_at IS NULL LIMIT 1);
