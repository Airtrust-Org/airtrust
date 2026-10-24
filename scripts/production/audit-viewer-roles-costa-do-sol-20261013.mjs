#!/usr/bin/env node
/**
 * Auditoria SOMENTE LEITURA dos papéis de tenant Costa do Sol (empresa_id=6).
 *
 * Nenhum SQL de escrita, identificador de usuário, e-mail ou nome pessoal
 * é coletado/registrado. O operador revisa as contagens antes de criar
 * qualquer mudança governada de dados em Schema V2.
 */
import { spawnSync } from 'node:child_process';

const DB = 'airtrust-db';
const TENANT_ID = 6;
const SQL = Object.freeze({
  tenant: "SELECT id, codigo, nome FROM empresas WHERE id = 6 AND deleted_at IS NULL",
  roles: `SELECT LOWER(TRIM(ue.role)) AS role, COUNT(*) AS total
    FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
    WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
    GROUP BY LOWER(TRIM(ue.role)) ORDER BY role`,
  viewers: `WITH viewers AS (
    SELECT ue.usuario_id, UPPER(TRIM(COALESCE(u.perfil,''))) AS user_profile,
      CASE WHEN LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%' THEN 1 ELSE 0 END AS coordination_name,
      CASE WHEN EXISTS (
        SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
          AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO' AND p.ativo=1
      ) THEN 1 ELSE 0 END AS coordination_profile,
      CASE WHEN EXISTS (SELECT 1 FROM usuarios_empresas other
        WHERE other.usuario_id=ue.usuario_id AND other.empresa_id<>ue.empresa_id)
      THEN 1 ELSE 0 END AS multi_tenant,
      CASE WHEN EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
          AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN ('ADMIN','ADMINISTRADOR','GESTOR','MANAGER','INSTRUTOR','INSTRUCTOR'))
      THEN 1 ELSE 0 END AS privileged_explicit,
      CASE WHEN EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
          AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN ('ALUNO','STUDENT'))
      THEN 1 ELSE 0 END AS existing_student,
      CASE WHEN EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
          AND p.ativo=1 AND UPPER(TRIM(p.perfil)) IN ('VIEWER','VISUALIZADOR','USUARIO','USER'))
      THEN 1 ELSE 0 END AS existing_viewer
    FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
    WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
      AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
  )
  SELECT COUNT(*) AS total_viewers,
    COALESCE(SUM(coordination_name),0) AS coordination_name_matches,
    COALESCE(SUM(coordination_profile),0) AS coordination_profile_matches,
    COALESCE(SUM(CASE WHEN coordination_name=1 OR coordination_profile=1 THEN 1 ELSE 0 END),0) AS exempt_union,
    COALESCE(SUM(CASE WHEN coordination_name=0 AND coordination_profile=0 THEN 1 ELSE 0 END),0) AS candidates,
    COALESCE(SUM(multi_tenant),0) AS multi_tenant,
    COALESCE(SUM(privileged_explicit),0) AS privileged_explicit,
    COALESCE(SUM(existing_student),0) AS existing_student,
    COALESCE(SUM(existing_viewer),0) AS existing_viewer
  FROM viewers`,
  coordinator: `SELECT LOWER(TRIM(ue.role)) AS role,
      UPPER(TRIM(COALESCE(u.perfil,''))) AS legacy_perfil,
      COUNT(*) AS total,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%' THEN 1 ELSE 0 END) AS name_matches,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
          AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO' AND p.ativo=1)
      THEN 1 ELSE 0 END) AS technical_profile_matches,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM usuarios_empresas_perfis p
        WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
          AND UPPER(TRIM(p.perfil)) IN ('VIEWER','VISUALIZADOR','USUARIO','USER') AND p.ativo=1)
      THEN 1 ELSE 0 END) AS active_readonly_profiles
    FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
    WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
      AND (
        LOWER(TRIM(COALESCE(u.nome,''))) LIKE '%coordena%'
        OR EXISTS (SELECT 1 FROM usuarios_empresas_perfis p
          WHERE p.usuario_id=ue.usuario_id AND p.empresa_id=ue.empresa_id
            AND UPPER(TRIM(p.perfil))='COORDENACAO_VOO' AND p.ativo=1)
      )
    GROUP BY LOWER(TRIM(ue.role)),UPPER(TRIM(COALESCE(u.perfil,''))) ORDER BY role`,
  profiles: `SELECT UPPER(TRIM(COALESCE(u.perfil,''))) AS perfil, COUNT(*) AS total
    FROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id
    WHERE ue.empresa_id=6 AND u.deleted_at IS NULL
      AND LOWER(TRIM(ue.role)) IN ('viewer','visualizador')
    GROUP BY UPPER(TRIM(COALESCE(u.perfil,''))) ORDER BY perfil`,
});

function readOnlyQuery(sql) {
  if (!/^SELECT\b|^WITH\b/i.test(sql.trim()) ||
      /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH)\b/i.test(sql)) {
    throw new Error('READ_ONLY_SQL_GUARD');
  }
  const p = spawnSync('wrangler', ['d1', 'execute', DB, '--remote', '--command', sql, '--json'], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1_000_000,
    env: process.env,
  });
  if (p.status !== 0) throw new Error('WRANGLER_READ_ONLY_AUDIT_FAILED');
  let data;
  try { data = JSON.parse(p.stdout); } catch { throw new Error('WRANGLER_JSON_INVALID'); }
  if (!Array.isArray(data) || data.some((r) => r.success !== true)) {
    throw new Error('D1_READ_ONLY_QUERY_FAILED');
  }
  return data.flatMap((r) => r.results || []);
}

const tenant = readOnlyQuery(SQL.tenant);
if (tenant.length !== 1 || Number(tenant[0].id) !== TENANT_ID ||
    !/costa do sol/i.test(String(tenant[0].nome))) {
  throw new Error('COSTA_DO_SOL_TENANT_MISMATCH');
}
const summary = {
  empresa_id: TENANT_ID,
  roles: readOnlyQuery(SQL.roles),
  viewers: readOnlyQuery(SQL.viewers)[0] || null,
  viewer_legacy_profile_distribution: readOnlyQuery(SQL.profiles),
  coordinator_roles: readOnlyQuery(SQL.coordinator),
};
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
