# Audit v2 staging target evidence

- Date: `2026-06-04`
- Window: `Block 4 of 6`
- Scope: apply only `worker-airtrust/migrations/0385_audit_events_v2.sql`
- Environment: `staging`
- Worker binding reference: `worker-airtrust/wrangler.toml:[env.staging].d1_databases`
- D1 target: `DB=airtrust-db-staging`
- D1 id: `b7f50907-c110-45f5-ad17-e97ea47f2826`
- Safe command: `bash scripts/run-audit-v2-staging-schema-apply.sh`
- Out of scope confirmation: no deploy, no production, no `DQ-01`, no `MIG-01`, no `0389`
