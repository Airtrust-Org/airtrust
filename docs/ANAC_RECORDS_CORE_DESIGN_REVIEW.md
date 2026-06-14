# AirTrust Regulated Records Core — Design Review Técnico

> **Tipo:** revisão técnica e desenho conceitual — somente documentação  
> **Data da revisão:** 2026-06-14  
> **Status:** proposta interna; não é orientação jurídica/regulatória; não submetido à ANAC  
> **Escopo:** DB Digital/eDB, SDRMe/MRO, Controle de Voos/RDV, FRMS, SGSO e LMS regulatório  
> **Restrição desta revisão:** nenhuma alteração de código, banco, migrations, deploy, secrets ou produção.

---

## 1. Sumário executivo técnico

O AirTrust já possui fundações importantes para operar como SaaS multi-tenant: Cloudflare Workers + Hono, D1/SQLite, R2, React SPA, autenticação JWT, RBAC, isolamento por `empresa_id`, auditoria dual e rotas de backup/exportação. Essas fundações são necessárias, mas não suficientes para registros regulados ANAC.

A conclusão técnica é direta: **o AirTrust ainda não possui um núcleo regulado comum capaz de tornar DB Digital/eDB, SDRMe, RDV ou registros correlatos juridicamente defensáveis como registros oficiais**. O estado atual é compatível com operação administrativa e protótipos navegáveis, mas não com substituição de papel ou com declaração de sistema regulado.

A recomendação principal é criar uma camada horizontal chamada **AirTrust Regulated Records Core**, usada por todos os módulos que produzam registros regulados. Essa camada deve ser implementada antes de eDB, SDRMe e Controle de Voos regulado. Ela deve centralizar:

- Registro canônico versionado.
- Selagem com hash reproduzível.
- Assinatura eletrônica/digital.
- Addendum e correção sem sobrescrita.
- Auditoria append-only com cadeia de integridade.
- Exportação fiscalizatória.
- Modo fiscalização.
- Registro de dispositivos/PED.
- Sincronização offline controlada.
- Retenção, backup e evidências de restauração.

O desenho abaixo não autoriza uso regulado. Ele define a arquitetura que deve ser validada com consultor regulatório e depois traduzida em schema, APIs, testes e evidências.

---

## 2. Estado atual do AirTrust

### 2.1 Fontes auditadas

Documentos regulatórios e técnicos:

- `docs/ANAC_BRIEFING_CONSULTOR_REGULATORIO.md`
- `docs/ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md`
- `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv`
- `docs/database-schema.md`
- `ARCHITECTURE_OVERVIEW.md`
- `AUTH_RBAC_MULTITENANCY.md`
- `DATABASE_SCHEMA.md`
- `SECURITY.md`
- `FRMS_ARCHITECTURE.md`
- `FRONTEND_ARCHITECTURE.md`
- `TECHNICAL_DEBT.md`
- `docs/PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`
- `docs/D1_ROLLBACK_DRILL_REPORT.md`
- `docs/PRODUCTION_D1_BACKUP_EXECUTION_REPORT.md`

Código auditado por leitura estática:

- `worker-airtrust/src/middleware/auth.ts`
- `worker-airtrust/src/middleware/rbac.ts`
- `worker-airtrust/src/middleware/tenant.ts`
- `worker-airtrust/src/lib/rbac/platform-access.ts`
- `worker-airtrust/src/utils/auditoria.ts`
- `worker-airtrust/src/lib/audit/audit-events-v2.ts`
- `worker-airtrust/src/routes/backup.ts`
- `worker-airtrust/src/services/backup/orchestrator.ts`
- `worker-airtrust/src/routes/exportacao.ts`
- `worker-airtrust/src/routes/assets.ts`
- `worker-airtrust/src/routes/horas-voo.ts`
- `worker-airtrust/src/shared/handlers/horasVooFromSimulador.handler.ts`
- `worker-airtrust/src/shared/handlers/horasVooFromFrms.handler.ts`
- `worker-airtrust/src/routes/frms-read-ack.ts`
- `src/react-app/pages/controle-voos/*`
- `src/react-app/pages/mro/*`
- `src/react-app/pages/sgso/SgsoRelprevPage.tsx`

### 2.2 Capacidades existentes úteis

O AirTrust já tem:

- Autenticação JWT com `jti`, expiração, blocklist e refresh token rotation.
- Multi-tenancy por `empresa_id` e contexto de tenant em Hono.
- RBAC com papéis `admin`, `manager`, `instructor`, `editor`, `student`, `viewer`.
- Modelo inicial de platform/support access.
- Auditoria legada (`auditoria`) e auditoria canônica v2 (`audit_events_v2`).
- Sanitização de metadados de auditoria v2.
- R2 para assets/documentos e rotas com política de acesso.
- Backup manual/modular para D1/R2 e documentação de drill D1.
- PWA/app shell no frontend.
- FRMS com pipeline operacional, read-ack e eventos dedicados.
- Controle de Voos e MRO navegáveis, com dados mockados e UX demonstrável.
- Upload de documentos com SHA-256 em alguns fluxos de pasta virtual.

### 2.3 Lacunas críticas atuais

As lacunas regulatórias centrais continuam abertas:

- Não existe tabela ou serviço de `regulated_records`.
- Não existe canonicalização formal de payload regulado.
- Não existe hash por registro regulado com algoritmo, versão e reproduzibilidade documentados.
- Não existe cadeia de hashes por tenant/módulo.
- Não existe assinatura eletrônica regulatória integrada a CANAC/licença/certificado.
- Não existe bloqueio técnico geral de alteração de registro selado.
- Não existe addendum padronizado para correção sem alteração silenciosa.
- Não existe exportação fiscalizatória padronizada com manifesto.
- Não existe perfil/mode fiscalização com escopo temporário.
- Não existe registry de dispositivos regulados/PED.
- Não existe sync offline regulatório para eDB.
- Não existe política de retenção por tipo de registro regulado.
- Auditoria atual é útil, mas não é ledger imutável regulatório.

### 2.4 Observações técnicas de risco

O documento `TECHNICAL_DEBT.md` registra risco crítico no backup (`backup/orchestrator.ts`) e risco de proxy local apontar para produção. ~~O código de backup também usa checksum placeholder (`sha256-${uuid}-${Date.now()}`), que não é evidência criptográfica de integridade. Para registros regulados, isso precisa ser substituído por digest real do pacote/manifesto.~~ **[Atualização 2026-06-14: digest placeholder substituído por SHA-256 real via `crypto.subtle.digest` em commit `da5177af`; TypeError `:318` corrigido; verificador local de `checksum-manifest.json` adicionado; restore drill local com fixtures fake implementado (ver `docs/BACKUP_RESTORE_DRILL.md`). Falta restore em staging descartável com verificação pós-restore de domínio e `record_hash`/chain.]**

O frontend documenta que APIs são `network-only` no Service Worker. Portanto, o PWA atual não entrega offline regulatório para DB/eDB. O offline existente em SGSO é fila funcional de relato, não assinatura regulatória com cadeia de custódia.

Controle de Voos e MRO atuais usam mock data no frontend. Devem continuar rotulados como protótipos até existirem persistência, Records Core, assinatura, auditoria, exportação e autorização por operador/OMA.

---

## 3. Requisitos técnicos do Regulated Records Core

O core deve fornecer garantias horizontais independentes do módulo chamador.

### 3.1 Garantias obrigatórias

- **Autenticidade:** vínculo entre pessoa, papel regulatório, CANAC/licença, empresa, fator de autenticação e assinatura.
- **Integridade:** hash reproduzível do payload, dos anexos e do pacote exportado.
- **Imutabilidade:** nenhum registro selado deve sofrer `UPDATE`/`DELETE` sem erro técnico ou evento explícito de tentativa bloqueada.
- **Rastreabilidade:** todo acesso, leitura fiscal, tentativa, assinatura, addendum, sync e export deve gerar evento auditável.
- **Disponibilidade:** registros devem estar acessíveis para o operador e para fiscalização dentro do escopo autorizado.
- **Recuperabilidade:** backup, restore e verificação de hash devem ser testáveis e documentados.
- **Correção sem apagamento:** correções devem gerar addendum, não sobrescrita.
- **Portabilidade fiscal:** exportação legível e verificável sem depender exclusivamente da aplicação AirTrust.

### 3.2 Premissas técnicas recomendadas

- O JSON canônico, não o PDF, deve ser o registro primário.
- O PDF deve ser representação humana do registro canônico.
- Hashes devem ser gerados no servidor após canonicalização controlada.
- Assinatura deve cobrir o hash do registro canônico e o manifesto dos anexos.
- O primeiro MVP pode operar com assinatura interna forte para fluxo não regulado, mas **uso regulado depende de D-01/D-02**.
- Qualquer offline regulatório deve separar intenção local de assinatura/selagem final online, salvo decisão formal contrária.

---

## 4. Modelo de domínio conceitual

As entidades abaixo são conceituais. Nenhuma tabela deve ser criada antes da validação regulatória e do desenho físico.

### 4.1 `regulated_records`

**Finalidade:** registro raiz de qualquer documento regulado: eDB folha/etapa, RDV, OS, RAS, jornada FRMS, ocorrência SGSO regulatória ou certificado de treinamento regulatório.

**Campos principais:** `id`, `empresa_id`, `module`, `record_type`, `source_module`, `source_entity_type`, `source_entity_id`, `status`, `current_version_id`, `canonical_schema_version`, `regulatory_scope_id`, `aircraft_id`, `aircraft_prefix`, `person_id`, `period_start`, `period_end`, `created_by`, `created_at`, `sealed_at`, `retention_policy_id`.

**Chaves:** PK em `id`; índice composto por `(empresa_id, record_type, status)`; índice por `(empresa_id, aircraft_prefix, period_start)`; unique opcional por `(empresa_id, source_module, source_entity_type, source_entity_id)`.

**Tenant:** `empresa_id` obrigatório. Registros de suporte cross-tenant devem usar `target_empresa_id` em auditoria, não remover isolamento.

**Riscos:** duplicidade entre origem operacional e registro regulado; divergência se o módulo fonte continuar editável após selagem.

**Notas D1/SQLite:** evitar JSON como única forma de consulta; manter colunas indexáveis para aeronave, período, pessoa e tipo.

### 4.2 `regulated_record_versions`

**Finalidade:** versões append-only do payload canônico de um registro. Versão 1 é criação; versões posteriores só por addendum, importação de contingência ou re-selagem controlada.

**Campos principais:** `id`, `empresa_id`, `record_id`, `version_number`, `version_reason`, `canonical_payload_json`, `canonical_payload_size`, `canonical_schema_version`, `created_by`, `created_at`, `supersedes_version_id`.

**Chaves:** unique `(record_id, version_number)`; FK lógica para `regulated_records.id`.

**Tenant:** repetir `empresa_id` para queries e validação de isolamento.

**Riscos:** payload grande em D1; necessidade de migração se o schema canônico evoluir.

**Notas D1/SQLite:** payloads grandes e anexos não devem ficar no D1; anexos em R2 e payload canônico enxuto no D1.

### 4.3 `regulated_record_hashes`

**Finalidade:** armazenar digest do payload, anexos, manifesto, versão e cadeia de hash.

**Campos principais:** `id`, `empresa_id`, `record_id`, `version_id`, `hash_algorithm`, `canonicalization_version`, `payload_hash`, `attachments_manifest_hash`, `record_hash`, `previous_tenant_chain_hash`, `tenant_chain_hash`, `computed_at`, `computed_by`.

**Chaves:** unique `(version_id, hash_algorithm, canonicalization_version)`.

**Tenant:** cadeia de hash deve ser por `empresa_id` e opcionalmente por `record_type`.

**Riscos:** canonicalização instável invalida hashes antigos; cadeia por tenant pode virar gargalo de escrita.

**Notas D1/SQLite:** transações devem garantir ordem da cadeia. Se D1 limitar concorrência, usar fila/serialização por tenant para selagem.

### 4.4 `regulated_signatures`

**Finalidade:** assinaturas de PIC, operador, mecânico, inspetor, aprovador, OCC ou fiscal/gerente conforme papel regulatório.

**Campos principais:** `id`, `empresa_id`, `record_id`, `version_id`, `signer_user_id`, `signer_funcionario_id`, `signer_name`, `signer_role`, `signer_canac`, `signer_license`, `signature_type`, `signature_provider`, `certificate_subject`, `certificate_serial`, `signed_hash`, `signature_blob_ref`, `signed_at`, `server_received_at`, `revoked_at`, `revocation_reason`.

**Chaves:** índice por `(record_id, signer_role)` e `(empresa_id, signer_user_id, signed_at)`.

**Tenant:** assinatura pertence ao mesmo `empresa_id` do registro, exceto fiscalizações com ator externo controlado.

**Riscos:** assinar hash errado; revogação de certificado; validade de Gov.br/ICP/CANAC não confirmada.

**Notas D1/SQLite:** blobs de assinatura/certificado podem ir para R2, com hash e metadados em D1.

### 4.5 `regulated_addenda`

**Finalidade:** correção formal sem alteração silenciosa do original.

**Campos principais:** `id`, `empresa_id`, `record_id`, `base_version_id`, `addendum_version_id`, `reason_code`, `reason_text`, `changed_fields_json`, `previous_values_hash`, `new_values_hash`, `requested_by`, `approved_by`, `created_at`, `sealed_at`.

**Chaves:** índice por `(record_id, created_at)`.

**Tenant:** mesmo `empresa_id` do registro original.

**Riscos:** addendum virar edição disfarçada; falta de apresentação clara do original + correção.

**Notas D1/SQLite:** armazenar diffs e hashes, não apenas texto livre.

### 4.6 `regulated_audit_events`

**Finalidade:** ledger regulatório append-only, separado da auditoria operacional existente.

**Campos principais:** `id`, `empresa_id`, `record_id`, `version_id`, `event_type`, `actor_user_id`, `actor_type`, `actor_role`, `support_mode`, `request_id`, `ip_hash`, `user_agent_hash`, `device_id`, `event_payload_json`, `previous_event_hash`, `event_hash`, `created_at`.

**Chaves:** índice por `(empresa_id, record_id, created_at)`; índice por `(empresa_id, event_type, created_at)`.

**Tenant:** obrigatório por `empresa_id`; fiscal/support deve registrar escopo.

**Riscos:** se permitir UPDATE/DELETE, perde valor probatório.

**Notas D1/SQLite:** usar triggers `BEFORE UPDATE/DELETE` com `RAISE(ABORT, ...)` para esta tabela e para tabelas seladas.

### 4.7 `regulated_exports`

**Finalidade:** registro de exportações fiscalizatórias, seus parâmetros, manifesto e hashes.

**Campos principais:** `id`, `empresa_id`, `export_type`, `purpose`, `scope_json`, `requested_by`, `requested_at`, `generated_at`, `package_r2_key`, `package_hash`, `manifest_hash`, `system_version`, `status`, `expires_at`.

**Chaves:** índice por `(empresa_id, generated_at)` e `(empresa_id, export_type)`.

**Tenant:** export nunca deve misturar tenants.

**Riscos:** vazamento de LGPD; export incompleto; pacote não reproduzível.

**Notas D1/SQLite:** ZIP/PDF/anexos ficam em R2; D1 guarda manifesto, hashes e trilha.

### 4.8 `regulated_devices`

**Finalidade:** cadastro de tablets/PEDs autorizados para registros regulados.

**Campos principais:** `id`, `empresa_id`, `device_uid`, `device_label`, `platform`, `app_version`, `pwa_version`, `assigned_user_id`, `assigned_aircraft_id`, `status`, `last_sync_at`, `last_integrity_check_at`, `revoked_at`, `revocation_reason`.

**Chaves:** unique `(empresa_id, device_uid)`.

**Tenant:** device é autorizado por empresa e, se aplicável, por aeronave/prefixo.

**Riscos:** PWA tem pouca capacidade de atestar jailbreak/root; device compartilhado indevidamente.

**Notas D1/SQLite:** não confiar em fingerprint frágil; usar device registration com segredo rotacionável e revogação.

### 4.9 `regulated_sync_sessions`

**Finalidade:** controle de sincronização offline/online, conflitos e selagem posterior.

**Campos principais:** `id`, `empresa_id`, `device_id`, `user_id`, `sync_started_at`, `sync_completed_at`, `client_clock_at`, `server_received_at`, `clock_drift_seconds`, `records_pushed`, `records_pulled`, `conflicts_count`, `status`, `error_code`.

**Chaves:** índice por `(empresa_id, device_id, sync_started_at)`.

**Tenant:** device e usuário devem pertencer ao mesmo tenant.

**Riscos:** conflito resolvido silenciosamente; clock local manipulado.

**Notas D1/SQLite:** conflitos devem gerar registros próprios e exigir addendum/decisão explícita.

### 4.10 `regulated_retention_policies`

**Finalidade:** política por tipo de registro e escopo regulatório.

**Campos principais:** `id`, `empresa_id`, `record_type`, `normative_reference`, `retention_years`, `retention_rule_text`, `archive_after_days`, `delete_allowed`, `created_at`, `approved_by`.

**Chaves:** unique `(empresa_id, record_type)`, com fallback global se necessário.

**Tenant:** pode haver política global e override por empresa/autorização.

**Riscos:** prazo incorreto por interpretação regulatória; exclusão prematura.

**Notas D1/SQLite:** default seguro deve ser arquivar, não deletar.

### 4.11 `regulated_record_links`

**Finalidade:** vincular registros entre módulos: RDV -> eDB -> discrepância -> OS -> RAS -> FRMS/SGSO.

**Campos principais:** `id`, `empresa_id`, `source_record_id`, `target_record_id`, `link_type`, `link_reason`, `created_by`, `created_at`.

**Chaves:** unique `(source_record_id, target_record_id, link_type)`.

**Tenant:** ambos os registros devem pertencer ao mesmo `empresa_id`, salvo exceção de OMA terceirizada formalmente modelada.

**Riscos:** cadeia operacional incompleta; MRO atualizado por RDV não selado.

**Notas D1/SQLite:** validar existência e tenant dos dois lados antes de inserir.

---

## 5. Imutabilidade em Cloudflare D1/SQLite

| Opção | Descrição | Prós | Contras | Risco | Complexidade | Recomendação |
|---|---|---|---|---|---|---|
| A | Apenas serviço/app bloqueia edição | Simples e rápido | Bypass por rota futura, script, bug ou migration | Alto | Baixa | Não basta para regulado |
| B | Triggers/constraints impedem UPDATE/DELETE | Defesa no banco, auditável | Precisa governança de migrations e exceções | Médio | Média | Usar para tabelas seladas |
| C | Event log append-only + snapshots | Reconstrói histórico e reduz edição direta | Mais volume e complexidade de query | Baixo/médio | Alta | Base recomendada |
| D | Cadeia de hash por tenant | Detecta remoção/reordenação/adulteração | Concorrência e recuperação exigem cuidado | Baixo | Alta | Usar no ledger e selagens |
| E | Export externo assinado/arquivado em R2 | Evidência portátil, bom para fiscalização | Não impede adulteração pré-export | Médio | Média | Usar como evidência complementar |
| F | Âncora externa futura | Aumenta prova de tempo/integridade | Dependência/custo e decisão regulatória | Baixo | Alta | Planejar, não bloquear MVP |

Recomendação técnica: combinar **B + C + D + E**. O serviço aplica regras de domínio, o banco bloqueia alteração indevida, o ledger append-only registra eventos, a cadeia de hash detecta adulteração, e exportações R2 preservam evidências fiscalizatórias. A opção F deve ser extensível, não requisito inicial.

---

## 6. Hash e canonicalização

### 6.1 Regras propostas

- Usar SHA-256 no MVP; prever campo `hash_algorithm` para SHA-384/SHA-512/SHA-3 futuro.
- Canonicalizar JSON com ordem determinística de chaves.
- Normalizar datas em UTC ISO 8601, mantendo timezone operacional quando necessário em campo separado.
- Normalizar números com escala definida por campo, evitando diferenças `1`, `1.0`, `"1"`.
- Excluir campos voláteis do payload canônico, como `updated_at` operacional, cache ou labels de UI.
- Incluir `canonical_schema_version`.
- Gerar hash de anexos por bytes reais e manifestar nome, MIME, tamanho, hash e R2 key.
- Gerar `record_hash` sobre payload canônico + manifesto de anexos + metadados mínimos.

### 6.2 Versões de canonicalização

Cada hash deve registrar `canonicalization_version`. Se o algoritmo de canonicalização evoluir, hashes antigos continuam verificáveis pela versão antiga.

### 6.3 Verificação

O endpoint conceitual de verify deve recalcular:

- Hash do payload.
- Hash de cada anexo.
- Hash do manifesto.
- Hash do evento de auditoria.
- Encadeamento `previous_hash -> current_hash`.

Qualquer divergência deve retornar status explícito: `VALID`, `PAYLOAD_HASH_MISMATCH`, `ATTACHMENT_HASH_MISMATCH`, `CHAIN_BROKEN`, `MISSING_SIGNATURE`, `SIGNATURE_REVOKED`, `UNKNOWN_CANONICALIZATION_VERSION`.

---

## 7. Assinatura eletrônica/digital

| Opção | Descrição | Prós | Contras | Uso recomendado |
|---|---|---|---|---|
| A | Interna AirTrust: CANAC + senha + MFA | Implementável rápido; bom para intenção e treinamento | Pode não ter validade jurídica regulatória | MVP não regulado e trilha de intenção |
| B | Gov.br | UX conhecida; potencial respaldo ICP | Dependência de API/fluxo externo; aceite ANAC precisa confirmação | Candidata para eDB se D-01 aceitar |
| C | ICP-Brasil A1 | Automação melhor; certificado software | Gestão de chave privada e custo | Candidata para operador/aprovador |
| D | ICP-Brasil A3/token | Forte e tradicional | Difícil em tablet/PWA; UX pior | Possível para RAS ou manutenção crítica |
| E | Híbrida: interna agora + ICP depois | Permite avançar UX e core | Risco de refatorar assinatura se modelo divergir | Recomendado para fase pré-regulatória |
| F | Server-side vs client-side signing | Server-side simplifica; client-side protege chave do usuário | Server-side pode concentrar risco; client-side complica offline | Decidir por tipo de assinatura |

Recomendação: construir o core para aceitar múltiplos provedores, mas não declarar validade regulatória até D-01/D-02. Toda assinatura deve cobrir `record_hash`, `canonical_schema_version`, papel do assinante e timestamp relevante.

---

## 8. Assinatura offline e timestamp confiável

### 8.1 Problema técnico

Offline em tablet/PED cria três riscos:

- Clock do dispositivo pode estar errado ou manipulado.
- Chave privada local pode ser extraída em device comprometido.
- PWA não tem atestação forte de integridade do dispositivo.

### 8.2 Designs possíveis

| Design | Descrição | Prós | Contras | Recomendação |
|---|---|---|---|---|
| A | Offline só coleta dados; assinatura regulatória ocorre online | Mais seguro e simples de defender | Pode não atender operações sem conectividade no fechamento | Melhor MVP regulatório conservador |
| B | Offline registra intenção local; servidor sela ao reconectar | Preserva operação e separa timestamp local/servidor | Assinatura final não é exatamente no momento offline | Recomendado como default técnico |
| C | Certificado local forte offline | Funciona desconectado de verdade | Exige app nativo/keystore/PKI; PWA é frágil | Só após consultor e especialista PKI |
| D | Contingência papel | Regulatoriamente familiar | Reintroduz dupla fonte e retrabalho | Obrigatório como plano de contingência |

### 8.3 Recomendação

Para eDB em PWA, usar B como desenho inicial: o PIC preenche e confirma intenção offline; o dispositivo guarda payload local cifrado e fila de sync; ao reconectar, servidor registra `client_clock_at`, `server_received_at`, drift, sela e exige assinatura final online se a norma exigir. Se o consultor exigir assinatura offline plena, migrar para app nativo/keystore e ICP/Gov.br compatível.

---

## 9. Audit log imutável

### 9.1 Eventos obrigatórios

Eventos mínimos:

- `RECORD_DRAFT_CREATED`
- `RECORD_UPDATED_BEFORE_SEAL`
- `RECORD_SEALED`
- `RECORD_SEAL_FAILED`
- `SIGNATURE_REQUESTED`
- `SIGNATURE_CREATED`
- `SIGNATURE_REVOKED`
- `ADDENDUM_REQUESTED`
- `ADDENDUM_SEALED`
- `UPDATE_BLOCKED_ON_SEALED_RECORD`
- `DELETE_BLOCKED_ON_SEALED_RECORD`
- `EXPORT_REQUESTED`
- `EXPORT_GENERATED`
- `EXPORT_DOWNLOADED`
- `FISCAL_SESSION_STARTED`
- `FISCAL_RECORD_VIEWED`
- `FISCAL_EXPORT_GENERATED`
- `FISCAL_SESSION_EXPIRED`
- `DEVICE_REGISTERED`
- `DEVICE_REVOKED`
- `SYNC_STARTED`
- `SYNC_CONFLICT_DETECTED`
- `SYNC_COMPLETED`
- `VERIFY_EXECUTED`
- `RESTORE_VERIFICATION_EXECUTED`

### 9.2 Estrutura do evento

Cada evento deve conter:

- `id`
- `empresa_id`
- `record_id`
- `version_id`
- `event_type`
- `actor_user_id`
- `actor_role`
- `actor_type`
- `device_id`
- `request_id`
- `ip_hash`
- `user_agent_hash`
- `event_payload_json`
- `previous_event_hash`
- `event_hash`
- `created_at`

### 9.3 Relação com auditoria atual

`audit_events_v2` pode inspirar sanitização, categorias, risco e retention class. Porém, para registros regulados, deve existir ledger específico com hash chain e bloqueio técnico de mutação.

---

## 10. Addendum e correções

### 10.1 Regra central

Depois de selado ou assinado, um registro regulado nunca deve ser editado diretamente. Correção deve ser addendum.

### 10.2 Fluxo recomendado

1. Usuário solicita correção informando motivo.
2. Sistema captura valor original, valor novo, campo e versão base.
3. Sistema valida se o usuário pode corrigir aquele tipo de registro.
4. Sistema cria `regulated_addenda`.
5. Addendum é assinado conforme regra do tipo de registro.
6. Addendum é selado e vinculado ao original.
7. UI e exportações exibem original + addendum.

### 10.3 Como evitar correção silenciosa

- Bloquear `UPDATE` em registros selados no banco.
- Bloquear `DELETE` em versões, hashes, assinaturas, addenda e eventos.
- Registrar tentativa bloqueada no audit log.
- Exportar sempre histórico de addenda junto do registro.
- Proibir substituição de anexo selado; novo anexo deve ser addendum.

---

## 11. Exportação fiscalizatória

### 11.1 Pacote proposto

Cada export deve gerar um pacote ZIP com:

- PDF legível.
- JSON canonicalizado.
- Manifesto de hashes.
- Anexos.
- Assinaturas.
- Audit trail relevante.
- `README.txt` explicando estrutura e verificação.
- Versão do sistema.
- Data/hora de geração.
- Usuário que exportou.
- Finalidade.
- Escopo: aeronave, período, módulo, operador.

### 11.2 Tipos de export

- **DB/eDB:** por aeronave/prefixo, folha, etapa, período, PIC, operador.
- **SDRMe/MRO:** por aeronave, OS, task card, RAS, componente, AD/SB.
- **Controle de Voos/RDV:** por voo, período, programação, jornada, OCC, irregularidades.
- **Auditoria/fiscalização:** pacote com registros + eventos + acessos do fiscal.
- **Offline no tablet:** export emergencial limitado ao cache autorizado, com aviso se incompleto.

### 11.3 LGPD

Export fiscal deve ser por escopo mínimo. Dados pessoais fora do escopo devem ser omitidos, mascarados ou justificados. Toda exportação deve registrar finalidade, solicitante, destinatário e prazo de expiração do pacote se hospedado em R2.

---

## 12. Modo fiscalização

### 12.1 Perfil e acesso

Criar perfil read-only temporário com:

- Escopo por `empresa_id`.
- Escopo por aeronave/prefixo.
- Escopo por período.
- Escopo por módulo.
- Expiração automática.
- Bloqueio absoluto de edição.
- Botão de exportação fiscalizatória.

### 12.2 Tablet e web

No tablet/PED, modo fiscalização deve permitir visualização offline dos registros autorizados em cache. Na web, deve permitir consulta e exportação dentro do escopo concedido.

### 12.3 Evidência para o operador

Ao encerrar sessão fiscal, gerar evidência com:

- Fiscal/usuário/ator.
- Quem concedeu acesso.
- Período de acesso.
- Registros visualizados.
- Exportações geradas.
- Hash do pacote exportado.
- Expiração/revogação do acesso.

---

## 13. Controle de dispositivos regulados

### 13.1 Cadastro mínimo

Cada tablet/PED deve ter:

- Identificador de dispositivo.
- Empresa.
- Usuário responsável.
- Aeronave/prefixo opcional.
- Versão do app/PWA.
- Status: `ACTIVE`, `SUSPENDED`, `REVOKED`, `LOST`, `RESERVE`.
- Última sincronização.
- Última verificação de integridade do cache.
- Política de atualização.

### 13.2 PWA vs app nativo

PWA é viável para app shell, cache, fila local e leitura offline. PWA é frágil para atestação de jailbreak/root, armazenamento de chave privada forte e assinatura digital offline de alto valor.

Se D-03 exigir assinatura offline regulatória robusta, a recomendação é app nativo com secure enclave/keystore, device attestation quando disponível e MDM para operadores maiores.

### 13.3 Revogação e wipe lógico

Device revogado não deve conseguir sincronizar. Wipe lógico deve invalidar segredo local e remover cache local na próxima abertura. Como wipe remoto não é garantido em PWA offline, registros em cache devem estar cifrados e expirar por política.

---

## 14. Backup e restauração

### 14.1 Estado atual

O AirTrust possui documentação de backup e drill D1, incluindo evidência de restauração SQLite local e SHA256 de backup. Também há rotas de backup manual/modular e R2.

Lacunas para registros regulados:

- ~~Checksum do orquestrador atual é placeholder, não digest criptográfico real.~~ **[Corrigido em `da5177af` — SHA-256 real via `crypto.subtle.digest`; verificador local de manifesto implementado; restore drill local implementado (ver `docs/BACKUP_RESTORE_DRILL.md`).]**
- Backup modular não garante pacote regulatório completo por registro.
- ~~Não há restore drill específico de Records Core.~~ Drill local com `checksum-manifest.json` e fixtures fake implementado. **Falta:** restore drill em staging descartável com verificação pós-restore de `record_hash`/chain (exige Records Core implementado).
- Não há prova automática de que hashes permanecem válidos pós-restore em staging (permanece aberto).
- R2 metadata manifest não substitui backup integral de anexos regulados.

### 14.2 RPO/RTO propostos

- **eDB/RDV:** RPO <= 15 minutos para registros sincronizados; RTO <= 4 horas para consulta web; consulta offline depende de cache local.
- **SDRMe/RAS:** RPO <= 15 minutos; RTO <= 4 horas; export emergencial por aeronave prioritário.
- **Audit/hash/signature ledger:** RPO <= 5 minutos ou gravação síncrona; RTO <= 4 horas.
- **R2 anexos regulados:** RPO <= 15 minutos; RTO <= 8 horas.

### 14.3 Evidências exigidas

- Backup D1 com hash real.
- Backup R2 de anexos regulados com manifest.
- Restore drill mensal em ambiente temporário.
- Verificação pós-restore de `record_hash`, `manifest_hash` e cadeia de auditoria.
- Relatório de restore assinado internamente.
- Prova de que export fiscal pós-restore gera pacote idêntico ou justificadamente equivalente.

### 14.4 Risco Cloudflare D1

D1 é SQLite gerenciado. O risco principal é depender de restauração operacional sem procedimento testado para base regulada. Para registros regulados, o AirTrust deve manter export externo seguro em R2 ou armazenamento equivalente, com manifesto e retenção independente.

---

## 15. Integração com módulos

### 15.1 DB Digital/eDB

Registros: folha de DB, etapa de voo, assinatura PIC, assinatura operador, discrepância técnica, contingência papel.

Eventos: abertura, preenchimento, assinatura, selagem, addendum, export, fiscalização, sync.

Assinaturas: PIC e operador/designado; tipo depende de D-01.

Exports: por aeronave/período/folha/PIC, com PDF equivalente e JSON canônico.

### 15.2 SDRMe/MRO

Registros: OS, task card, execução, inspeção, RAS, componente removido/instalado, AD/SB, calibração, manutenção terceirizada.

Eventos: abertura OS, execução step, inspeção, RAS, vínculo com discrepância, transferência de registros.

Assinaturas: executor, inspetor, aprovador/RAS; tipo depende de D-02.

Exports: histórico de manutenção por aeronave, OS/RAS, componente e AD/SB.

### 15.3 Controle de Voos/RDV

Registros: programação, release, RDV, jornada realizada, irregularidade operacional, localização/flight following.

Eventos: programação, despacho/release, alteração, fechamento RDV, envio para MRO/FRMS/SGSO.

Assinaturas: OCC/despachante e PIC conforme decisão regulatória.

Exports: RDV por período/aeronave, jornada, cancelamentos, atrasos, localização.

### 15.4 FRMS

Registros: jornada real, alertas críticos, decisões de mitigação, read-ack, justificativas, snapshot operacional.

Eventos: cálculo, alerta, reconhecimento, decisão, reprocessamento, importação FIRA/SIGVOOS.

Assinaturas: gestor/OCC em decisões críticas; tripulante em ciência quando aplicável.

Exports: jornada e repouso por tripulante/período, decisões e alertas.

### 15.5 SGSO

Registros: relato regulatório, ocorrência vinculada ao voo, ação corretiva, auditoria/NC.

Eventos: criação, triagem, alteração de risco, ação, fechamento.

Assinaturas: responsável SGSO/gestor conforme processo do operador.

Exports: pacote de ocorrência, ações corretivas e vínculo com eDB/RDV.

### 15.6 LMS

Registros: treinamento regulatório, certificado, presença, conclusão, validade.

Eventos: matrícula, conclusão, emissão certificado, revogação, renovação.

Assinaturas: instrutor/responsável técnico quando o treinamento for pré-requisito regulatório.

Exports: histórico de treinamento por pessoa e evidência de qualificação antes de assinar SDRMe/eDB.

---

## 16. APIs conceituais

Nenhum endpoint abaixo deve ser implementado sem desenho físico e validação.

| Endpoint | Finalidade | Chamador | Autorização | Riscos | Testes críticos |
|---|---|---|---|---|---|
| `POST /internal/regulated-records` | Criar registro regulado em draft | eDB/RDV/MRO/FRMS/SGSO/LMS | serviço interno + tenant | duplicidade/fonte errada | tenant, schema, idempotência |
| `POST /internal/regulated-records/:id/seal` | Canonicalizar, hash e selar | módulo dono | papel autorizado | selar payload incorreto | hash reproduzível, bloqueio update |
| `POST /internal/regulated-records/:id/sign` | Assinar hash do registro | frontend/backend assinatura | usuário + papel + MFA/cert | assinatura fraca/errada | signer, hash, revogação |
| `POST /internal/regulated-records/:id/addendum` | Corrigir sem alterar original | módulo dono | papel autorizado | correção silenciosa | original intacto, diff, assinatura |
| `GET /internal/regulated-records/:id/verify` | Verificar integridade | módulos/admin/fiscal | read + escopo | falso positivo | payload, anexo, chain |
| `POST /internal/regulated-records/export` | Gerar pacote fiscal | fiscal/admin/operador | export permission + escopo | LGPD/export incompleto | manifest, audit, escopo |
| `POST /internal/regulated-records/sync` | Sincronização offline | tablet/PED | device + user + tenant | conflito/clock | revogação, drift, conflito |
| `GET /api/regulatory/fiscalizacao/...` | Modo fiscalização | web/tablet | fiscal session read-only | edição/vazamento | expiração, audit de leitura |

---

## 17. Testes de conformidade técnica

Bateria mínima:

- Registro selado não aceita `UPDATE`.
- Registro selado não aceita `DELETE`.
- Addendum preserva original.
- Hash é reproduzível em ambiente limpo.
- Alteração de um byte no JSON quebra verificação.
- Alteração de um byte em anexo quebra manifesto.
- Usuário sem papel não assina.
- Usuário com CANAC/licença ausente não assina quando obrigatório.
- Assinatura revogada invalida status regulatório.
- Tentativa de mutação bloqueada gera audit event.
- Exportação é reproduzível e contém manifest.
- Restore mantém hashes válidos.
- Sync offline com conflito não escolhe vencedor silencioso.
- Device revogado não sincroniza.
- Fiscal read-only não consegue mutar.
- Export fiscal respeita escopo e registra tudo que foi visto/exportado.

---

## 18. Riscos técnicos e decisões pendentes

| Risco | Prob. | Impacto | Mitigação | Decisão necessária | Modelo recomendado | Consultor? |
|---|---:|---:|---|---|---|---|
| Assinatura aceita pela ANAC indefinida | Alta | Muito alto | Abstrair provider; não operar regulado | D-01/D-02 | Codex 5.5 + consultor | Sim |
| Timestamp offline inválido | Alta | Muito alto | Intenção offline + selo servidor | D-03/D-04 | Codex 5.5 + PKI | Sim |
| RDV vs eDB sem fonte oficial | Média | Alto | Modelar links e precedência por decisão | D-10 | Codex 5.5 | Sim |
| Imutabilidade só na app | Alta | Alto | Triggers + append-only + chain | Arquitetura DB | Codex 5.5 | Não, mas validar |
| PWA insuficiente para assinatura local forte | Média | Alto | PWA para coleta; app nativo se necessário | D-03 | Codex 5.5 + mobile/PKI | Sim |
| Backup sem digest real | Média | Alto | SHA-256 real de pacote/manifest | Política backup | Codex 5.5 | Não |
| Export com excesso LGPD | Média | Alto | Escopo mínimo e manifest | Política fiscalização | Codex 5.5 | Sim |
| Protótipos tratados como regulados | Alta | Muito alto | Banner/status e governança comercial | Comunicação | Produto + jurídico | Sim |
| D1 concorrente em hash chain | Média | Médio | Fila por tenant/tipo | Design físico | Codex 5.5 | Não |
| Migrations futuras quebrando immutability | Média | Alto | testes de arquitetura e gates | Governança | Codex 5.5 | Não |

---

## 19. Roadmap técnico recomendado

### Fase A — auditoria e desenho final

Validar este documento, fechar decisões D-01 a D-05 com consultor, definir escopo piloto e criar ADRs.

### Fase B — scaffolding Records Core sem assinatura regulatória

Criar modelos internos, service boundaries, status machine e contratos de API em modo não regulado.

### Fase C — hash + audit log + addendum

Implementar canonicalização, hash, append-only ledger, triggers de bloqueio e addendum.

### Fase D — exportação fiscalizatória

Criar pacote PDF + JSON + manifesto + anexos + audit trail + README.

### Fase E — device registry + sync offline

Registrar PED/tablet, criar sessões de sync, revogação e conflito explícito.

### Fase F — assinatura online

Implementar assinatura interna forte e/ou provider decidido para uso online.

### Fase G — assinatura/offline após decisão regulatória

Escolher PWA conservador, app nativo ou contingência papel conforme D-03/D-04.

### Fase H — integração eDB

eDB como primeiro módulo regulado, com piloto controlado.

### Fase I — integração SDRMe

OS/task cards/RAS, componentes, AD/SB, terceirizados e LMS/qualificações.

### Fase J — testes e evidências ANAC

Executar matriz de conformidade, restore drill, export fiscal e pacote de submissão por operador/OMA.

---

## 20. Conclusão

### 20.1 O que pode ser implementado agora

Pode ser implementado agora, sem depender do consultor, o desenho técnico interno de Records Core em modo não regulado: canonicalização, versionamento, hashes, audit ledger, addendum, export package, testes de integridade e device registry básico. Isso deve ser tratado como infraestrutura preparatória.

### 20.2 O que deve esperar consultor

Devem esperar consultor: tipo de assinatura aceita para eDB e SDRMe/RAS, validade de Gov.br/ICP/CANAC, assinatura offline, timestamp offline, quantidade de registros no PED, hierarquia RDV/eDB, autorização por operador/frota/prefixo, formato fiscal aceito e transição papel/digital.

### 20.3 O que é tecnicamente inviável ou arriscado

É arriscado declarar PWA offline com assinatura local como regulatório sem decisão formal. Também é arriscado tratar PDFs como registro primário, usar checksum placeholder como evidência, confiar apenas em bloqueio de app para imutabilidade, ou operar MRO/Controle de Voos mockados como sistemas regulados.

### 20.4 Arquitetura recomendada

Arquitetura recomendada: `Regulated Records Core` horizontal com D1 para metadados/versionamento/ledger, R2 para anexos/pacotes, hash chain por tenant/tipo, triggers de imutabilidade, assinaturas plugáveis, addendum obrigatório, export fiscal com manifest e modo fiscalização read-only.

### 20.5 Próximo modelo recomendado

Próximo modelo recomendado: **Codex 5.5**, mantendo a restrição de produção segura do AirTrust e atuando primeiro em ADR/schema design, não em implementação direta.

### 20.6 Próximo prompt sugerido

```text
Você está no monorepo AirTrust. Use produção segura. Leia docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md e proponha, sem implementar, um ADR técnico para o desenho físico do Regulated Records Core em Cloudflare D1/R2. O ADR deve escolher tabelas, constraints, triggers, índices, estratégia de hash chain, canonicalização JSON, boundaries de serviço e testes de arquitetura. Não crie migrations nem altere código.
```
