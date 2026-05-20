// Script de backup automático local - CommonJS
const fs = require('fs');
const path = require('path');
const https = require('http');

const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 10;

// Criar pasta de backups se não existir
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log('📁 Pasta de backups criada:', BACKUP_DIR);
}

// Função para fazer requisição HTTP
function httpRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Função para fazer backup
async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-local-${timestamp}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  console.log('🔄 Iniciando backup...');

  try {
    // Fazer requisição para endpoint de backup
    const data = await httpRequest('http://localhost:8787/api/v2/backup/export-all');

    // Salvar arquivo
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

    console.log(`✅ Backup criado: ${filename}`);
    console.log(`📊 Total de registros: ${data.total_records || 0}`);

    // Limpar backups antigos
    cleanOldBackups();
  } catch (error) {
    console.error('❌ Erro ao criar backup:', error.message);
  }
}

// Limpar backups antigos (manter apenas últimos 10)
function cleanOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-local-'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  // Remover backups excedentes
  files.slice(MAX_BACKUPS).forEach(file => {
    fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    console.log(`🗑️  Backup antigo removido: ${file.name}`);
  });
}

// Executar backup
backupDatabase();

// Se executado como watch, fazer backup a cada hora
if (process.argv.includes('--watch')) {
  console.log('👁️  Modo watch ativado - backup a cada 1 hora');
  setInterval(backupDatabase, 60 * 60 * 1000); // 1 hora
}
