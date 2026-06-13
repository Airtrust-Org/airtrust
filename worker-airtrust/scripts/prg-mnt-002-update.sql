-- ============================================================
-- ATUALIZAÇÃO MODELOS MANUTENÇÃO — PRG-MNT-002 Rev06 Cap. 20
-- empresa_id = 6 ONLY — MNT_* codes + setor_id = 11
-- Gerado: 2026-06-13
-- IDEMPOTENTE: safe to re-run; apenas UPDATE WHERE empresa_id = 6 AND codigo = X
-- NÃO altera: histórico de funcionários, vencimentos, status, modelos de Tripulação
-- ============================================================

-- ============================================================
-- 1. MNT_INTEGRACAO_DOUTRINACAO (id=122)
--    Match: MATCH_EXATO (código)
--    Categoria: DOUTRINACAO → Treinamento de Doutrinação
--    Carga: NULL,NULL,NULL → inicial=8, recorrente=4, carga_horaria=4
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento de Doutrinação',
  carga_horaria          = 4,
  carga_horaria_inicial  = 8,
  carga_horaria_recorrente = 4,
  conteudo_programatico  = '• Organização da Empresa – Organograma.
• Políticas: Sistema de Gestão Integrado, Álcool e Drogas, Cultura Justa, Reporte Voluntário etc.
• Atribuições e Responsabilidades (MGM/MOM/MCQ/PTM).
• Procedimentos de Manutenção (MGM/MOM/MCQ/PTM).
• Programa de Treinamento de Manutenção.
• Conhecimentos Gerais de Legislação Aeronáutica.
• Rede Interna: acesso a publicações técnicas.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_INTEGRACAO_DOUTRINACAO'
  AND deleted_at IS NULL;

-- ============================================================
-- 2. MNT_AS350B2 (id=128)
--    Match: MATCH_EXATO (código)
--    Categoria: Treinamento Teórico → Treinamento de Produto
--    Carga: NULL,NULL,NULL → inicial=40, recorrente=12, carga_horaria=12
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento de Produto',
  carga_horaria          = 12,
  carga_horaria_inicial  = 40,
  carga_horaria_recorrente = 12,
  conteudo_programatico  = '• Conteúdo baseado no Manual de Manutenção do fabricante.
• Descrição e funcionamento dos sistemas da aeronave.
• Estrutura.
• Transmissões dos rotores principal e de cauda.
• Sistema de combustível.
• Sistema elétrico.
• Sistema hidráulico.
• Comandos de voo.
• Proteção contra fogo.
• Aquecimento e ventilação.
• Iluminação.
• Comunicação.
• Navegação.
• Interfaces da célula com o motor.
• Instalação do motor.
• Indicações, comandos e lubrificação do motor.
• Sistema de partida.
• Escapamento.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_AS350B2'
  AND deleted_at IS NULL;

-- ============================================================
-- 3. MNT_S76AC (id=129)
--    Match: MATCH_EXATO (código)
--    Categoria: Treinamento Teórico → Treinamento de Produto
--    Carga: NULL,NULL,NULL → inicial=40, recorrente=12, carga_horaria=12
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento de Produto',
  carga_horaria          = 12,
  carga_horaria_inicial  = 40,
  carga_horaria_recorrente = 12,
  conteudo_programatico  = '• Conteúdo baseado no Manual de Manutenção do fabricante.
• Descrição e funcionamento dos sistemas da aeronave.
• Estrutura.
• Transmissões dos rotores principal e de cauda.
• Sistema de combustível.
• Sistema elétrico.
• Sistema hidráulico.
• Comandos de voo.
• Proteção contra fogo.
• Aquecimento e ventilação.
• Iluminação.
• Comunicação.
• Navegação.
• Interfaces da célula com o motor.
• Instalação do motor.
• Indicações, comandos e lubrificação do motor.
• Sistema de partida.
• Escapamento.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_S76AC'
  AND deleted_at IS NULL;

-- ============================================================
-- 4. MNT_AW139 (id=130)
--    Match: MATCH_EXATO (código)
--    Categoria: Treinamento Teórico → Treinamento de Produto
--    Carga: NULL,NULL,NULL → inicial=40, recorrente=12, carga_horaria=12
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento de Produto',
  carga_horaria          = 12,
  carga_horaria_inicial  = 40,
  carga_horaria_recorrente = 12,
  conteudo_programatico  = '• Conteúdo baseado no Manual de Manutenção do fabricante.
• Descrição e funcionamento dos sistemas da aeronave.
• Estrutura.
• Transmissões dos rotores principal e de cauda.
• Sistema de combustível.
• Sistema elétrico.
• Sistema hidráulico.
• Comandos de voo.
• Proteção contra fogo.
• Aquecimento e ventilação.
• Iluminação.
• Comunicação.
• Navegação.
• Interfaces da célula com o motor.
• Instalação do motor.
• Indicações, comandos e lubrificação do motor.
• Sistema de partida.
• Escapamento.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_AW139'
  AND deleted_at IS NULL;

-- ============================================================
-- 5. MNT_ARRIEL2 (id=131)
--    Match: MATCH_EXATO (código)
--    Categoria: Treinamento Teórico → Treinamento de Produto
--    Carga: NULL,NULL,NULL → inicial=16, recorrente=8, carga_horaria=8
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento de Produto',
  carga_horaria          = 8,
  carga_horaria_inicial  = 16,
  carga_horaria_recorrente = 8,
  conteudo_programatico  = '• Apresentação geral do motor.
• Composição modular.
• Componentes do motor.
• Interface célula-motor.
• Limitações de Aeronavegabilidade.
• Tempos Limites.
• Cheques de Manutenção.
• Limites Operacionais.
• Práticas Padrões (ATA 70).
• Grupo Motopropulsor (ATA 71).
• Motor (ATA 72).
• Controle e Combustível do Motor (ATA 73).
• Ignição (ATA 74).
• Ar (ATA 75).
• Indicação do Motor (ATA 77).
• Óleo (ATA 79).
• Conjunto Roda Livre / Caixa de Acessórios (ATA 83).',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_ARRIEL2'
  AND deleted_at IS NULL;

-- ============================================================
-- 6. MNT_ARRIEL2_DESM_MOD (id=132)
--    Match: MATCH_EXATO (código)
--    Categoria: PRODUTO → Treinamento de Produto
--    Carga: NULL,NULL,NULL → inicial=24, recorrente=8, carga_horaria=8
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento de Produto',
  carga_horaria          = 8,
  carga_horaria_inicial  = 24,
  carga_horaria_recorrente = 8,
  conteudo_programatico  = '• Conteúdo baseado no Manual de Manutenção do fabricante.
• Execução prática de desmodulação e modulação de motor.
• Precauções de segurança relacionadas ao motor e seus sistemas.
• Localização dos principais componentes do motor.
• Funcionamento normal dos principais sistemas do motor.
• Terminologia e nomenclatura.
• Serviços de manutenção, manutenção preventiva e alterações associados ao motor.
• Desmodulação e modulação de acordo com o Manual de Manutenção.
• Uso de documentação apropriada.
• Procedimentos aplicáveis para substituição de componentes.
• Diagnóstico de falhas e retificação a nível de manual de manutenção.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_ARRIEL2_DESM_MOD'
  AND deleted_at IS NULL;

-- ============================================================
-- 7. MNT_PT6C_67C (id=133)
--    Match: MATCH_EXATO (código)
--    Categoria: Treinamento Teórico → Treinamento de Produto
--    Carga: NULL,NULL,NULL → inicial=16, recorrente=8, carga_horaria=8
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento de Produto',
  carga_horaria          = 8,
  carga_horaria_inicial  = 16,
  carga_horaria_recorrente = 8,
  conteudo_programatico  = '• Apresentação geral do motor.
• Composição modular.
• Componentes do motor.
• Interface célula-motor.
• Limitações de Aeronavegabilidade.
• Tempos Limites.
• Cheques de Manutenção.
• Limites Operacionais.
• Práticas Padrões (ATA 70).
• Grupo Motopropulsor (ATA 71).
• Motor (ATA 72).
• Controle e Combustível do Motor (ATA 73).
• Ignição (ATA 74).
• Ar (ATA 75).
• Indicação do Motor (ATA 77).
• Óleo (ATA 79).',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_PT6C_67C'
  AND deleted_at IS NULL;

-- ============================================================
-- 8. MNT_HUMS (id=134)
--    Match: MATCH_EXATO (código)
--    Categoria: TECNICO_ESPECIALIZADO → Treinamento Técnico Especializado
--    Carga: NULL,NULL,NULL → inicial=4, recorrente=2, carga_horaria=2
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento Técnico Especializado',
  carga_horaria          = 2,
  carga_horaria_inicial  = 4,
  carga_horaria_recorrente = 2,
  conteudo_programatico  = '• Introdução ao conceito de HUMS.
• Apresentação da operação do HUMS.
• Uso da Ground Station.
• Procedimentos relacionados ao download e análise primária do HUMS.
• Tratamento e registro de alarmes.
• Defeitos mais comuns.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_HUMS'
  AND deleted_at IS NULL;

-- ============================================================
-- 9. MNT_FATORES_HUMANOS_CRM (id=136)
--    Match: MATCH_EXATO (código)
--    Categoria: TECNICO_ESPECIALIZADO → Treinamento Técnico Especializado
--    Carga: NULL,NULL,NULL → inicial=8, recorrente=4, carga_horaria=4
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento Técnico Especializado',
  carga_horaria          = 4,
  carga_horaria_inicial  = 8,
  carga_horaria_recorrente = 4,
  conteudo_programatico  = '• Fatores Humanos: histórico e definições.
• Cultura de segurança e fatores organizacionais.
• Modelos de Fatores Humanos e sua aplicabilidade na organização – Reason, SHELL e outros.
• Erros humanos.
• Desempenho humano e limitações.
• Ambiente.
• Procedimentos, informações, ferramentas e práticas.
• Comunicação.
• Trabalho em equipe.
• Programa de Fatores Humanos da Costa do Sol.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_FATORES_HUMANOS_CRM'
  AND deleted_at IS NULL;

-- ============================================================
-- 10. MNT_ARTIGOS_PERIGOSOS (id=137)
--     Match: MATCH_EXATO (código)
--     Categoria: TECNICO_ESPECIALIZADO → Treinamento Técnico Especializado
--     Carga: NULL,NULL,NULL → inicial=32, recorrente=16, carga_horaria=16
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento Técnico Especializado',
  carga_horaria          = 16,
  carga_horaria_inicial  = 32,
  carga_horaria_recorrente = 16,
  conteudo_programatico  = '• Filosofia geral.
• Limitações.
• Requisitos gerais para expedidores.
• Classificação de Artigos Perigosos.
• Lista de Artigos Perigosos.
• Requisitos de Embalagem.
• Etiquetagem e marcação.
• Provisões para passageiros e tripulantes.
• Procedimentos de emergência.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_ARTIGOS_PERIGOSOS'
  AND deleted_at IS NULL;

-- ============================================================
-- 11. MNT_MEL (id=139)
--     Match: MATCH_EXATO (código)
--     Categoria: TECNICO_ESPECIALIZADO → Treinamento Técnico Especializado
--     Carga: NULL,NULL,NULL → inicial=4, recorrente=2, carga_horaria=2
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento Técnico Especializado',
  carga_horaria          = 2,
  carga_horaria_inicial  = 4,
  carga_horaria_recorrente = 2,
  conteudo_programatico  = '• Origem e filosofia da MEL.
• Conteúdo geral da MEL.
• Seções aplicáveis dos manuais da Costa do Sol.
• Procedimentos para uso da MEL.
• Sinalização dos itens inoperantes com placares.
• Autorizações para retardo da correção de itens da MEL.
• Despacho e liberação de voo.
• Procedimentos relacionados à MEL.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_MEL'
  AND deleted_at IS NULL;

-- ============================================================
-- 12. MNT_IRM (id=126)
--     Match: MATCH_EXATO (código)
--     Categoria: TECNICO_ESPECIALIZADO → Treinamento Técnico Especializado
--     Carga: NULL,NULL,NULL → inicial=2, recorrente=1, carga_horaria=1
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento Técnico Especializado',
  carga_horaria          = 1,
  carga_horaria_inicial  = 2,
  carga_horaria_recorrente = 1,
  conteudo_programatico  = '• Definições básicas.
• Requisitos aplicáveis e documentos complementares.
• Motivo pelo qual controlamos a origem do produto.
• Aprovação de um produto aeronáutico.
• Procedimentos de recebimento de produto aeronáutico.
• Documentos de comprovação de origem de produto aeronáutico.
• Exemplos de partes não aprovadas.
• Treinamento prático.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_IRM'
  AND deleted_at IS NULL;

-- ============================================================
-- 13. MNT_IIO_APRS (id=127)
--     Match: MATCH_EXATO (código)
--     Categoria: TECNICO_ESPECIALIZADO → Treinamento Técnico Especializado
--     Carga: NULL,NULL,NULL → inicial=8, recorrente=4, carga_horaria=4
-- ============================================================
UPDATE qualificacoes_tipos
SET
  categoria              = 'Treinamento Técnico Especializado',
  carga_horaria          = 4,
  carga_horaria_inicial  = 8,
  carga_horaria_recorrente = 4,
  conteudo_programatico  = '• Introduções e definições básicas.
• Apresentação da legislação aeronáutica relacionada com as atividades de inspeção, IIO e APRS.
• Diferenças entre inspeção e APRS.
• Apresentação do sistema de inspeção de uma organização de manutenção.
• Apresentação da função de inspeção (RBAC 145.155).
• Apresentação do conceito de APRS (RBAC 43.5 e RBAC 145.157).
• Documentos de APRS.
• Etiqueta de Aprovação de Aeronavegabilidade (SEGVOO 003).
• Registro de Grande Alteração/Reparo (SEGVOO 001).
• Procedimentos IIO contidos no MGM.
• Conceito de Item de Inspeção Obrigatória (IIO).
• Requisitos para pessoal de inspeção obrigatória – RBAC 135.429.
• Procedimentos para reinspeção de IIO.
• Métodos de inspeção IIO.
• Relação de IIO.',
  updated_at             = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_IIO_APRS'
  AND deleted_at IS NULL;

-- ============================================================
-- CATEGORIA ONLY — não estão no Capítulo 20 mas têm categoria claramente aplicável
-- ============================================================

-- 14. MNT_MOM (id=123) → Treinamento de Doutrinação (manual de procedimentos)
UPDATE qualificacoes_tipos
SET
  categoria  = 'Treinamento de Doutrinação',
  updated_at = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_MOM'
  AND deleted_at IS NULL;

-- 15. MNT_MCQ (id=124) → Treinamento de Doutrinação (manual de qualidade)
UPDATE qualificacoes_tipos
SET
  categoria  = 'Treinamento de Doutrinação',
  updated_at = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_MCQ'
  AND deleted_at IS NULL;

-- 16. MNT_MGM (id=125) → Treinamento de Doutrinação (manual geral de manutenção)
UPDATE qualificacoes_tipos
SET
  categoria  = 'Treinamento de Doutrinação',
  updated_at = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_MGM'
  AND deleted_at IS NULL;

-- 17. MNT_SGSO (id=135) → Treinamento Técnico Especializado
UPDATE qualificacoes_tipos
SET
  categoria  = 'Treinamento Técnico Especializado',
  updated_at = datetime('now')
WHERE empresa_id = 6
  AND codigo = 'MNT_SGSO'
  AND deleted_at IS NULL;

-- ============================================================
-- PENDENTE REVISÃO MANUAL (não atualizar agora)
-- ============================================================
-- MNT_INGLES_TECNICO (id=138): categoria "PROFICIENCIA/TECNICO" não mapeia
--   diretamente a nenhuma categoria canônica do PRG-MNT-002.
--   Ação: revisar manualmente e definir nova categoria ou manter atual.

-- ============================================================
-- AUSENTES NO BANCO (precisam ser criados, não são UPDATEs):
-- • MNT_IIO_PILOTOS     — Inspeção IIO por Pilotos (inicial=2h, recorrente=1h)
-- • MNT_ELEVACAO_MECANICO_INSPETOR — Elevação Mecânico→Inspetor (inicial=16h)
-- • MNT_ELEVACAO_AUXILIAR_MECANICO — Elevação Auxiliar→Mecânico (inicial=16h)
-- ============================================================

-- Verificação pós-update (executar para confirmar):
-- SELECT id, codigo, nome, categoria, carga_horaria, carga_horaria_inicial,
--        carga_horaria_recorrente,
--        CASE WHEN conteudo_programatico IS NULL THEN 'VAZIO' ELSE 'PREENCHIDO' END AS cp_status
-- FROM qualificacoes_tipos
-- WHERE empresa_id = 6 AND codigo LIKE 'MNT_%' AND deleted_at IS NULL
-- ORDER BY codigo;
