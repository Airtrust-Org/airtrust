-- Adds an informational-only cost-center reference to setores.
-- centro_custo does not participate in RBAC, tenant resolution, or setor
-- resolution — it is a display/reference field only (see setores.ts).
ALTER TABLE setores ADD COLUMN centro_custo TEXT;
