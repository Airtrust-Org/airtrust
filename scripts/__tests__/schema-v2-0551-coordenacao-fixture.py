#!/usr/bin/env python3
"""Schema V2 0551 regression: one USER coordination, 26 STUDENT unchanged."""
import sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SQL=(ROOT/'worker-airtrust/schema-v2/changes/0551_coordenacao_role_user_restore.sql').read_text()
DDL="""CREATE TABLE usuarios(id INTEGER PRIMARY KEY,nome TEXT,perfil TEXT,deleted_at TEXT);
CREATE TABLE usuarios_empresas(usuario_id INTEGER,empresa_id INTEGER,role TEXT,PRIMARY KEY(usuario_id,empresa_id));
CREATE TABLE usuarios_empresas_perfis(usuario_id INTEGER,empresa_id INTEGER,perfil TEXT,ativo INTEGER,created_at TEXT,updated_at TEXT,UNIQUE(usuario_id,empresa_id,perfil));
CREATE TABLE airtrust_schema_changes_v2(change_id TEXT);
INSERT INTO airtrust_schema_changes_v2 VALUES('usuarios-costa-do-sol-viewer-aluno-0550');"""
def seed(students=26,extra_viewer=False,missing_coord=False,already_user=False,missing_0550=False):
    db=sqlite3.connect(':memory:');db.executescript(DDL)
    for i in range(1,students+1):
        db.execute("INSERT INTO usuarios VALUES(?,?,?,NULL)",(i,'Aluno '+str(i),'ALUNO'))
        db.execute("INSERT INTO usuarios_empresas VALUES(?,6,'student')",(i,))
        db.execute("INSERT INTO usuarios_empresas_perfis VALUES(?,6,'viewer',0,NULL,NULL)",(i,))
        db.execute("INSERT INTO usuarios_empresas_perfis VALUES(?,6,'student',1,NULL,NULL)",(i,))
    db.execute("INSERT INTO usuarios VALUES(500,'Coordenação','USUARIO',NULL)")
    db.execute("INSERT INTO usuarios_empresas VALUES(500,6,?)",('user' if already_user else 'viewer',))
    if not missing_coord:
        db.execute("INSERT INTO usuarios_empresas_perfis VALUES(500,6,'COORDENACAO_VOO',1,NULL,NULL)")
    db.execute("INSERT INTO usuarios_empresas_perfis VALUES(500,6,'viewer',1,NULL,NULL)")
    db.execute("INSERT INTO usuarios_empresas_perfis VALUES(500,6,'user',1,NULL,NULL)")
    db.execute("INSERT INTO usuarios VALUES(600,'Outro tenant','ALUNO',NULL)")
    db.execute("INSERT INTO usuarios_empresas VALUES(600,9,'viewer')")
    db.execute("INSERT INTO usuarios VALUES(700,'Administrador','ADMINISTRADOR',NULL)")
    db.execute("INSERT INTO usuarios_empresas VALUES(700,6,'admin')")
    if extra_viewer:
        db.execute("INSERT INTO usuarios VALUES(800,'Aluno Extra','ALUNO',NULL)")
        db.execute("INSERT INTO usuarios_empresas VALUES(800,6,'viewer')")
    if missing_0550:db.execute('DELETE FROM airtrust_schema_changes_v2')
    db.commit();return db
def count(db,q):return db.execute(q).fetchone()[0]
def positive():
    db=seed();db.executescript(SQL)
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='user'")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='viewer'")==0
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='student'")==26
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=9 AND role='viewer'")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE empresa_id=6 AND role='admin'")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE usuario_id=500 AND perfil='COORDENACAO_VOO' AND ativo=1")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE usuario_id=500 AND perfil='viewer' AND ativo=0")==1
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas_perfis WHERE usuario_id=500 AND perfil='user' AND ativo=1")==1
def fail_closed(**kw):
    db=seed(**kw)
    try:db.executescript(SQL)
    except (sqlite3.OperationalError,sqlite3.IntegrityError):pass
    else:raise AssertionError('guard did not abort: '+str(kw))
    assert count(db,"SELECT COUNT(*) FROM usuarios_empresas WHERE usuario_id=500 AND empresa_id=6 AND role='viewer'")==int(not kw.get('already_user',False))
if __name__=='__main__':
    positive()
    for kw in [{'students':25},{'students':27},{'extra_viewer':True},{'missing_coord':True},{'already_user':True},{'missing_0550':True}]:
        fail_closed(**kw)
    print('PASS 0551: coordination restored; 26 students unaffected; six fail-closed cases')
