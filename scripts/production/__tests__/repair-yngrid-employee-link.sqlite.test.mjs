import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(new URL('../../../worker-airtrust/src/services/usuario-funcionario-atomic-link.ts', import.meta.url), 'utf8');
function extractSql(name) {
  const tick=String.fromCharCode(96);
  const re = new RegExp('export const ' + name + ' = ' + tick + '([\\s\\S]*?)' + tick + ';');
  const found = source.match(re);
  assert.ok(found, name + ' SQL not found');
  return found[1];
}
const updateSql = extractSql('LINK_USER_EMPLOYEE_CAS_SQL');
const auditSql = extractSql('LINK_USER_EMPLOYEE_AUDIT_SQL');
const eligibilitySql = updateSql.replace(
  /^\s*UPDATE usuarios\s+SET funcionario_id = \?, updated_at = datetime\('now'\)\s+WHERE\s+/i,
  'SELECT COUNT(*) AS n FROM usuarios WHERE ',
);
assert.match(eligibilitySql, /^SELECT COUNT\(\*\) AS n FROM usuarios WHERE /);

function scenario(opts = {}) {
  const memberships = opts.memberships || [6];
  const db = new DatabaseSync(':memory:');
  db.exec([
    'CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, perfil TEXT, funcionario_id INTEGER, active INTEGER, deleted_at TEXT, updated_at TEXT);',
    'CREATE TABLE usuarios_empresas (usuario_id INTEGER, empresa_id INTEGER, role TEXT);',
    'CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, email TEXT, status TEXT, ativo INTEGER, deleted_at TEXT);',
    'CREATE TABLE audit_logs (empresa_id INTEGER, usuario_id INTEGER, acao TEXT, tabela TEXT, registro_id TEXT, detalhes TEXT, created_at TEXT);',
  ].join('\n'));
  db.prepare('INSERT INTO usuarios(id,nome,email,perfil,funcionario_id,active) VALUES(71,?,?,?,?,1)')
    .run('Yngrid Teste','yn@example.invalid',opts.userProfile || 'ADMIN',opts.accountEmployee ?? null);
  for (const id of memberships) db.prepare('INSERT INTO usuarios_empresas VALUES(71,?,?)')
    .run(id,opts.tenantRole || 'ADMIN');
  db.prepare('INSERT INTO funcionarios VALUES(81,6,?,?,?,?,NULL)')
    .run('Yngrid Teste',opts.employeeEmail || 'yn@example.invalid','ATIVO',opts.employeeActive ?? 1);
  if (opts.otherLinked) db.exec("INSERT INTO usuarios(id,nome,email,perfil,funcionario_id,active) VALUES(72,'Other','other@example.invalid','ALUNO',81,1)");
  return db;
}
function eligible(db) { return db.prepare(eligibilitySql).get(71,6,81,6,81).n; }
function cas(db) {
  const update = db.prepare(updateSql).run(81,71,6,81,6,81);
  const audit = db.prepare(auditSql).run(6,2,71,'{"scope":"one_link"}');
  return { changed: update.changes, audited: audit.changes };
}
test('atomic CAS writes one link and one audit, and cannot replay', () => {
  const db=scenario();
  assert.equal(eligible(db),1);
  assert.deepEqual(cas(db),{changed:1,audited:1});
  assert.equal(db.prepare('SELECT funcionario_id FROM usuarios WHERE id=71').get().funcionario_id,81);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1);
  assert.deepEqual(cas(db),{changed:0,audited:0});
  db.close();
});
test('global second tenant prevents change even if tenant 6 is valid', () => {
  const db=scenario({memberships:[6,7]});
  assert.equal(eligible(db),0);
  assert.deepEqual(cas(db),{changed:0,audited:0});
  db.close();
});
test('concurrent change after eligibility cannot be overwritten', () => {
  const db=scenario();
  assert.equal(eligible(db),1);
  db.prepare('UPDATE usuarios SET funcionario_id=99 WHERE id=71').run();
  assert.deepEqual(cas(db),{changed:0,audited:0});
  assert.equal(db.prepare('SELECT funcionario_id FROM usuarios WHERE id=71').get().funcionario_id,99);
  db.close();
});
test('tenant mismatch, inactive employee, email drift, role drift and link reuse all fail closed', () => {
  for (const opts of [
    {memberships:[7]}, {employeeActive:0}, {employeeEmail:'different@example.invalid'},
    {otherLinked:true}, {accountEmployee:99}, {userProfile:'GESTOR'}, {tenantRole:'GESTOR'},
  ]) {
    const db=scenario(opts);
    assert.equal(eligible(db),0,JSON.stringify(opts));
    assert.deepEqual(cas(db),{changed:0,audited:0},JSON.stringify(opts));
    db.close();
  }
});
