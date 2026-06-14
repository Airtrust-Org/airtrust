# ADR: AirTrust Regulated Records Core - Physical Design on Cloudflare D1/R2

## 1. Status and Scope

**Status:** Proposto

**Escopo:** desenho físico em Cloudflare D1/R2. This ADR defines the minimum D1/R2 data layer, integrity model, service boundaries, and future implementation gates for the AirTrust Regulated Records Core.

**Sem implementação:** no code, no migration, no endpoint, no frontend/backend change, no database write, no deploy, no commit.

**Não regulado ainda:** this ADR does not state that AirTrust, DB Digital/eDB, SDRMe, Controle de Voos/RDV, MRO, FRMS, or any future module is homologated, certified, approved, accepted, or authorized by ANAC.

The design is preparatory. ANAC does not generically homologate software; any future official use depends on acceptance/authorization by the regulated operator or OMA, by scope, fleet/aircraft, and record type.

## 2. Context

AirTrust is preparing for future regulated records related to:

- DB Digital/eDB on tablet/PED.
- SDRMe and digital maintenance records.
- Controle de Voos/RDV.
- Integration with FRMS, MRO, and SGSO.

The current regulatory dossier and reviews establish that AirTrust does not yet have a common regulated record foundation. MRO and Controle de Voos are prototypes with mock data. DB Digital/eDB does not exist. SDRMe does not exist. Records Core does not exist. FRMS is not an approved SGRF.

The Records Core is required before official DB Digital, SDRMe, or RDV because regulated records need horizontal guarantees that should not be reimplemented separately inside each module:

- deterministic canonical record representation;
- reproducible hashes;
- append-only audit ledger;
- correction by addendum, not destructive editing;
- immutable sealed data at the database layer;
- export packages with manifests;
- restore verification of hashes and chain integrity;
- future pluggable signatures.

Without this shared core, each module would interpret immutability, auditability, correction, export, and restore differently. That would create inconsistent evidence and make later authorization by operator/OMA weaker.

## 3. Main Architectural Decisions

1. **Use Cloudflare D1 as the primary transactional store.**
   D1 stores record metadata, canonical payloads, versions, hashes, audit events, and links. It is the transactional source for the Records Core minimum design.

2. **Use Cloudflare R2 for attachments and export packages.**
   R2 stores binary attachments, PDF renderings, ZIP export packages, signature blobs in a future phase, and manifests. D1 stores references and hashes, not large binary payloads.

3. **Use canonical JSON as the primary record.**
   The primary record is deterministic JSON, not a PDF. PDFs are human-readable renderings or exports generated from canonical data.

4. **Treat PDF as visualization/export only.**
   A PDF may be useful for inspection, printing, or fiscal packages, but it must never be the authoritative source for verification.

5. **Use versioned SHA-256 hashes.**
   SHA-256 is the initial hash algorithm. Every hash row records `hash_algorithm`, `canonicalization_version`, and `canonical_schema_version` so future algorithms or canonicalizers can coexist with historical records.

6. **Use addendum instead of destructive edits.**
   After a record is sealed, corrections are represented as new versions and audit events. A dedicated `regulated_addenda` table is intentionally postponed; the minimum core uses version reason metadata and links until the addendum model is approved.

7. **Use an append-only ledger.**
   `regulated_audit_events` is a new regulated ledger, not an extension of `audit_events_v2`. It must be hash-chained and protected against update/delete.

8. **Reinforce immutability with D1/SQLite triggers.**
   Application checks are necessary but insufficient. Sealed rows and ledger rows require database-level `BEFORE UPDATE` and `BEFORE DELETE` triggers using `RAISE(ABORT, ...)`.

9. **Keep signature provider pluggable.**
   This ADR does not choose ICP-Brasil, Gov.br, CANAC/password/MFA, or any other provider. The core prepares `record_hash` and metadata needed for a future signature layer.

10. **Keep offline outside the minimum core, but prepare by design.**
    Offline/tablet/PED synchronization, device registry, and offline signing are out of scope for the minimum core. The design still captures canonical versions, server timestamps, and idempotency concepts so future sync can attach safely.

## 4. Minimum Records Core Scope

The minimum physical core starts with five tables:

1. `regulated_records`
2. `regulated_record_versions`
3. `regulated_record_hashes`
4. `regulated_audit_events`
5. `regulated_record_links`

This is deliberately smaller than the conceptual complete Records Core. The goal is to create the smallest defensible foundation for canonical records, versions, hashes, ledger events, and cross-module traceability.

Deferred tables:

- `regulated_signatures`: deferred until signature policy is decided by record type and regulatory scope.
- `regulated_addenda`: deferred as a dedicated table; the minimum design supports addendum semantics through append-only versions and audit events.
- `regulated_exports`: deferred until export package format and fiscal scope are approved.
- `regulated_devices`: deferred until offline/tablet/PED architecture is selected.
- `regulated_sync_sessions`: deferred until offline synchronization rules are approved.
- `regulated_retention_policies`: deferred until retention requirements are confirmed per record type and operator/OMA scope.

## 5. Table Design

The SQL fragments below are **pseudocode / design, not migration**. They are intentionally illustrative and must not be copied into a migration without a separate implementation phase, local experimental validation, and migration governance approval.

### 5.1 `regulated_records`

**Purpose:** root entity for a future regulated record. It identifies the tenant, module, record type, source operational entity, current version, status, and high-level searchable metadata.

**Main columns:**

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `tenant_id TEXT NULL`
- `module TEXT NOT NULL`
- `record_type TEXT NOT NULL`
- `source_module TEXT NOT NULL`
- `source_entity_type TEXT NOT NULL`
- `source_entity_id TEXT NOT NULL`
- `regulatory_scope_id TEXT NULL`
- `status TEXT NOT NULL`
- `current_version_id TEXT NULL`
- `canonical_schema_version TEXT NOT NULL`
- `aircraft_id TEXT NULL`
- `aircraft_prefix TEXT NULL`
- `person_id TEXT NULL`
- `period_start TEXT NULL`
- `period_end TEXT NULL`
- `created_by INTEGER NOT NULL`
- `sealed_by INTEGER NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `sealed_at TEXT NULL`
- `deleted_at TEXT NULL`

**Keys:**

- Primary key: `id`.
- Logical FK: `empresa_id` references `empresas.id`.
- Logical FK: `current_version_id` references `regulated_record_versions.id`.

**Indexes:**

- `(empresa_id, record_type, status, created_at)`
- `(empresa_id, module, source_entity_type, source_entity_id)`
- `(empresa_id, aircraft_prefix, period_start)`
- `(empresa_id, person_id, period_start)`
- `(empresa_id, sealed_at)`

**Constraints:**

- `empresa_id` is mandatory for tenant isolation.
- `status` allowed values: `DRAFT`, `SEALED`, `SUPERSEDED`, `VOIDED_BY_ADDENDUM`.
- `deleted_at` must remain `NULL` for sealed records.
- Unique source identity per tenant should be enforced for official source rows: `(empresa_id, source_module, source_entity_type, source_entity_id)`.
- `canonical_schema_version` is mandatory from creation.

**Tenant relation:**

`empresa_id` is the enforceable AirTrust tenant boundary. `tenant_id` is optional and reserved for future external or regulatory scope identifiers. All reads and writes must filter by `empresa_id`.

**Status and deletion:**

Draft records may be abandoned only before sealing. Sealed records must not be soft-deleted. If a sealed record is wrong, it remains visible and a correction version/addendum is appended.

**Hash fields:**

Root records do not store hash material directly except optional denormalized current version pointers. Hashes are stored in `regulated_record_hashes`.

**Canonical schema version:**

`canonical_schema_version` defines which schema the current record type follows. It must match the version rows and hash rows.

```sql
-- Pseudocode / design, not migration.
CREATE TABLE regulated_records (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  module TEXT NOT NULL,
  record_type TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  regulatory_scope_id TEXT,
  status TEXT NOT NULL,
  current_version_id TEXT,
  canonical_schema_version TEXT NOT NULL,
  aircraft_id TEXT,
  aircraft_prefix TEXT,
  person_id TEXT,
  period_start TEXT,
  period_end TEXT,
  created_by INTEGER NOT NULL,
  sealed_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sealed_at TEXT,
  deleted_at TEXT,
  CHECK (status IN ('DRAFT', 'SEALED', 'SUPERSEDED', 'VOIDED_BY_ADDENDUM')),
  CHECK (status != 'SEALED' OR deleted_at IS NULL)
);
```

### 5.2 `regulated_record_versions`

**Purpose:** append-only canonical payload versions for each record. Version 1 is creation; later versions are reseals, imports, or addendum-style corrections.

**Main columns:**

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `tenant_id TEXT NULL`
- `record_id TEXT NOT NULL`
- `version_number INTEGER NOT NULL`
- `version_reason TEXT NOT NULL`
- `base_version_id TEXT NULL`
- `canonical_payload_json TEXT NOT NULL`
- `canonical_payload_size INTEGER NOT NULL`
- `canonical_schema_version TEXT NOT NULL`
- `canonicalization_version TEXT NOT NULL`
- `status TEXT NOT NULL`
- `created_by INTEGER NOT NULL`
- `created_at TEXT NOT NULL`
- `sealed_at TEXT NULL`
- `deleted_at TEXT NULL`

**Keys:**

- Primary key: `id`.
- Logical FK: `record_id` references `regulated_records.id`.
- Logical FK: `base_version_id` references `regulated_record_versions.id`.
- Unique: `(record_id, version_number)`.

**Indexes:**

- `(empresa_id, record_id, version_number)`
- `(empresa_id, canonical_schema_version, created_at)`
- `(empresa_id, status, created_at)`

**Constraints:**

- Version numbers must be positive.
- Canonical payload size must be positive.
- `empresa_id` must match the root record.
- `canonical_schema_version` and `canonicalization_version` are immutable after insertion.
- Once sealed, rows are append-only.

**Tenant relation:**

`empresa_id` is repeated intentionally so queries do not depend on joins for tenant isolation.

**Status and deletion:**

Versions may be `DRAFT` before seal and `SEALED` after hash/ledger completion. Sealed versions must not have `deleted_at`.

**Hash fields:**

Version rows do not store hashes; `regulated_record_hashes` stores payload and record hashes for each version.

**Canonical schema version:**

Each version carries its own `canonical_schema_version`. Historical versions must remain verifiable with the version they were sealed under.

```sql
-- Pseudocode / design, not migration.
CREATE TABLE regulated_record_versions (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  record_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  version_reason TEXT NOT NULL,
  base_version_id TEXT,
  canonical_payload_json TEXT NOT NULL,
  canonical_payload_size INTEGER NOT NULL,
  canonical_schema_version TEXT NOT NULL,
  canonicalization_version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  sealed_at TEXT,
  deleted_at TEXT,
  CHECK (version_number > 0),
  CHECK (canonical_payload_size > 0),
  CHECK (status IN ('DRAFT', 'SEALED')),
  CHECK (status != 'SEALED' OR deleted_at IS NULL),
  UNIQUE (record_id, version_number)
);
```

### 5.3 `regulated_record_hashes`

**Purpose:** store reproducible digests for payload, attachment manifest, record version, event chain position, and tenant chain continuity.

**Main columns:**

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `tenant_id TEXT NULL`
- `record_id TEXT NOT NULL`
- `version_id TEXT NOT NULL`
- `record_type TEXT NOT NULL`
- `hash_algorithm TEXT NOT NULL`
- `canonicalization_version TEXT NOT NULL`
- `canonical_schema_version TEXT NOT NULL`
- `payload_hash TEXT NOT NULL`
- `attachments_manifest_hash TEXT NULL`
- `record_hash TEXT NOT NULL`
- `previous_record_hash TEXT NULL`
- `previous_tenant_chain_hash TEXT NULL`
- `tenant_chain_hash TEXT NOT NULL`
- `chain_scope TEXT NOT NULL`
- `chain_sequence INTEGER NOT NULL`
- `computed_by INTEGER NOT NULL`
- `computed_at TEXT NOT NULL`

**Keys:**

- Primary key: `id`.
- Logical FK: `record_id` references `regulated_records.id`.
- Logical FK: `version_id` references `regulated_record_versions.id`.
- Unique: `(version_id, hash_algorithm, canonicalization_version)`.
- Unique chain position: `(empresa_id, chain_scope, chain_sequence)`.
- Unique chain hash: `(empresa_id, chain_scope, tenant_chain_hash)`.

**Indexes:**

- `(empresa_id, record_id, computed_at)`
- `(empresa_id, chain_scope, chain_sequence)`
- `(empresa_id, record_type, computed_at)`
- `(payload_hash)`
- `(record_hash)`

**Constraints:**

- `hash_algorithm` initially must be `SHA-256`.
- Hash fields must be lowercase hexadecimal strings of expected length for the algorithm.
- `chain_sequence` must be positive.
- `empresa_id` must match record and version.

**Tenant relation:**

The chain is scoped by `empresa_id` and `chain_scope`. Recommended initial `chain_scope` is `record_type`, producing one sequence per `(empresa_id, record_type)` instead of a single tenant-wide bottleneck.

**Status and deletion:**

Hash rows are append-only and never soft-deleted. Corrections generate new versions and new hash rows.

**Hash fields:**

- `payload_hash`: SHA-256 of canonical payload bytes.
- `attachments_manifest_hash`: SHA-256 of canonical attachment manifest, if any.
- `record_hash`: SHA-256 over canonical payload hash, manifest hash, record metadata, schema version, and canonicalization version.
- `tenant_chain_hash`: SHA-256 over previous chain hash plus current record hash and chain metadata.

**Canonical schema version:**

Repeated so a hash can be verified without trusting mutable joined state.

```sql
-- Pseudocode / design, not migration.
CREATE TABLE regulated_record_hashes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  record_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL,
  canonicalization_version TEXT NOT NULL,
  canonical_schema_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  attachments_manifest_hash TEXT,
  record_hash TEXT NOT NULL,
  previous_record_hash TEXT,
  previous_tenant_chain_hash TEXT,
  tenant_chain_hash TEXT NOT NULL,
  chain_scope TEXT NOT NULL,
  chain_sequence INTEGER NOT NULL,
  computed_by INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  CHECK (hash_algorithm IN ('SHA-256')),
  CHECK (chain_sequence > 0),
  UNIQUE (version_id, hash_algorithm, canonicalization_version),
  UNIQUE (empresa_id, chain_scope, chain_sequence),
  UNIQUE (empresa_id, chain_scope, tenant_chain_hash)
);
```

### 5.4 `regulated_audit_events`

**Purpose:** regulated append-only audit ledger. It records creation, sealing, hash computation, read/verify actions, blocked mutation attempts, links, future exports, and future signature events.

**Main columns:**

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `tenant_id TEXT NULL`
- `record_id TEXT NULL`
- `version_id TEXT NULL`
- `event_type TEXT NOT NULL`
- `event_category TEXT NOT NULL`
- `actor_user_id INTEGER NULL`
- `actor_funcionario_id INTEGER NULL`
- `actor_type TEXT NOT NULL`
- `actor_role TEXT NULL`
- `support_mode INTEGER NOT NULL DEFAULT 0`
- `request_id TEXT NULL`
- `idempotency_key TEXT NULL`
- `ip_hash TEXT NULL`
- `user_agent_hash TEXT NULL`
- `device_id TEXT NULL`
- `event_payload_json TEXT NOT NULL`
- `previous_event_hash TEXT NULL`
- `event_hash TEXT NOT NULL`
- `tenant_chain_hash TEXT NOT NULL`
- `chain_scope TEXT NOT NULL`
- `chain_sequence INTEGER NOT NULL`
- `canonical_schema_version TEXT NULL`
- `hash_algorithm TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `deleted_at TEXT NULL`

**Keys:**

- Primary key: `id`.
- Logical FK: `record_id` references `regulated_records.id`.
- Logical FK: `version_id` references `regulated_record_versions.id`.
- Unique: `(empresa_id, chain_scope, chain_sequence)`.
- Unique: `(empresa_id, chain_scope, event_hash)`.
- Optional unique idempotency: `(empresa_id, idempotency_key)` when provided.

**Indexes:**

- `(empresa_id, record_id, created_at)`
- `(empresa_id, event_type, created_at)`
- `(empresa_id, actor_user_id, created_at)`
- `(empresa_id, chain_scope, chain_sequence)`
- `(request_id)`

**Constraints:**

- `deleted_at` must always be `NULL`.
- `hash_algorithm` initially must be `SHA-256`.
- `event_payload_json` must be canonicalized by the ledger service before hashing.
- Update/delete is always blocked by trigger.

**Tenant relation:**

Every event is scoped by `empresa_id`, even support or fiscal events. Cross-tenant support must be represented as separate scoped events, not a tenantless write.

**Status and deletion:**

No soft delete. Audit events are permanent. Retention policy is future work; default is preserve, not delete.

**Hash fields:**

Each event has its own `event_hash`, points to `previous_event_hash`, and contributes to `tenant_chain_hash`.

**Canonical schema version:**

Event payloads can include `canonical_schema_version` when the event refers to a canonical record version.

```sql
-- Pseudocode / design, not migration.
CREATE TABLE regulated_audit_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  record_id TEXT,
  version_id TEXT,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_funcionario_id INTEGER,
  actor_type TEXT NOT NULL,
  actor_role TEXT,
  support_mode INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  idempotency_key TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  device_id TEXT,
  event_payload_json TEXT NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  tenant_chain_hash TEXT NOT NULL,
  chain_scope TEXT NOT NULL,
  chain_sequence INTEGER NOT NULL,
  canonical_schema_version TEXT,
  hash_algorithm TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (hash_algorithm IN ('SHA-256')),
  CHECK (deleted_at IS NULL),
  CHECK (chain_sequence > 0),
  UNIQUE (empresa_id, chain_scope, chain_sequence),
  UNIQUE (empresa_id, chain_scope, event_hash)
);
```

### 5.5 `regulated_record_links`

**Purpose:** link records across modules without making premature regulatory claims about precedence. Examples: RDV to eDB, eDB discrepancy to OS, OS to RAS, RDV/eDB to FRMS/SGSO references.

**Main columns:**

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `tenant_id TEXT NULL`
- `source_record_id TEXT NOT NULL`
- `target_record_id TEXT NOT NULL`
- `source_version_id TEXT NULL`
- `target_version_id TEXT NULL`
- `link_type TEXT NOT NULL`
- `link_reason TEXT NOT NULL`
- `link_status TEXT NOT NULL`
- `canonical_schema_version TEXT NOT NULL`
- `created_by INTEGER NOT NULL`
- `created_at TEXT NOT NULL`
- `deleted_at TEXT NULL`

**Keys:**

- Primary key: `id`.
- Logical FK: `source_record_id` references `regulated_records.id`.
- Logical FK: `target_record_id` references `regulated_records.id`.
- Unique: `(source_record_id, target_record_id, link_type)`.

**Indexes:**

- `(empresa_id, source_record_id, link_type)`
- `(empresa_id, target_record_id, link_type)`
- `(empresa_id, link_type, created_at)`

**Constraints:**

- Source and target records must belong to the same `empresa_id`, unless a future formal OMA third-party model explicitly permits cross-tenant references.
- Link status allowed values: `ACTIVE`, `VOIDED_BY_ADDENDUM`.
- `deleted_at` must remain `NULL` for active links.
- Links are traceability links, not proof that both records have the same legal precedence.

**Tenant relation:**

Links are tenant-scoped by `empresa_id`. Cross-tenant links are out of scope for the minimum design.

**Status and deletion:**

No destructive unlinking. Incorrect links are voided by append-only event and replacement link.

**Hash fields:**

Minimum link rows do not carry hashes directly. Link creation and voiding are recorded and hash-chained in `regulated_audit_events`.

**Canonical schema version:**

`canonical_schema_version` identifies the link schema, independent from the source and target record payload schemas.

```sql
-- Pseudocode / design, not migration.
CREATE TABLE regulated_record_links (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  source_record_id TEXT NOT NULL,
  target_record_id TEXT NOT NULL,
  source_version_id TEXT,
  target_version_id TEXT,
  link_type TEXT NOT NULL,
  link_reason TEXT NOT NULL,
  link_status TEXT NOT NULL,
  canonical_schema_version TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (link_status IN ('ACTIVE', 'VOIDED_BY_ADDENDUM')),
  CHECK (link_status != 'ACTIVE' OR deleted_at IS NULL),
  UNIQUE (source_record_id, target_record_id, link_type)
);
```

## 6. Immutability Strategy in D1/SQLite

Application-only blocking is not enough because future routes, maintenance scripts, administrative actions, or migrations could bypass a service-level check. Regulated tables need database-layer invariants.

Use SQLite/D1 triggers:

```sql
-- Pseudocode / design, not migration.
CREATE TRIGGER regulated_audit_events_no_update
BEFORE UPDATE ON regulated_audit_events
BEGIN
  SELECT RAISE(ABORT, 'regulated_audit_events is append-only');
END;

CREATE TRIGGER regulated_audit_events_no_delete
BEFORE DELETE ON regulated_audit_events
BEGIN
  SELECT RAISE(ABORT, 'regulated_audit_events is append-only');
END;
```

Tables that must be append-only from insertion:

- `regulated_audit_events`
- `regulated_record_hashes`

Tables that must be immutable after sealing:

- `regulated_records`
- `regulated_record_versions`
- `regulated_record_links`

Illustrative sealed-row trigger:

```sql
-- Pseudocode / design, not migration.
CREATE TRIGGER regulated_records_no_update_after_seal
BEFORE UPDATE ON regulated_records
WHEN OLD.status = 'SEALED'
BEGIN
  SELECT RAISE(ABORT, 'sealed regulated_records rows cannot be updated');
END;

CREATE TRIGGER regulated_records_no_delete_after_seal
BEFORE DELETE ON regulated_records
WHEN OLD.status = 'SEALED'
BEGIN
  SELECT RAISE(ABORT, 'sealed regulated_records rows cannot be deleted');
END;
```

Addendum is allowed without changing the original by appending a new version, hash row, audit event, and optionally a link to the original/base version. A future `regulated_addenda` table may make this explicit, but the original sealed payload still remains unchanged.

Soft delete must not be used for sealed regulated records. `deleted_at` exists only to align with AirTrust conventions and to represent abandoned drafts or non-sealed future cases. For sealed records, correction means addendum; voiding means an append-only status event and replacement, not data removal.

### Governance of Migrations for Regulated Tables

Triggers can be removed by future DDL. A migration that drops/recreates a regulated table can silently remove immutability. Therefore, regulated migrations require separate governance:

- maintain a catalog of regulated tables and required triggers;
- require a migration guard test that runs all migrations and checks trigger presence in `sqlite_master`;
- fail CI if any regulated table lacks its required trigger;
- prohibit ad-hoc `DROP TRIGGER`, `DROP TABLE`, or table recreation for regulated tables without ADR amendment;
- require dev/staging/prod parity checks before promoting a regulated migration;
- require a post-migration integrity check that attempts forbidden `UPDATE` and `DELETE` operations in a disposable database;
- require restore drills to verify triggers are present after restore;
- document rollback behavior, because rollback must not invalidate hash chains.

## 7. Hash Chain Strategy

The core uses multiple hashes:

- **Record hash:** hash of canonical payload hash, attachment manifest hash, record metadata, schema version, and canonicalization version.
- **Version hash:** represented by `payload_hash` and `record_hash` for a specific `version_id`.
- **Audit event hash:** hash of canonical event payload plus event metadata.
- **`previous_event_hash`:** pointer to the prior event in the same chain scope.
- **`tenant_chain_hash`:** cumulative hash for the chain scope within one tenant.

The chain must be per `empresa_id`/tenant because tenants are legally, operationally, and privacy-isolated. A chain that mixes tenants would create unnecessary coupling, make export by tenant harder, and increase LGPD exposure. The initial design should scope chain serialization by `(empresa_id, record_type)` or `(empresa_id, chain_scope)`, not globally across all tenants.

To avoid bifurcation:

- every chain append reads the latest `(empresa_id, chain_scope, chain_sequence, tenant_chain_hash)`;
- the next insert uses `chain_sequence + 1`;
- unique constraint `(empresa_id, chain_scope, chain_sequence)` forces only one writer to win;
- on conflict, the service rereads the latest chain tip and retries;
- the event payload includes the expected previous hash so unexpected conflict is detectable;
- idempotency keys prevent duplicate seal attempts from producing multiple chain entries.

D1 concurrency risk: two requests can attempt to seal records in the same chain scope at the same time and read the same previous hash. The minimum strategy is optimistic serialization: insert the next chain row with unique sequence, retry on constraint failure, and never auto-merge divergent chains. If D1 behavior or load makes this unreliable, sealing must be serialized per `(empresa_id, chain_scope)` using an application queue or Durable Object gate before production use.

## 8. JSON Canonicalization

The canonical JSON format must be deterministic across runtime versions and over time.

Minimum rules:

- UTF-8 without BOM.
- Unicode normalized to NFC.
- Object keys sorted recursively in deterministic lexicographic order.
- Arrays preserve semantic order and must never be used for unordered maps.
- Dates normalized to UTC ISO-8601 with fixed precision.
- Operational timezone stored separately when relevant.
- Numbers normalized by field rules; avoid free floating point for regulated values. Prefer integer+scale or decimal string where precision matters.
- Booleans and nulls represented as JSON primitives.
- Whitespace removed from serialized canonical JSON.
- Volatile fields excluded: UI labels, cache fields, `updated_at` from operational source tables, rendering-only values, transient request IDs, and local client timestamps not intended as record content.
- `canonical_schema_version` included in the payload envelope.
- `canonicalization_version` stored in version/hash metadata and never inferred from current code.

`payload_hash` is SHA-256 over the canonical JSON bytes. `attachments_manifest_hash` is SHA-256 over a canonical manifest that lists each attachment by stable key, R2 object key, MIME type, byte size, and byte hash.

Determinism tests required before implementation:

- same semantic payload with different key orders produces identical canonical bytes and hash;
- Unicode equivalent strings produce identical hash after NFC;
- date inputs normalize to fixed UTC output;
- numeric variants do not create accidental hash differences;
- excluded fields do not affect hash;
- historical vector fixtures keep their expected hashes forever;
- adding a new canonicalizer version never changes old expected vectors.

## 9. Service Boundaries

The future implementation should keep service boundaries explicit:

- **`RegulatedRecordService`**
  Owns record lifecycle: draft creation, version creation, sealing orchestration, status transition, and read model assembly.

- **`RegulatedHashService`**
  Owns canonicalization calls, payload hash, attachment manifest hash, record hash, chain hash, verification, and deterministic test vectors.

- **`RegulatedAuditLedgerService`**
  Owns append-only event writes, event canonicalization, event hash computation, chain append/retry, and blocked mutation event recording.

- **`RegulatedLinkService`**
  Owns creation and voiding of cross-record links, tenant validation on both sides, and link audit events.

- **`RegulatedExportService`** (future)
  Owns PDF/JSON/manifest/ZIP generation, R2 package writes, export audit events, and restore/export verification reports.

- **`RegulatedSignatureService`** (future)
  Owns signature provider abstraction, signed hash preparation, provider metadata, certificate metadata, revocation metadata, and signature verification.

Only internal services should write regulated tables. Module code should not write them directly.

## 10. Minimum Flows

### Create Draft Record

1. Module requests draft creation with `empresa_id`, source identity, record type, and schema version.
2. `RegulatedRecordService` validates tenant and source uniqueness.
3. `regulated_records` receives a `DRAFT` row.
4. `RegulatedAuditLedgerService` appends `RECORD_DRAFT_CREATED`.

### Generate Version

1. Module submits payload for a draft or addendum-style correction.
2. Service validates schema version and required fields.
3. Canonical payload JSON is generated.
4. `regulated_record_versions` receives the next append-only version row.
5. Audit ledger appends `RECORD_VERSION_CREATED`.

### Canonicalize

1. `RegulatedHashService` applies canonicalization rules for the version's `canonicalization_version`.
2. The canonical bytes are stored or validated against `canonical_payload_json`.
3. Payload size and deterministic hash inputs are recorded.

### Calculate Hash

1. Compute `payload_hash`.
2. Compute attachment byte hashes and canonical manifest hash when attachments exist in R2.
3. Compute `record_hash`.
4. Compute next `tenant_chain_hash`.
5. Insert `regulated_record_hashes`.

### Seal

1. Ensure version hash exists.
2. Update draft/root status to `SEALED` as the last allowed state transition.
3. Set `current_version_id` and `sealed_at`.
4. After sealing, database triggers block destructive mutation.
5. Append `RECORD_SEALED`.

### Register Auditable Event

1. Build canonical event payload.
2. Read latest audit chain tip for `(empresa_id, chain_scope)`.
3. Compute `event_hash` and next `tenant_chain_hash`.
4. Insert event with unique sequence.
5. Retry on sequence conflict or fail explicitly.

### Link Records

1. Validate both records belong to the same `empresa_id`.
2. Validate link type is allowed and does not imply unresolved regulatory precedence.
3. Insert `regulated_record_links`.
4. Append `RECORD_LINK_CREATED`.

### Consult Record

1. Query by `empresa_id` and record id/source metadata.
2. Load current version and hashes.
3. Optionally verify hashes on read for high-assurance flows.
4. Append read/verify event only for regulated or fiscal contexts where required.

### Future Export

1. Select records by tenant and scope.
2. Render PDF from canonical JSON.
3. Include canonical JSON, manifests, audit trail, and attachments.
4. Write package to R2.
5. Store export metadata in future `regulated_exports`.
6. Append export audit events.

## 11. Relation to DB Digital/eDB

Future eDB should use the core for each official DB sheet, leg, discrepancy, PIC signature target, operator signature target, and correction. eDB business tables may exist separately, but once a DB entry becomes an official record candidate, its canonical payload must be versioned and sealed through the Records Core.

This ADR does not implement eDB. It prepares the layer that eDB will need later: canonical schema versioning, hashable payloads, addendum-style correction, and exportable links to RDV, discrepancies, and maintenance actions.

Until the operator has formal authorization for the scope, eDB must remain non-regulated/preparatory.

## 12. Relation to SDRMe/MRO

Future SDRMe/MRO records such as OS, task card execution, inspections, RAS, component changes, AD/SB evidence, calibration evidence, and OMA references can use the core once their content schemas and signature requirements are defined.

The current MRO surface is a prototype with mock data and must not be treated as regulated. This ADR does not implement SDRMe, does not create RAS records, and does not transform current MRO into a regulated maintenance system.

The core only provides the future physical substrate: immutable versions, hashes, ledger, and links from discrepancies or RDV/eDB records to maintenance records.

## 13. Relation to Controle de Voos/RDV

Future Controle de Voos/RDV may use the core for releases, executed flights, actual times, flight-following evidence, irregularities, and RDV records. Links may connect RDV to eDB, MRO, FRMS, and SGSO.

The current Controle de Voos is a prototype with mock data and must not be represented as an official regulated system. This ADR does not make RDV the official source of truth and does not decide precedence between RDV and eDB. That precedence remains a regulatory and operational decision.

Until that decision is made, `regulated_record_links` are traceability links only, not legal precedence declarations.

## 14. Digital/Electronic Signature

Signature is outside the minimum core.

The core prepares the signature target by producing stable `record_hash`, `payload_hash`, `attachments_manifest_hash`, `canonical_schema_version`, and `canonicalization_version`.

Future signature implementation must be provider-pluggable. Gov.br, ICP-Brasil, CANAC/password/MFA, server-side signing, client-side signing, and offline signing all remain undecided. Gov.br/ICP-Brasil/CANAC choices depend on regulatory decisions by record type and scope.

No offline signature is implemented or endorsed by this ADR. No signature flow may be described as having regulatory validity before consultant/regulatory decisions confirm it.

## 15. Offline/Tablet

Offline/tablet/PED support is outside the minimum core.

The core is prepared for future offline support through:

- append-only versions;
- idempotency concepts;
- separate server timestamps;
- canonical schema versions;
- future device/sync tables;
- immutable server-side sealing.

Offline signature remains a regulatory and technical open issue. The clock on a device must be treated as untrusted. If future offline collection exists, `client_clock_at` may be captured as evidence, but official sealing and chain ordering must use server-side timestamps.

PWA vs native app is not decided. PWA may be sufficient for collection and read-only cache, but strong offline signature and device attestation may require native app, keystore/secure enclave, and MDM/attestation controls.

## 16. Backup and Restore

Current state from the repository documentation:

- The fake backup digest has been corrected.
- Real SHA-256 checksum manifest verification exists for local fixtures.
- A local restore drill exists for checksum manifest validation.
- The local drill does not restore into D1, does not validate domain consistency, and does not validate future `record_hash`, `manifest_hash`, or chain integrity.
- A staging/disposable-environment restore drill with post-restore validation is still missing.

When Records Core exists, restore must validate:

- `payload_hash` for each restored version;
- `attachments_manifest_hash` and each R2 attachment hash;
- `record_hash`;
- `chain_hash`/`tenant_chain_hash`;
- audit `event_hash`;
- `previous_event_hash`;
- export `manifest_hash` when exports exist;
- backup `checksum-manifest.json` hash.

Restore success for regulated records must mean "restored and cryptographically/domain-valid", not merely "database import completed".

## 17. Required Architecture Tests Before Implementation

Future implementation must define and run tests for:

- deterministic canonicalization;
- stable hash vectors;
- trigger blocks `UPDATE` on sealed records;
- trigger blocks `DELETE` on sealed records;
- audit events are append-only;
- hash chain detects row removal;
- hash chain detects reordering;
- concurrent seal conflict is detected or retried safely;
- tenant chain does not fork silently;
- link between records is preserved and tenant-scoped;
- export package contains verifiable manifest;
- restore validates hashes after import;
- migration guard verifies required triggers after all migrations.

These are design requirements, not tests implemented by this ADR.

## 18. Technical Risks

Required risks:

- **Trigger removable by future migration.**
  DDL can remove table triggers. Migration guard and regulated-table catalog are mandatory.

- **Concurrency and hash chain bifurcation.**
  D1 writes can race. Unique chain sequence plus retry or explicit serialization is required.

- **D1/R2 are not transactional together.**
  Attachment writes and D1 seal writes can diverge. Future implementation must write to R2, reread/verify bytes, then seal in D1.

- **Vendor lock-in in exports and evidence.**
  If verification depends only on AirTrust/Cloudflare, evidence is weaker. Export packages must be verifiable outside AirTrust.

- **Signature remains undefined.**
  Wrong provider choice can invalidate or force large refactors.

- **Offline remains undefined.**
  PWA limitations, device clock, key custody, and device compromise are not solved here.

- **Risk of calling prototype regulated.**
  MRO and Controle de Voos prototypes must remain clearly non-regulated.

- **Staging restore drill does not exist yet.**
  Local checksum drill is not enough for regulated recoverability.

Additional risks:

- D1 has no native row-level security; tenant isolation depends on service/repository discipline.
- `audit_events_v2` is not a regulated ledger and must not be reused as if it were append-only.
- Canonicalization changes can invalidate historical hashes if not versioned and tested.
- Soft-delete conventions in existing AirTrust tables can conflict with regulated immutability.
- Links can imply false precedence if RDV/eDB source-of-truth is not decided.

## 19. Out of Scope Decisions

This ADR does not decide or implement:

- ICP-Brasil vs Gov.br vs CANAC signature provider;
- offline signature;
- eDB implementation;
- SDRMe implementation;
- real Controle de Voos implementation;
- tablet/PED app;
- PWA vs native app;
- migrations;
- endpoints;
- frontend/backend changes;
- deploy;
- production, staging, or local database writes;
- fiscal export package final format;
- retention periods per record type;
- ANAC submission package;
- operator/OMA authorization scope.

## 20. Future Implementation Plan

**Phase A: ADR approved**

Review this ADR with engineering, product, security, and regulatory counsel. Confirm that it is minimum scope and does not create regulatory promises.

**Phase B: Local experimental migration**

In a separate approved phase, create local-only experimental migration for the five tables and triggers. Do not apply to staging/production.

**Phase C: Local immutability tests**

Test `UPDATE`/`DELETE` blocking, append-only behavior, canonicalization vectors, and chain conflict detection locally.

**Phase D: Non-regulated vertical slice**

Implement one non-regulated record flow from create to seal to verify to addendum-style correction. This should not be branded as regulated.

**Phase E: Export/restore staging**

Create a disposable staging environment restore drill with post-restore verification of record hashes, chain hashes, attachment manifests, and export package manifests.

**Phase F: eDB MVP non-regulated**

Build a controlled eDB MVP on top of the Records Core, explicitly marked non-regulated until authorization decisions are complete.

**Phase G: Evidence preparation**

Prepare traceability matrix, threat model, key custody model, backup/restore policy, export verification runbooks, and operator-specific submission evidence.

## 21. ADR Approval Criteria

Approval checklist:

- [ ] Reduced to the minimum core.
- [ ] Does not create a regulatory promise.
- [ ] Responds to red team risks.
- [ ] Aligns with the ANAC regulatory dossier.
- [ ] Does not depend on a signature provider decision.
- [ ] Allows future eDB, SDRMe, and RDV.
- [ ] Avoids initial overengineering.
- [ ] Keeps MRO and Controle de Voos prototypes non-regulated.
- [ ] Requires migration governance for triggers.
- [ ] Requires staging restore drill before regulated implementation.
- [ ] Requires deterministic canonicalization tests.
- [ ] Keeps PDF as export/view only.

## 22. Conclusion

This ADR recommends proceeding to **Phase B: local experimental migration** only after the ADR is reviewed and approved.

The recommendation is limited to local, non-regulated experimentation. It does not recommend staging or production migration, does not recommend eDB/SDRMe/RDV implementation, and does not authorize any regulated claim. The next safe technical step is to validate the five-table physical design locally with immutability triggers, canonicalization vectors, hash-chain conflict behavior, and migration-guard specifications.
