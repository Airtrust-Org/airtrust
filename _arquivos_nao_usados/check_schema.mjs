import Database from 'better-sqlite3';

const db = new Database('.wrangler/state/v3/d1/db.sqlite');

// Obter schema da tabela
const schema = db.prepare(`
  SELECT sql FROM sqlite_master 
  WHERE type='table' AND name='qualificacoes_tipos'
`).all();

console.log('📋 Schema da tabela qualificacoes_tipos:');
schema.forEach(row => {
  console.log(row.sql);
});

// Listar colunas
const columns = db.prepare(`
  PRAGMA table_info(qualificacoes_tipos)
`).all();

console.log('\n📊 Colunas da tabela:');
columns.forEach(col => {
  console.log(`- ${col.name} (${col.type})`);
});

db.close();
