-- 0525_organizational_structure_pj_normalization.sql
-- Production-only organizational data normalization for 13 active Costa do Sol employee records.
-- source_reference: reviewed pre-load workbook dated 2026-09-28; PII remains outside the repository.
-- operational_decision: create missing canonical sectors/functions, wire sector-function pairs,
-- normalize the targeted employee records, and remove provisional TEMP-TRN matricula placeholders.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/organizational-structure-pj-normalization-0525.md

-- Missing canonical sectors represented in the reviewed source.
INSERT INTO setores (codigo,nome,descricao,ativo,empresa_id,created_at,updated_at)
SELECT 'DIRETORIA','Diretoria','Setor organizacional canônico',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM setores
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (UPPER(TRIM(codigo))='DIRETORIA' OR UPPER(TRIM(nome))=UPPER('Diretoria'))
);

INSERT INTO setores (codigo,nome,descricao,ativo,empresa_id,created_at,updated_at)
SELECT 'TI','TI','Setor organizacional canônico',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM setores
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (UPPER(TRIM(codigo))='TI' OR UPPER(TRIM(nome))='TI')
);

-- Source labels that already have an approved canonical sector.
INSERT INTO setores_aliases(empresa_id,alias,setor_id)
SELECT 6,'Financeiro',s.id
  FROM setores s
 WHERE s.empresa_id=6 AND s.deleted_at IS NULL AND COALESCE(s.ativo,1)=1
   AND (UPPER(TRIM(s.codigo))='CONTROLADORIA' OR UPPER(TRIM(s.nome))=UPPER('Controladoria'))
   AND NOT EXISTS (
     SELECT 1 FROM setores_aliases a
      WHERE a.empresa_id=6 AND a.deleted_at IS NULL AND COALESCE(a.ativo,1)=1
        AND LOWER(TRIM(a.alias))=LOWER(TRIM('Financeiro'))
   )
 ORDER BY s.id LIMIT 1;

INSERT INTO setores_aliases(empresa_id,alias,setor_id)
SELECT 6,'RH',s.id
  FROM setores s
 WHERE s.empresa_id=6 AND s.deleted_at IS NULL AND COALESCE(s.ativo,1)=1
   AND (UPPER(TRIM(s.codigo))='RH_CS' OR UPPER(TRIM(s.nome))=UPPER('Recursos Humanos'))
   AND NOT EXISTS (
     SELECT 1 FROM setores_aliases a
      WHERE a.empresa_id=6 AND a.deleted_at IS NULL AND COALESCE(a.ativo,1)=1
        AND LOWER(TRIM(a.alias))=LOWER(TRIM('RH'))
   )
 ORDER BY s.id LIMIT 1;

-- Missing canonical functions from the reviewed source.
WITH desired(codigo,nome,categoria) AS (VALUES
  ('ORG_DIR_FIN','Diretor Financeiro','DIRETORIA'),
  ('ORG_GER_QSMS','Gerente de QSMS','QSMS'),
  ('ORG_GER_MAN','Gerente de Manutenção','MANUTENCAO'),
  ('ORG_GER_TI','Gerente de TI','TI'),
  ('ORG_GER_EXEC','Gerente Executivo','DIRETORIA'),
  ('ORG_GER_SEG_OP','Gerente de Segurança Operacional','SEGURANCA_OPERACIONAL'),
  ('ORG_AN_QUAL_OPS','Analista de Qualidade em Operações','OPERACIONAL'),
  ('ORG_GER_FIN','Gerente Financeiro','CONTROLADORIA'),
  ('ORG_GER_RH','Gerente de Recursos Humanos','RH'),
  ('ORG_SUP_ENG','Supervisor de Engenharia','MANUTENCAO'),
  ('ORG_DIR_GERAL','Diretor Geral','DIRETORIA'),
  ('ORG_DIR_DEV_NEG','Diretor de Desenvolvimento e Novos Negócios','DIRETORIA'),
  ('ORG_FINANCEIRO','Financeiro','CONTROLADORIA')
)
INSERT INTO funcoes (codigo,nome,descricao,categoria,ativo,empresa_id,created_at,updated_at)
SELECT d.codigo,d.nome,'Função organizacional canônica',d.categoria,1,6,datetime('now'),datetime('now')
  FROM desired d
 WHERE NOT EXISTS (
   SELECT 1 FROM funcoes f
    WHERE f.empresa_id=6 AND f.deleted_at IS NULL
      AND (UPPER(TRIM(f.codigo))=UPPER(TRIM(d.codigo))
           OR UPPER(TRIM(f.nome))=UPPER(TRIM(d.nome)))
 );

-- Alternate labels seen in the reviewed source resolve to the selected canonical functions.
INSERT INTO funcoes_aliases(empresa_id,alias,funcao_id)
SELECT 6,'Diretor Administrativo e Financeiro',f.id
  FROM funcoes f
 WHERE f.empresa_id=6 AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
   AND (f.codigo='ORG_DIR_FIN' OR UPPER(TRIM(f.nome))=UPPER('Diretor Financeiro'))
   AND NOT EXISTS (
     SELECT 1 FROM funcoes_aliases a
      WHERE a.empresa_id=6 AND a.deleted_at IS NULL AND COALESCE(a.ativo,1)=1
        AND LOWER(TRIM(a.alias))=LOWER(TRIM('Diretor Administrativo e Financeiro'))
   )
 ORDER BY f.id LIMIT 1;

INSERT INTO funcoes_aliases(empresa_id,alias,funcao_id)
SELECT 6,'Analista de Qualidade e Operações',f.id
  FROM funcoes f
 WHERE f.empresa_id=6 AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
   AND (f.codigo='ORG_AN_QUAL_OPS' OR UPPER(TRIM(f.nome))=UPPER('Analista de Qualidade em Operações'))
   AND NOT EXISTS (
     SELECT 1 FROM funcoes_aliases a
      WHERE a.empresa_id=6 AND a.deleted_at IS NULL AND COALESCE(a.ativo,1)=1
        AND LOWER(TRIM(a.alias))=LOWER(TRIM('Analista de Qualidade e Operações'))
   )
 ORDER BY f.id LIMIT 1;

-- Canonical sector-function pairs.
WITH mapping(setor_codigo,setor_nome,funcao_codigo,funcao_nome) AS (VALUES
  ('DIRETORIA','Diretoria','ORG_DIR_FIN','Diretor Financeiro'),
  ('QSMS','QSMS','ORG_GER_QSMS','Gerente de QSMS'),
  ('MAN','Manutenção','ORG_GER_MAN','Gerente de Manutenção'),
  ('TI','TI','ORG_GER_TI','Gerente de TI'),
  ('DIRETORIA','Diretoria','ORG_GER_EXEC','Gerente Executivo'),
  ('SEGURANCA','Segurança Operacional','ORG_GER_SEG_OP','Gerente de Segurança Operacional'),
  ('OPERACOES_CS','Operações','ORG_AN_QUAL_OPS','Analista de Qualidade em Operações'),
  ('CONTROLADORIA','Controladoria','ORG_GER_FIN','Gerente Financeiro'),
  ('RH_CS','Recursos Humanos','ORG_GER_RH','Gerente de Recursos Humanos'),
  ('MAN','Manutenção','ORG_SUP_ENG','Supervisor de Engenharia'),
  ('DIRETORIA','Diretoria','ORG_DIR_GERAL','Diretor Geral'),
  ('DIRETORIA','Diretoria','ORG_DIR_DEV_NEG','Diretor de Desenvolvimento e Novos Negócios'),
  ('CONTROLADORIA','Controladoria','ORG_FINANCEIRO','Financeiro')
)
INSERT INTO setores_funcoes(empresa_id,setor_id,funcao_id,ativo,created_at,updated_at)
SELECT 6,s.id,f.id,1,datetime('now'),datetime('now')
  FROM mapping m
  JOIN setores s ON s.empresa_id=6 AND s.deleted_at IS NULL AND COALESCE(s.ativo,1)=1
                AND (UPPER(TRIM(s.codigo))=UPPER(TRIM(m.setor_codigo))
                     OR UPPER(TRIM(s.nome))=UPPER(TRIM(m.setor_nome)))
  JOIN funcoes f ON f.empresa_id=6 AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
                AND (UPPER(TRIM(f.codigo))=UPPER(TRIM(m.funcao_codigo))
                     OR UPPER(TRIM(f.nome))=UPPER(TRIM(m.funcao_nome)))
 WHERE NOT EXISTS (
   SELECT 1 FROM setores_funcoes sf
    WHERE sf.empresa_id=6 AND sf.setor_id=s.id AND sf.funcao_id=f.id
      AND sf.deleted_at IS NULL AND COALESCE(sf.ativo,1)=1
 );

-- Targeted active employee normalization. Numeric employee IDs are used so PII is not versioned.
WITH employee_map(funcionario_id,setor_codigo,setor_nome,funcao_codigo,funcao_nome) AS (VALUES
  (174,'DIRETORIA','Diretoria','ORG_DIR_FIN','Diretor Financeiro'),
  (175,'QSMS','QSMS','ORG_GER_QSMS','Gerente de QSMS'),
  (111,'MAN','Manutenção','ORG_GER_MAN','Gerente de Manutenção'),
  (177,'TI','TI','ORG_GER_TI','Gerente de TI'),
  (176,'DIRETORIA','Diretoria','ORG_GER_EXEC','Gerente Executivo'),
  (181,'SEGURANCA','Segurança Operacional','ORG_GER_SEG_OP','Gerente de Segurança Operacional'),
  (182,'OPERACOES_CS','Operações','ORG_AN_QUAL_OPS','Analista de Qualidade em Operações'),
  (185,'CONTROLADORIA','Controladoria','ORG_GER_FIN','Gerente Financeiro'),
  (186,'RH_CS','Recursos Humanos','ORG_GER_RH','Gerente de Recursos Humanos'),
  (118,'MAN','Manutenção','ORG_SUP_ENG','Supervisor de Engenharia'),
  (187,'DIRETORIA','Diretoria','ORG_DIR_GERAL','Diretor Geral'),
  (189,'DIRETORIA','Diretoria','ORG_DIR_DEV_NEG','Diretor de Desenvolvimento e Novos Negócios'),
  (191,'CONTROLADORIA','Controladoria','ORG_FINANCEIRO','Financeiro')
)
UPDATE funcionarios
   SET setor_id = (
         SELECT s.id
           FROM employee_map m
           JOIN setores s ON s.empresa_id=6 AND s.deleted_at IS NULL AND COALESCE(s.ativo,1)=1
                         AND (UPPER(TRIM(s.codigo))=UPPER(TRIM(m.setor_codigo))
                              OR UPPER(TRIM(s.nome))=UPPER(TRIM(m.setor_nome)))
          WHERE m.funcionario_id=funcionarios.id
          ORDER BY s.id LIMIT 1
       ),
       setor = (
         SELECT m.setor_nome FROM employee_map m WHERE m.funcionario_id=funcionarios.id
       ),
       funcao_id = (
         SELECT f.id
           FROM employee_map m
           JOIN funcoes f ON f.empresa_id=6 AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
                         AND (UPPER(TRIM(f.codigo))=UPPER(TRIM(m.funcao_codigo))
                              OR UPPER(TRIM(f.nome))=UPPER(TRIM(m.funcao_nome)))
          WHERE m.funcionario_id=funcionarios.id
          ORDER BY f.id LIMIT 1
       ),
       funcao = (
         SELECT m.funcao_nome FROM employee_map m WHERE m.funcionario_id=funcionarios.id
       ),
       cargo = (
         SELECT m.funcao_nome FROM employee_map m WHERE m.funcionario_id=funcionarios.id
       ),
       matricula = CASE
         WHEN UPPER(TRIM(COALESCE(matricula,''))) LIKE 'TEMP-TRN-%' THEN NULL
         ELSE matricula
       END,
       updated_at = datetime('now')
 WHERE empresa_id=6
   AND deleted_at IS NULL
   AND UPPER(COALESCE(status,'ATIVO'))='ATIVO'
   AND EXISTS (
     SELECT 1 FROM employee_map m WHERE m.funcionario_id=funcionarios.id
   );
