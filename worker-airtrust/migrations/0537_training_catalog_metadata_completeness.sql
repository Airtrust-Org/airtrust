-- 0537_training_catalog_metadata_completeness.sql
-- Completes Costa do Sol (empresa_id=6) LMS/qualification metadata from controlled programs,
-- current regulatory requirements and reviewed internal training evidence.
-- Forward-only after 0536. Preserves historical evidence, certificates, enrollments and course packages.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-catalog-metadata-completeness-0537.md

-- ---------------------------------------------------------------------------
-- 1) Regulatory/program corrections where the previously persisted metadata
--    was demonstrably incomplete or regressed.
-- ---------------------------------------------------------------------------

-- Doutrinamento Básico: the reviewed source defines 12 h initial only.
UPDATE qualificacoes_tipos
   SET carga_horaria=12,
       carga_horaria_inicial=12,
       carga_horaria_recorrente=NULL,
       validade=NULL,
       observacoes=COALESCE(NULLIF(TRIM(observacoes),''),
         'Treinamento inicial. Não há carga recorrente automática definida para este modelo; recorrência somente se exigida por revisão do programa ou decisão formal da Gerência de Treinamento.'),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='A' AND ativo=1 AND deleted_at IS NULL;

-- LGPD: 2 h is the documented Costa do Sol EAD standard (certificate evidence from 07/11/2025),
-- not a statutory minimum imposed by Lei 13.709/2018.
UPDATE qualificacoes_tipos
   SET carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       validade=24,
       observacoes='Carga de 2 h adotada pela Costa do Sol com base em evidência interna de curso EAD concluído em 2025. A LGPD/ANPD exige conscientização e boas práticas, mas não fixa carga horária mínima universal. Recorrência de 24 meses é política interna.',
       referencias='Lei nº 13.709/2018 — LGPD
Guias e orientações vigentes da ANPD sobre segurança, governança e conscientização
PRC-GTI-002 — Plano de resposta a contingência LGPD — Rev.02
PRC-GTI-003 — Segurança da Informação para terceiros — LGPD — Rev.01
Evidência interna: Certificado Costa do Sol — Curso de LGPD — 07/11/2025 — 2 h',
       conteudo_programatico='• Fundamentos, princípios e campo de aplicação da LGPD
• Conceitos de dado pessoal, dado pessoal sensível, tratamento, controlador, operador, encarregado e titular
• Bases legais e princípios aplicáveis ao tratamento de dados pessoais
• Direitos dos titulares e atendimento de solicitações
• Papéis e responsabilidades no tratamento de dados
• Segurança da informação e proteção de dados no ambiente corporativo
• Boas práticas de uso, compartilhamento, armazenamento e descarte de informações
• Engenharia social, credenciais, phishing e riscos associados ao fator humano
• Incidentes de segurança e fluxo interno de comunicação/resposta
• Tratamento de dados por terceiros e deveres de confidencialidade
• Consequências do tratamento inadequado e cultura de proteção de dados',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LGPD' AND ativo=1 AND deleted_at IS NULL;

-- NR-05: the effective NR-04 classifies air passenger non-regular transport (51.12-9)
-- as GR 3; NR-05 therefore requires 16 h minimum, including at least 8 h presencial.
-- Keep the EAD catalog identity requested by Training Management as the theoretical component,
-- but fail closed for qualification: EAD completion alone cannot certify CIPA.
UPDATE qualificacoes_tipos
   SET categoria='EAD',
       validade=24,
       carga_horaria=16,
       carga_horaria_inicial=16,
       carga_horaria_recorrente=16,
       observacoes='Costa do Sol enquadrada no grupo CNAE 51.12-9 (transporte aéreo de passageiros não regular), Grau de Risco 3 no Anexo I vigente da NR-04. A NR-05 exige 16 h mínimas e pelo menos 8 h presenciais. O curso EAD do AirTrust corresponde somente à parcela teórica; a qualificação CIPA somente pode ser reconhecida após evidência da parcela presencial e demais requisitos aplicáveis. Treinamento realizado há menos de 2 anos pode ser aproveitado na mesma organização nos termos da NR-05/NR-01.',
       referencias='NR-05 vigente — itens 5.7.1 a 5.7.4
NR-04 vigente — Anexo I — grupo 51.12-9 — Grau de Risco 3
NR-01 — capacitação e treinamento em SST
FORM-SGI-037 — Matriz de Treinamento de QSMS — Rev.03
PRG-SGI-005 — Programa de Treinamento — Rev.05',
       conteudo_programatico='• Estudo do ambiente, das condições de trabalho e dos riscos do processo produtivo
• Acidentes e doenças relacionadas ao trabalho, riscos existentes e medidas de prevenção
• Metodologia de investigação e análise de acidentes e doenças relacionadas ao trabalho
• Princípios gerais de higiene do trabalho e medidas de prevenção de riscos
• Legislação trabalhista e previdenciária relativa à segurança e saúde no trabalho
• Inclusão de pessoas com deficiência e reabilitados nos processos de trabalho
• Organização, atribuições, direitos, deveres e funcionamento da CIPA
• Prevenção e combate ao assédio sexual e a outras formas de violência no trabalho
• Riscos específicos do estabelecimento e controles previstos no PGR
• Noções de resposta a emergências e primeiros socorros
• Exercícios e aplicação prática compatíveis com a parcela presencial obrigatória',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-05' AND ativo=1 AND deleted_at IS NULL;

UPDATE treinamento_requisitos
   SET modalidade_requerida='HIBRIDO',
       auto_matricular_ead=0,
       referencia_normativa='NR-05; NR-04 Anexo I; NR-01; FORM-SGI-037 Rev.03; PRG-SGI-005 Rev.05',
       justificativa='CIPA de estabelecimento GR 3: mínimo 16 h, com pelo menos 8 h presenciais; conclusão EAD isolada não gera a qualificação.',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-05' AND ativo=1 AND deleted_at IS NULL LIMIT 1);

-- NR-20: restore the reviewed Intermediário path for maintenance/inspection.
UPDATE qualificacoes_tipos
   SET nome='NR-20 - Curso Intermediário — Inflamáveis e Combustíveis',
       categoria='EAD',
       validade=24,
       carga_horaria=4,
       carga_horaria_inicial=16,
       carga_horaria_recorrente=4,
       observacoes='Trilha Intermediária aplicável à população revisada exposta a inflamáveis/combustíveis em atividades de manutenção e inspeção. Carga inicial de 16 h e atualização de 4 h; a qualificação exige evidência integral da trilha híbrida, incluindo os componentes práticos aplicáveis. O EAD isolado não certifica NR-20.',
       referencias='NR-20 vigente — Anexo I — Tabelas 1 e 2 e conteúdo do Curso Intermediário
FORM-SGI-037 — Matriz de Treinamento de QSMS — Rev.03
Licença de Operação INEA IN001890
PRG-SGI-005 — Programa de Treinamento — Rev.05',
       conteudo_programatico='• Inflamáveis e combustíveis: características, propriedades, perigos e riscos
• Controles coletivos e individuais para trabalhos com inflamáveis
• Fontes de ignição e medidas de controle
• Proteção contra incêndio com inflamáveis e combustíveis
• Procedimentos em situações de emergência
• Requisitos aplicáveis da NR-20
• Análise Preliminar de Perigos/Riscos: conceitos e exercícios
• Permissão para Trabalho com inflamáveis
• Acidentes com inflamáveis: análise de causas e medidas preventivas
• Conteúdo prático previsto na NR-20, conforme atividade e instalação
• Sistemas e procedimentos internos aplicáveis à operação/manutenção da Costa do Sol',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-20' AND ativo=1 AND deleted_at IS NULL;

UPDATE treinamento_requisitos
   SET modalidade_requerida='HIBRIDO',
       auto_matricular_ead=0,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-20' AND ativo=1 AND deleted_at IS NULL LIMIT 1);

-- Maintenance indoctrination: controlled PTM PRG-MNT-002 Rev.06 (14/03/2025), item 20.3.
UPDATE qualificacoes_tipos
   SET validade=36,
       carga_horaria=4,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       observacoes='Treinamento de Doutrinação da Manutenção conforme PRG-MNT-002 Rev.06, item 20.3. Obrigatório ao pessoal da gestão da manutenção. Carga mínima global: 8 h inicial e 4 h recorrente, com recorrência a cada 36 meses, ou em período menor quando houver requisito contratual ou necessidade identificada.',
       referencias='PRG-MNT-002 — Programa de Treinamento de Manutenção — Rev.06 — item 20.3
RBAC 145.163
IS 145-010
RBAC 135.433
IS 120-016',
       conteudo_programatico='• Organização e organograma da empresa
• Sistema de Gestão Integrado e políticas corporativas aplicáveis
• Política sobre álcool e substâncias psicoativas
• Cultura Justa, reporte voluntário e responsabilidades de segurança
• Deveres e responsabilidades descritos no MGM, MOM, MCQ e PTM
• Procedimentos de manutenção descritos no MGM, MOM, MCQ e PTM
• Programa de Treinamento de Manutenção
• Legislação aeronáutica geral aplicável às atividades de manutenção
• Acesso à rede interna, documentação técnica e publicações controladas
• Alterações regulamentares, procedimentais e de política interna relevantes à recorrência',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET carga_horaria=NULL,
       carga_horaria_inicial=NULL,
       carga_horaria_recorrente=NULL,
       observacoes='Módulo documental integrante do Treinamento de Doutrinação previsto no PRG-MNT-002 Rev.06, item 20.3. O PTM não atribui carga horária autônoma a este manual; a carga mínima pertence ao conjunto da Doutrinação (8 h inicial / 4 h recorrente). Não somar 8 h adicionais a este item.',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('MNT_MGM','MNT_MOM','MNT_MCQ') AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET referencias=REPLACE(REPLACE(COALESCE(referencias,''),'PRG-MNT-002 — PTM Rev.07','PRG-MNT-002 — PTM Rev.06'),'PRG-MNT-002 Rev.07','PRG-MNT-002 Rev.06'),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND UPPER(TRIM(codigo)) LIKE 'MNT_%';

-- ---------------------------------------------------------------------------
-- 2) FDM and BowTie metadata completed from controlled Safety sources.
-- ---------------------------------------------------------------------------

UPDATE qualificacoes_tipos
   SET nome='Treinamento de FDM - MNT',
       descricao='Capacitar mecânicos e auxiliares de manutenção nos fundamentos do Flight Data Monitoring, coleta e transferência de dados, uso seguro das informações e interface com o Comitê FDM.',
       conteudo_programatico='• Terminologia e definições do FDM
• Objetivos, princípios e limites do programa
• Funcionamento geral e fluxo de dados
• Coleta, retirada e transferência segura dos dados
• Uso dos dados de voo na prevenção de ocorrências
• Confidencialidade e Cultura Justa
• Interfaces entre Manutenção, Operações, GSO e Comitê FDM
• Responsabilidades do pessoal de manutenção no programa',
       referencias='MNL-SSO-002 — Manual de FDM — Rev.09 — Anexo 1 — Programa de Treinamento — Mecânicos
IS 119-008A
FAA AC 120-82
IOGP 590
IOGP 690',
       observacoes='Carga de 1 h definida no Anexo 1 do MNL-SSO-002 Rev.09 para Mecânicos. Validade vitalícia preservada conforme matriz final da Gerência de Treinamento de 06/10/2026; reciclagem extraordinária pode ser determinada por revisão do programa ou necessidade operacional.',
       validade=NULL,
       carga_horaria=1,
       carga_horaria_inicial=1,
       carga_horaria_recorrente=1,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET descricao='Capacitar comandantes e copilotos nos fundamentos, objetivos, responsabilidades e fluxo operacional do Programa de Flight Data Monitoring da Costa do Sol.',
       conteudo_programatico='• Histórico, fundamentos e requisitos do FDM
• Referências e objetivos do programa
• Funcionamento do programa e fluxo de dados
• Ações e responsabilidades dos tripulantes
• Comitê FDM e governança do programa
• Critérios para abertura de voos/eventos
• Convocação e participação de tripulantes
• Eventos egregious e tratamento pelo Comitê
• Confidencialidade, Cultura Justa e Protocolo FDM',
       referencias='MNL-SSO-002 — Manual de FDM — Rev.09 — Anexo 1 — Programa de Treinamento — Grupo de Voo
IS 119-008A
FAA AC 120-82
IOGP 590
IOGP 690',
       observacoes='Carga de 1 h definida no Anexo 1 do MNL-SSO-002 Rev.09 para o Grupo de Voo. Modalidade e validade permanecem conforme governança do programa/matriz; esta mudança não cria pacote LMS nem presume conclusão.',
       carga_horaria=1,
       carga_horaria_inicial=1,
       carga_horaria_recorrente=1,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET descricao='Capacitar integrantes do Comitê FDM, Gatekeepers e funções relacionadas na governança, análise, confidencialidade e tratamento de eventos do Programa FDM.',
       conteudo_programatico='• Introdução, premissas e objetivos do FDM
• Funcionamento e governança do programa
• Composição, responsabilidades e dinâmica do Comitê FDM
• Papel do Gatekeeper e proteção da confidencialidade
• Parâmetros e requisitos contratuais aplicáveis, inclusive Petrobras
• Critérios para abertura e análise de voos/eventos
• Convocação de tripulantes e tratamento de eventos
• Eventos egregious e tomada de decisão do Comitê
• Protocolo FDM, Cultura Justa e uso responsável dos dados',
       referencias='MNL-SSO-002 — Manual de FDM — Rev.09 — Anexo 1 — Programa de Treinamento — Comitê FDM
IS 119-008A
FAA AC 120-82
IOGP 590
IOGP 690',
       observacoes='Carga de 2 h definida no Anexo 1 do MNL-SSO-002 Rev.09 para o Comitê FDM. A exigência por cargo não concede automaticamente designação ao Comitê nem ao papel de Gatekeeper; designações nominais permanecem independentes.',
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-COMITE-GATEKEEPER' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET nome='BowTieXP — Gerenciamento de Riscos e Safety Case',
       descricao='Capacitar gestores na metodologia BowTie e no uso do BowTieXP para estruturar perigos, Top Events, ameaças, consequências, barreiras e controles de escalação integrados ao Safety Case e ao SGSO.',
       conteudo_programatico='• Fundamentos de identificação de perigos e gerenciamento de riscos
• Relação entre Safety Case, Matriz de Gerenciamento de Riscos e BowTie
• Definição de perigo, Top Event, ameaças e consequências
• Barreiras preventivas, de detecção/recuperação e de mitigação
• Controles de escalação e fatores de degradação
• Construção e leitura de diagramas BowTie
• Cadastro e manutenção das barreiras no BowTieXP
• Responsáveis por barreiras e verificação de efetividade
• Integração com auditorias, ações corretivas e monitoramento de riscos
• Exercícios práticos de análise e construção de BowTies',
       referencias='PRG-SSO-001 — Programa de Treinamento de Segurança Operacional — Rev.04 — item 6.3.2
MNL-SSO-003 — Manual de Safety Case — Rev.10 — itens 6.3, 6.8 e 6.9
MNL-SSO-001 — MGSO — Rev.18
PRC-SSO-004 — Gerir Riscos — Rev.03
RBAC 135 — Apêndice H
IS 119-002D',
       observacoes='Treinamento destinado a Gestores conforme matriz final da Gerência de Treinamento. Carga interna de 4 h e validade de 24 meses preservadas; as referências controladas definem o conteúdo e a metodologia, não uma carga legal autônoma específica de BowTieXP.',
       validade=24,
       carga_horaria=4,
       carga_horaria_inicial=4,
       carga_horaria_recorrente=4,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='BOWTIEXP' AND ativo=1 AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Complete previously blank observations; preserve any later nonblank note.
-- ---------------------------------------------------------------------------
UPDATE qualificacoes_tipos SET observacoes='Aplicável somente a pessoas formalmente designadas para Auditoria Comportamental. A conclusão do curso não cria a designação.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='AUD_COMP' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Curso do currículo operacional. Carga inicial de 4 h e recorrente de 2 h, com ciclo de 12 meses conforme modelo vigente; utilizar somente conteúdo e revisão controlados.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='B' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento corporativo obrigatório conforme matriz final. Carga de 3 h e ciclo de 12 meses são critérios internos da matriz de treinamento; manter alinhamento com o Código de Ética vigente.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='COD_ETICA' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento de QSMS sobre gestão de resíduos e coleta seletiva. Aplicabilidade e periodicidade seguem a matriz corporativa e os procedimentos ambientais vigentes.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='COL_SEL' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento SGSO da matriz corporativa. O conteúdo deve permanecer coerente com o MGSO e o Programa de Treinamento de Segurança Operacional vigentes; treinamentos adicionais por função podem complementar este modelo.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='D2' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento operacional específico para operações offshore. Utilizar o PTO e os procedimentos operacionais vigentes como fonte controlada.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E1' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento operacional PBN. O conteúdo deve acompanhar autorizações operacionais, manuais e revisões regulatórias vigentes.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E2' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento de EFB. Manter aderência às aprovações, procedimentos e versões de equipamento/software efetivamente utilizadas pela empresa.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E5' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento para operações em terrenos desabitados. Conteúdo e aplicabilidade devem permanecer alinhados ao PTO e às autorizações operacionais vigentes.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='E6' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Modelo histórico de FDM preservado por evidência anterior. Novas exigências por público são tratadas pelos modelos FDM-TRIPULACAO, FDM-MECANICO e FDM-COMITE-GATEKEEPER; não consolidar históricos automaticamente.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-EAD' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento de prevenção de FOD conforme matriz de Segurança Operacional. Aplicabilidade por função deve permanecer aderente à matriz final vigente.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FOD' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento associado à função/designação de Gatekeeper. Conclusão não atribui automaticamente a designação nominal nem acesso a dados protegidos do FDM.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='GATEKEEPER' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento introdutório do Sistema de Gestão Integrado, Segurança e Qualidade. Aplicável conforme matriz corporativa vigente.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTRO_SGQ' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento de Cultura Justa. Deve reforçar reporte, distinção entre erro/violação, confidencialidade e critérios de responsabilização sem substituir procedimentos formais de investigação.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='JUST_CULTURE' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Aplicável apenas aos integrantes formalmente designados para LOSA. A conclusão do curso não cria designação nem autorização para conduzir observações.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LOSA' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Aplicável somente a pessoas individualmente designadas para processos de Gestão de Mudanças. A conclusão não cria designação.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MUDA' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento sobre o Manual Geral de Operações. O conteúdo deve acompanhar a revisão vigente do MGO; revisão documental relevante pode exigir treinamento extraordinário.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='N' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento CFIT/TAWS do currículo operacional. Manter alinhamento ao PTO, manuais das aeronaves e procedimentos de operação vigentes.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='P' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento do Plano de Resposta a Emergências. Deve ser complementado por exercícios/simulados e responsabilidades práticas quando previstos pelo PRE vigente.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PRE' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento de padronização operacional AW139. O SOP vigente é a fonte operacional primária; atualização relevante do SOP pode exigir treinamento extraordinário.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='SOP_AW139' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento de padronização operacional S-76. O SOP vigente é a fonte operacional primária; atualização relevante do SOP pode exigir treinamento extraordinário.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='SOP_S76' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET observacoes='Treinamento sobre autoridade e dever de interromper atividade insegura. Aplicação prática deve respeitar os canais e procedimentos de Segurança Operacional/QSMS vigentes.',updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='STOP_WORK' AND COALESCE(TRIM(observacoes),'')='' AND ativo=1 AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Synchronize active reviewed LMS courses from the qualification SSOT.
-- ---------------------------------------------------------------------------
UPDATE lms_cursos AS c
   SET titulo=(SELECT qt.nome FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       descricao=(SELECT qt.descricao FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       categoria=(SELECT qt.categoria FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       conteudo_programatico=(SELECT qt.conteudo_programatico FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       observacoes=(SELECT qt.observacoes FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       referencias=(SELECT qt.referencias FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_inicial_horas=(SELECT qt.carga_horaria_inicial FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_recorrente_horas=(SELECT qt.carga_horaria_recorrente FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_minutos=(SELECT CASE
         WHEN UPPER(TRIM(qt.codigo))='NR-05' THEN 480
         WHEN qt.carga_horaria_recorrente IS NOT NULL THEN ROUND(60*qt.carga_horaria_recorrente)
         WHEN qt.carga_horaria_inicial IS NOT NULL THEN ROUND(60*qt.carga_horaria_inicial)
         WHEN qt.carga_horaria IS NOT NULL THEN ROUND(60*qt.carga_horaria)
         ELSE NULL END
         FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       updated_at=datetime('now')
 WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL
   AND c.qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
        AND UPPER(TRIM(codigo)) IN (
          'A','AUD_COMP','B','C','COD_ETICA','COL_SEL','CRM_DIR_RBAC119','D2','E1','E2','E4','E5','E6',
          'FDM-EAD','FOD','GATEKEEPER','HELIWISE','I','INTEGRA','INTRO_SGQ','JUST_CULTURE','LGPD','LOSA',
          'MNT_AW139','MNT_HUMS','MNT_IIO_APRS','MNT_INTEGRACAO_DOUTRINACAO','MNT_MCQ','MNT_MEL','MNT_MGM',
          'MNT_MOM','MUDA','N','NR-05','NR-11','NR-20','NR-26','NR-35','NR06','P','REGRAS_OURO_PETROBRAS',
          'PPSP','PPSP_SUP','PRE','PT6C-67C','REG-ANAC','SOP_AW139','SOP_S76','STOP_WORK'
        )
   );

UPDATE lms_cursos
   SET gerar_qualificacao_ao_concluir=0, updated_at=datetime('now')
 WHERE empresa_id=6 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
       AND UPPER(TRIM(codigo)) IN ('NR-05','NR-20')
   );

UPDATE lms_cursos
   SET carga_horaria_minutos=NULL,
       carga_horaria_inicial_horas=NULL,
       carga_horaria_recorrente_horas=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
       AND UPPER(TRIM(codigo)) IN ('MNT_MGM','MNT_MOM','MNT_MCQ')
   );
