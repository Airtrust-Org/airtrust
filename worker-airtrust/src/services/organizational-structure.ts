export type CanonicalSector = { id: number; nome: string };
export type CanonicalFunction = { id: number; nome: string };

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
    .bind(name)
    .first<{ ok: number }>();
  return row?.ok === 1;
}

export async function resolveCanonicalSector(
  db: D1Database,
  empresaId: number,
  input: { setorId?: unknown; setorText?: unknown },
): Promise<CanonicalSector | null> {
  const explicitId = Number(input.setorId || 0);
  if (Number.isInteger(explicitId) && explicitId > 0) {
    return (
      (await db
        .prepare(
          `SELECT id,nome FROM setores
            WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
            LIMIT 1`,
        )
        .bind(explicitId, empresaId)
        .first<CanonicalSector>()) || null
    );
  }

  const text = String(input.setorText || '').trim();
  if (!text) return null;
  const direct = await db
    .prepare(
      `SELECT id,nome FROM setores
        WHERE empresa_id=? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
          AND (LOWER(TRIM(nome))=LOWER(TRIM(?)) OR LOWER(TRIM(COALESCE(codigo,'')))=LOWER(TRIM(?)))
        LIMIT 1`,
    )
    .bind(empresaId, text, text)
    .first<CanonicalSector>();
  if (direct) return direct;

  if (!(await tableExists(db, 'setores_aliases'))) return null;
  return (
    (await db
      .prepare(
        `SELECT s.id,s.nome
           FROM setores_aliases a
           JOIN setores s ON s.id=a.setor_id AND s.empresa_id=a.empresa_id
          WHERE a.empresa_id=? AND a.deleted_at IS NULL AND COALESCE(a.ativo,1)=1
            AND s.deleted_at IS NULL AND COALESCE(s.ativo,1)=1
            AND LOWER(TRIM(a.alias))=LOWER(TRIM(?))
          LIMIT 1`,
      )
      .bind(empresaId, text)
      .first<CanonicalSector>()) || null
  );
}

export async function resolveCanonicalFunction(
  db: D1Database,
  empresaId: number,
  input: { funcaoId?: unknown; funcaoText?: unknown; cargoText?: unknown },
): Promise<CanonicalFunction | null> {
  const explicitId = Number(input.funcaoId || 0);
  if (Number.isInteger(explicitId) && explicitId > 0) {
    return (
      (await db
        .prepare(
          `SELECT id,nome FROM funcoes
            WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
            LIMIT 1`,
        )
        .bind(explicitId, empresaId)
        .first<CanonicalFunction>()) || null
    );
  }

  const funcaoText = String(input.funcaoText || '').trim();
  const cargoText = String(input.cargoText || '').trim();
  const candidates = [...new Set([cargoText, funcaoText].filter(Boolean))];

  if (candidates.length > 0 && (await tableExists(db, 'funcoes_aliases'))) {
    for (const candidate of candidates) {
      const alias = await db
        .prepare(
          `SELECT f.id,f.nome
             FROM funcoes_aliases a
             JOIN funcoes f ON f.id=a.funcao_id AND f.empresa_id=a.empresa_id
            WHERE a.empresa_id=? AND a.deleted_at IS NULL AND COALESCE(a.ativo,1)=1
              AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
              AND LOWER(TRIM(a.alias))=LOWER(TRIM(?))
            LIMIT 1`,
        )
        .bind(empresaId, candidate)
        .first<CanonicalFunction>();
      if (alias) return alias;
    }
  }

  const directCandidates = funcaoText ? [funcaoText] : cargoText ? [cargoText] : [];
  for (const candidate of directCandidates) {
    const direct = await db
      .prepare(
        `SELECT id,nome FROM funcoes
          WHERE empresa_id=? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
            AND (LOWER(TRIM(nome))=LOWER(TRIM(?)) OR LOWER(TRIM(codigo))=LOWER(TRIM(?)))
          LIMIT 1`,
      )
      .bind(empresaId, candidate, candidate)
      .first<CanonicalFunction>();
    if (direct) return direct;
  }
  return null;
}

export async function tenantHasCanonicalSectorFunctionMap(
  db: D1Database,
  empresaId: number,
): Promise<boolean> {
  if (!(await tableExists(db, 'setores_funcoes'))) return false;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM setores_funcoes
        WHERE empresa_id=? AND deleted_at IS NULL AND COALESCE(ativo,1)=1`,
    )
    .bind(empresaId)
    .first<{ total: number }>();
  return Number(row?.total || 0) > 0;
}

export async function isCanonicalSectorFunctionPair(
  db: D1Database,
  empresaId: number,
  setorId: number | null,
  funcaoId: number | null,
): Promise<boolean> {
  if (!setorId || !funcaoId) return true;
  if (!(await tenantHasCanonicalSectorFunctionMap(db, empresaId))) return true;
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM setores_funcoes
        WHERE empresa_id=? AND setor_id=? AND funcao_id=?
          AND deleted_at IS NULL AND COALESCE(ativo,1)=1
        LIMIT 1`,
    )
    .bind(empresaId, setorId, funcaoId)
    .first<{ ok: number }>();
  return row?.ok === 1;
}
