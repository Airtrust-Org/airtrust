// source_reference: ephemeral AIRTRUST_ADMIN_EMAIL/AIRTRUST_ADMIN_PASSWORD supplied by operator
// operational_decision: generate local SQL text only; this helper never executes database commands
// dry_run_required: true; review generated SQL before any separately governed apply
// rollback_plan_required: discard generated SQL; no state is changed by this helper
// Local/admin helper: generate a bcrypt hash without storing or printing plaintext credentials.
import bcrypt from 'bcryptjs';

const email = String(process.env.AIRTRUST_ADMIN_EMAIL || '').trim();
const password = String(process.env.AIRTRUST_ADMIN_PASSWORD || '');

if (!email || !password) {
  console.error('Defina AIRTRUST_ADMIN_EMAIL e AIRTRUST_ADMIN_PASSWORD por ambiente efemero.');
  process.exit(2);
}

const sqlEmail = email.replaceAll("'", "''");
const hash = bcrypt.hashSync(password, 10);

console.log(`INSERT INTO usuarios (
  id, name, email, password_hash, perfil, active, created_at, updated_at
) VALUES (
  'admin-001',
  'Administrador',
  '${sqlEmail}',
  '${hash}',
  'ADMIN',
  1,
  datetime('now'),
  datetime('now')
) ON CONFLICT(email) DO NOTHING;`);
console.log('Hash gerado. A senha em texto claro nao foi impressa.');
