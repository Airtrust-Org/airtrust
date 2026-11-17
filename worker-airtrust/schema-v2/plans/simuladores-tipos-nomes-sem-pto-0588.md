# Rename six simulator session type DISPLAY labels only (0588)

## Scope and owner request (16 Nov 2026)
The user explicitly requests removal of the suffix 'PTO Rev10' from six simulator session types. D1 production read-only preflight confirmed six rows in tenant 6, IDs 24-29, and exactly the expected original labels. There are zero active manobras with 'PTO' in the nome field; all 88 canonical V18 model names already exclude the suffix.

| ID | Stable code | New display name |
|---|---|---|
| 24 | P10-TRN | Transição |
| 25 | P10-RQ | Requalificação |
| 26 | P10-REC | Reaquisição de experiência recente |
| 27 | P10-NOT | Treinamento noturno |
| 28 | P10-INS | Treinamento de Instrutor |
| 29 | P10-EXA | Treinamento de Examinador |

Only tipos_sessao.nome and updated_at change. Do not rename codigo, session version codes, audit documentary references, curricula or old signed sheets.

## Preflight and postconditions
Preflight read-only: rows 24-29 match code, tenant and original title (unless already updated identically by another approved application); no other tenant target. If any row has an unexpected label/code, stop; do not assume migration is complete.
Apply only through reviewed Schema V2 workflow with SHA, branch protection, 8 gates, production environment approvals, Time Travel bookmark, atomic ledger. SQL is deliberately idempotent; exact original label is required.
Post-readback: each ID retains code and company, new name, preserved relationship counts and all model/manobra/guide/ficha data; zero unexpected modifications; Schema V2 ledger contains this change_id.
No Worker or Pages deploy needed: UI displays these persisted names through existing GET /tipos-sessao route.

## Recovery
D1 Time Travel bookmark + controlled exact update of six labels back to the six previously evidenced values, with corresponding approved recovery plan if a subsequent incident warrants it. Do not revert unrelated D1 writes.
