import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('worker-airtrust/src/routes/qualificacoes/tipos.ts', 'utf8');

test('GET /tipos starts independent RBAC/schema reads together before constructing scoped SQL', () => {
  const listingStart = source.indexOf(' * GET /tipos');
  const nextEndpoint = source.indexOf("router.get(", source.indexOf("return c.json({", listingStart) + 1);
  const listing = source.slice(listingStart, nextEndpoint > listingStart ? nextEndpoint : undefined);

  assert.match(
    listing,
    /const \[access, columnsSupport, hasQualificacoesTiposSetores\] = await Promise\.all\(\[\s*getEmployeeSectorAccess\(c, empresaId\),\s*loadQualificacoesTiposColumnsSupport\(db\),\s*hasQualificacoesTiposSetoresTable\(db\),\s*\]\)/,
  );
  assert.match(listing, /buildTipoSetorVisibilityClause\(\s*access,\s*hasQualificacoesTiposSetores/);
  assert.match(listing, /getTenantContext\(c\)/);
  assert.match(listing, /qt\.empresa_id = \?/);
  assert.match(listing, /resolveOperationalReadScope/);
  assert.match(listing, /appendOperationalReadFilter/);
});
