#!/usr/bin/env python3
"""Disposable SQLite proof of the 0546 0457 category trigger and tenant isolation."""
from pathlib import Path
from collections import Counter
import re, sqlite3
root=Path(__file__).resolve().parents[2]
sql=(root/"worker-airtrust/schema-v2/changes/0546_training_compliance_canonical_category_repair.sql").read_text()
pairs=re.findall(r"\('([^']+)','([^']+)'\)", sql)
expected={"NR-11":2,"NR-12":2,"NR-20":4,"NR-26":18,"NR-35":2,"FOD":20,"PPSP":20}
assert dict(Counter(c for c,_ in pairs))==expected
d=sqlite3.connect(":memory:")
d.executescript("""
CREATE TABLE qualificacoes_categorias (
 id INTEGER PRIMARY KEY,empresa_id INTEGER,nome TEXT,codigo TEXT,cor TEXT,
 descricao TEXT,ativo INTEGER,dominio_codigo TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT);
CREATE TABLE qualificacoes_tipos (
 id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT,
 categoria TEXT,categoria_id INTEGER,validade INTEGER,carga_horaria INTEGER,
 carga_horaria_inicial INTEGER,carga_horaria_recorrente INTEGER,observacoes TEXT,updated_at TEXT);
CREATE TABLE funcoes (id INTEGER PRIMARY KEY,empresa_id INTEGER,nome TEXT,ativo INTEGER,deleted_at TEXT);
CREATE TABLE compliance_condicoes (id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
CREATE TABLE treinamento_requisitos (
 id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER,escopo TEXT,
 funcao_id INTEGER,obrigatoriedade TEXT,critico_operacional INTEGER,origem TEXT,
 referencia_normativa TEXT,justificativa TEXT,modalidade_requerida TEXT,condicao_id INTEGER,
 fundamento_tipo TEXT,fundamento_documento TEXT,validade_fonte TEXT,auto_matricular_ead INTEGER,
 ativo INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
INSERT INTO qualificacoes_categorias (id,empresa_id,nome,codigo,ativo)
 VALUES (13,6,'EAD','EAD',1),(17,7,'EAD','EAD',1);
INSERT INTO compliance_condicoes (id,empresa_id,codigo,ativo)
 VALUES (1,6,'MEMBRO_CIPA',1),(7,7,'MEMBRO_CIPA',1);
CREATE TRIGGER trg_qualification_type_category_fk_update_0457
BEFORE UPDATE OF categoria_id,empresa_id,deleted_at ON qualificacoes_tipos
WHEN NEW.deleted_at IS NULL BEGIN
 SELECT CASE WHEN NEW.categoria_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias c
  WHERE c.id=NEW.categoria_id AND c.empresa_id=NEW.empresa_id
  AND c.ativo=1 AND c.deleted_at IS NULL
 ) THEN RAISE(ABORT,'QUALIFICATION_CATEGORY_INVALID') END;
END;
CREATE TRIGGER trg_qualification_type_category_fk_insert_0457
BEFORE INSERT ON qualificacoes_tipos
WHEN NEW.deleted_at IS NULL BEGIN
 SELECT CASE WHEN NEW.categoria_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias c
  WHERE c.id=NEW.categoria_id AND c.empresa_id=NEW.empresa_id
  AND c.ativo=1 AND c.deleted_at IS NULL
 ) THEN RAISE(ABORT,'QUALIFICATION_CATEGORY_INVALID') END;
END;
""")
codes=sorted(set(c for c,_ in pairs)|{"NR-05","REGRAS_OURO_PETROBRAS","FDM-MECANICO"})
names=sorted(set(n for _,n in pairs))
for i,code in enumerate(codes,1):
 d.execute("INSERT INTO qualificacoes_tipos (id,empresa_id,codigo,ativo,categoria,categoria_id,validade,carga_horaria) VALUES (?,6,?,1,'EAD',13,24,2)",(i,code))
for i,name in enumerate(names,1):
 d.execute("INSERT INTO funcoes (id,empresa_id,nome,ativo) VALUES (?,6,?,1)",(i,name))
ids={c:d.execute("SELECT id FROM qualificacoes_tipos WHERE codigo=? AND empresa_id=6",(c,)).fetchone()[0] for c in codes}
fn={n:d.execute("SELECT id FROM funcoes WHERE nome=? AND empresa_id=6",(n,)).fetchone()[0] for n in names}
for code in ("NR-05","REGRAS_OURO_PETROBRAS"):
 d.execute("INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,ativo) VALUES (6,?,'EMPRESA','OBRIGATORIA',1)",(ids[code],))
for code,name in pairs[:10]:
 d.execute("INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,ativo) VALUES (6,?,'FUNCAO',?,'OBRIGATORIA',1)",(ids[code],fn[name]))
d.execute("INSERT INTO qualificacoes_tipos (id,empresa_id,codigo,ativo,categoria,categoria_id) VALUES (1007,7,'NR-05',1,'EAD',17)")
d.execute("INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,ativo) VALUES (7,1007,'EMPRESA','OBRIGATORIA',1)")
d.commit()
# Prove the original 0545 category_id=NULL violates the real trigger contract.
try:
 d.execute("UPDATE qualificacoes_tipos SET categoria_id=NULL WHERE id=?",(ids["NR-05"],))
 raise AssertionError("0457_TRIGGER_EXPECTED")
except sqlite3.IntegrityError as ex:
 assert "QUALIFICATION_CATEGORY_INVALID" in str(ex)
d.rollback()
for run in (1,2):
 d.executescript(sql)
 cats=d.execute("SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO_GERAL' AND nome='Treinamento' AND ativo=1").fetchall()
 assert len(cats)==1,cats
 assert d.execute("SELECT categoria,categoria_id,validade,carga_horaria FROM qualificacoes_tipos WHERE id=?",(ids["NR-05"],)).fetchone()==("Treinamento",cats[0][0],None,None)
 assert d.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND ativo=1 AND condicao_id=1",(ids["NR-05"],)).fetchone()[0]==1
 assert d.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND ativo=1",(ids["NR-05"],)).fetchone()[0]==1
 assert d.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND ativo=1",(ids["REGRAS_OURO_PETROBRAS"],)).fetchone()[0]==0
 for code,count in expected.items():
  assert d.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND ativo=1 AND escopo='FUNCAO'",(ids[code],)).fetchone()[0]==count,(code,run)
 assert d.execute("SELECT categoria,categoria_id FROM qualificacoes_tipos WHERE id=1007").fetchone()==("EAD",17)
 assert d.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=7 AND ativo=1").fetchone()[0]==1
 assert d.execute("SELECT validade,carga_horaria FROM qualificacoes_tipos WHERE id=?",(ids["FDM-MECANICO"],)).fetchone()==(None,1)
print("TRAINING_COMPLIANCE_0546_SQLITE_TRIGGER_AND_TENANT_PASS")
