# training-catalog-source-backed-metadata-0537

## Purpose
Forward-only correction of Costa do Sol training catalog metadata using controlled company sources already available to Training Management. No hours are invented merely to fill UI fields.

## Controlled sources
- **PRG-MNT-002 — Programa de Treinamento de Manutenção, Rev.06, 14/03/2025**, item 20.3: Doutrinação is one combined course; 8 h initial, 4 h recurrent, every 36 months (or earlier when contract/company need requires). MGM, MOM and MCQ are content inside Doutrinação, not three standalone 8/4 h courses.
- **MNL-MNT-001 MGM Rev.10**, **MNL-MNT-004 MOM Rev.08**, **MNL-MNT-005 MCQ Rev.08**.
- **MNL-SSO-002 — Manual de FDM Rev.09, Anexo 1**: Grupo de Voo 1 h; Comitê do FDM 2 h; Mecânicos 1 h. The 6 h Administradores do Programa curriculum exists but is outside the three-audience model and is not introduced here.
- **Costa do Sol 2025 LGPD completion certificate**: 2 h EAD.
- **PRC-GTI-002 Rev.02** and **PRC-GTI-003 Rev.01** support the corporate LGPD/security-awareness context.

## Changes
1. Replace unsupported PTM Rev.07 references with the controlled PTM Rev.06.
2. Normalize Maintenance Doutrinação to 8 h initial / 4 h recurrent / 36 months.
3. Keep MGM, MOM and MCQ standalone hour fields null and explain why; do not multiply the Doutrinação load.
4. Set LGPD to 2 h using internal completion evidence, explicitly distinguishing company practice from a statutory minimum.
5. Complete FDM metadata for Tripulação (1 h), Comitê/Gatekeeper (2 h) and MNT (1 h) from Manual FDM Rev.09.
6. Mirror metadata only to already-linked active LMS courses. No course, SCORM package, enrollment, completion, certificate or employee assignment is created.

## Deliberate non-change
NR-05 hour load is not changed here. PRG-SGI-005 requires following current NR-05, but the controlled material retrieved in this workstream does not prove the establishment risk grade needed to select the statutory hour band. The fail-closed null duration is preserved until that classification is evidenced.

## Safety / tenancy
All DML is explicitly scoped to `empresa_id=6`. The change does not alter RBAC, employee conditions, qualification history, certificates, completions, enrollments, other tenants or Schema V2 baseline structure.

## Before application
- 0536 is applied and its structural/rule postconditions pass.
- The expected active qualification models exist exactly once.
- 0537 is absent from the target ledger.
- PTM Rev.07 references targeted by this repair are still present; partial/manual remote repairs fail preflight.

## After application
- No active tenant-6 qualification reference contains PTM Rev.07.
- Maintenance Doutrinação is 8 h initial / 4 h recurrent / 36 months and cites PTM Rev.06.
- MGM/MOM/MCQ cite the actual controlled revisions and have no fabricated standalone hours.
- LGPD is 2 h with internal-evidence provenance.
- FDM Tripulação/Comitê/MNT carry 1 h / 2 h / 1 h respectively and cite Manual FDM Rev.09.
- Existing 0536 audience/designation rules remain intact.

## Compensation
Forward-only reviewed Schema V2 correction if a controlled source changes. D1 Time Travel is reserved for governed incident recovery and must not overwrite unrelated data.
