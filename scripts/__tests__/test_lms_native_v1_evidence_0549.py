"""Native V1 Schema V2 0549: synthetic, offline SQLite contract only."""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHANGE = ROOT / 'worker-airtrust/schema-v2/changes/0549_lms_native_v1_evidence.sql'


def db_fixture():
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript("""
      CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,tipo_conteudo TEXT NOT NULL,deleted_at TEXT);
      CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,curso_id INTEGER NOT NULL,deleted_at TEXT);
      CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,matricula_id INTEGER NOT NULL,empresa_id INTEGER NOT NULL,curso_id INTEGER NOT NULL,deleted_at TEXT,ciclo_atual INTEGER);
      INSERT INTO lms_cursos VALUES (10,6,'native',NULL),(11,7,'native',NULL),(12,6,'scorm',NULL);
      INSERT INTO lms_matriculas VALUES (100,6,10,NULL),(110,7,11,NULL);
      INSERT INTO lms_matricula_ciclos VALUES (1000,100,6,10,NULL,1),(1100,110,7,11,NULL,1);
    """)
    return db


def create_edition(db, company=6, course=10, prefix='lms/native/6/10/sha-abc/'):
    return db.execute("""INSERT INTO lms_native_edicoes
      (empresa_id,curso_id,artifact_sha256,package_version,r2_prefix)
      VALUES (?,?,?,?,?)""", (company,course,'a'*64,'n-'+'a'*32,prefix)).lastrowid


def publish(db, edition_id):
    db.execute("UPDATE lms_native_edicoes SET status='REVIEWED',reviewed_at=datetime('now') WHERE id=?",(edition_id,))
    db.execute("UPDATE lms_native_edicoes SET status='PUBLISHED',published_at=datetime('now') WHERE id=?",(edition_id,))


def bind(db, edition_id, company=6, course=10, enrollment=100, cycle=1000):
    return db.execute("""INSERT INTO lms_native_matricula_edicoes
      (empresa_id,curso_id,matricula_id,ciclo_id,edicao_id) VALUES (?,?,?,?,?)""",
      (company,course,enrollment,cycle,edition_id)).lastrowid


class Native0549Tests(unittest.TestCase):
    def setUp(self):
        self.db = db_fixture()
        self.db.executescript(CHANGE.read_text(encoding='utf-8'))

    def tearDown(self):
        self.db.close()

    def test_additive_no_legacy_data_changed(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lms_matriculas').fetchone()[0],2)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lms_cursos').fetchone()[0],3)
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'lms_native_%'"
        ).fetchone()[0],4)

    def test_repeated_apply_rejected(self):
        with self.assertRaises(sqlite3.OperationalError):
            self.db.executescript(CHANGE.read_text(encoding='utf-8'))

    def test_fail_closed_wrong_tenant_or_scorm_or_r2_scope(self):
        for opts in [
            {'course':12, 'prefix':'lms/native/6/12/version/'},
            {'company':7},
            {'prefix':'lms/native/7/10/version/'},
            {'prefix':'lms/native/6/10/../../other/'},
            {'prefix':'lms/native/6/10/secret\\asset/'},
        ]:
            with self.subTest(opts=opts), self.assertRaises(sqlite3.IntegrityError):
                create_edition(self.db,**opts)

    def test_edition_review_and_immutability(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO lms_native_edicoes
               (empresa_id,curso_id,artifact_sha256,package_version,r2_prefix,status)
               VALUES (6,10,?,?,?,'PUBLISHED')""",('a'*64,'n-abc','lms/native/6/10/sha-abc/'))
        e=create_edition(self.db)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_native_edicoes SET status='PUBLISHED' WHERE id=?",(e,))
        publish(self.db,e)
        for field,value in [('artifact_sha256','b'*64),('reviewed_at','forged')]:
            with self.subTest(field=field),self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(f"UPDATE lms_native_edicoes SET {field}=? WHERE id=?",(value,e))
        self.db.execute("UPDATE lms_native_edicoes SET status='REVOKED' WHERE id=?",(e,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_native_edicoes SET status='PUBLISHED' WHERE id=?",(e,))

    def test_cycle_pin_and_tenant_link_fail_closed(self):
        e=create_edition(self.db)
        with self.assertRaises(sqlite3.IntegrityError): bind(self.db,e)
        publish(self.db,e)
        for opts in [{'company':7},{'course':11},{'cycle':1100},{'enrollment':110}]:
            with self.subTest(opts=opts),self.assertRaises(sqlite3.IntegrityError): bind(self.db,e,**opts)
        b=bind(self.db,e)
        with self.assertRaises(sqlite3.IntegrityError): bind(self.db,e)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('DELETE FROM lms_native_matricula_edicoes WHERE id=?',(b,))

    def test_event_sequence_and_replay_are_enforced_by_db(self):
        e=create_edition(self.db);publish(self.db,e);b=bind(self.db,e)
        statement="""INSERT INTO lms_native_eventos(vinculo_id,event_id,sequencia,unidade_id,payload_sha256)
          VALUES (?,?,?,?,?)"""
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(statement,(b,'e1',2,'slide1','a'*64))
        self.db.execute(statement,(b,'e1',1,'slide1','a'*64))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(statement,(b,'e1',2,'slide1','a'*64))
        self.db.execute(statement,(b,'e2',2,'slide2','a'*64))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(statement,(99999,'e3',1,'slide3','a'*64))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_native_eventos SET unidade_id='forged' WHERE id=1")

    def test_private_attempt_sequence_status_and_immutability(self):
        e=create_edition(self.db);publish(self.db,e);b=bind(self.db,e)
        statement="""INSERT INTO lms_native_tentativas(vinculo_id,tentativa_numero,answers_json,
          answers_sha256,policy,score_pct,assessment_satisfied) VALUES (?,?,?,?,?,?,?)"""
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(statement,(b,2,'[]','a'*64,'SCORED',100,1))
        self.db.execute(statement,(b,1,'[]','a'*64,'SCORED',0,0))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(statement,(b,2,'[]','a'*64,'FORMATIVE',80,1))
        self.db.execute(statement,(b,2,'[]','a'*64,'FORMATIVE',None,1))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM lms_native_tentativas WHERE id=1")
        self.assertEqual(self.db.execute('SELECT score_pct FROM lms_native_tentativas WHERE id=1').fetchone()[0],0)

    def test_edition_cannot_be_inserted_directly_as_reviewed_even_with_valid_timestamps(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO lms_native_edicoes
              (empresa_id,curso_id,artifact_sha256,package_version,r2_prefix,status,reviewed_at,published_at)
              VALUES (6,10,?,?,?,'PUBLISHED',datetime('now'),datetime('now'))""",
              ('a'*64,'n-'+'a'*32,'lms/native/6/10/version/'))


if __name__ == '__main__':
    unittest.main()
