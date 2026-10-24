#!/usr/bin/env python3
"""Synthetic SQLite regression of Schema V2 0550. No production connectivity."""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / "worker-airtrust/schema-v2/changes/0550_usuarios_costa_do_sol_viewer_aluno.sql").read_text()

SCHEMA = """
CREATE TABLE usuarios(id INTEGER PRIMARY KEY, nome TEXT, perfil TEXT, deleted_at TEXT);
CREATE TABLE usuarios_empresas(usuario_id INTEGER, empresa_id INTEGER, role TEXT, PRIMARY KEY(usuario_id,empresa_id));
CREATE TABLE usuarios_empresas_perfis(
  usuario_id INTEGER, empresa_id INTEGER, perfil TEXT, ativo INTEGER,
  created_at TEXT, updated_at TEXT, UNIQUE(usuario_id,empresa_id,perfil));
CREATE TRIGGER trg_usuarios_empresas_profile_authority_role_update
AFTER UPDATE OF role ON usuarios_empresas
FOR EACH ROW
WHEN NEW.role IS NOT NULL AND TRIM(NEW.role) <> ''
BEGIN
  INSERT OR IGNORE INTO usuarios_empresas_perfis
  (usuario_id,empresa_id,perfil,ativo,created_at,updated_at)
  VALUES(NEW.usuario_id,NEW.empresa_id,NEW.role,1,datetime('now'),datetime('now'));
END;
"""

def seed(viewers=26, coordinators=1, privileged=False):
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    for i in range(1, viewers+1):
        db.execute("INSERT INTO usuarios VALUES(?,?,?,NULL)",(i,f"Pessoa {i}","ALUNO"))
        db.execute("INSERT INTO usuarios_empresas VALUES(?,6,'viewer')",(i,))
        db.execute("INSERT INTO usuarios_empresas_perfis VALUES(?,6,'viewer',1,NULL,NULL)",(i,))
    if privileged:
        db.execute("INSERT INTO usuarios_empresas_perfis VALUES(1,6,'GESTOR',1,NULL,NULL)")
    for j in range(coordinators):
        uid=100+j
        db.execute("INSERT INTO usuarios VALUES(?,?,?,NULL)",(uid,f"Coordenação {j}","USUARIO"))
        db.execute("INSERT INTO usuarios_empresas VALUES(?,6,'user')",(uid,))
        db.execute("INSERT INTO usuarios_empresas_perfis VALUES(?,6,'COORDENACAO_VOO',1,NULL,NULL)",(uid,))
        db.execute("INSERT INTO usuarios_empresas_perfis VALUES(?,6,'user',1,NULL,NULL)",(uid,))
    db.execute("INSERT INTO usuarios VALUES(900,'Admin','ADMINISTRADOR',NULL)")
    db.execute("INSERT INTO usuarios_empresas VALUES(900,6,'admin')")
    db.execute("INSERT INTO usuarios VALUES(901,'Other Tenant','ALUNO',NULL)")
    db.execute("INSERT INTO usuarios_empresas VALUES(901,7,'viewer')")
    db.execute("INSERT INTO usuarios_empresas_perfis VALUES(901,7,'viewer',1,NULL,NULL)")
    db.commit()
    return db

def count(db, sql):
    return db.execute(sql).fetchone()[0]

def positive():
    db=seed()
    db.executescript(SQL)
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='student'")==26
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='viewer'")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='user'")==0
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=7 AND role='viewer'")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='admin'")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE empresa_id=6 AND perfil='viewer' AND ativo=0")==26
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE empresa_id=6 AND perfil='student' AND ativo=1")==26
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE empresa_id=6 AND perfil='COORDENACAO_VOO' AND ativo=1")==1
    assert count(db,"SELECT COUNT(*) FROM sqlite_temp_master WHERE name LIKE '_viewer_aluno_0550_%'")==0

def should_abort(viewers, coordinators, privileged):
    db=seed(viewers=viewers,coordinators=coordinators,privileged=privileged)
    try:
        db.executescript(SQL)
    except (sqlite3.IntegrityError, sqlite3.OperationalError):
        pass
    else:
        raise AssertionError(f"Guard should abort: viewers={viewers}, coordinators={coordinators}, privileged={privileged}")
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='student'")==0
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='viewer'")==viewers
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=7 AND role='viewer'")==1

if __name__ == "__main__":
    positive()
    for args in [(25,1,False),(27,1,False),(26,0,False),(26,2,False),(26,1,True)]:
        should_abort(*args)
    print("PASS schema-v2-0550: positive + five fail-closed cases")
