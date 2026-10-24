# SCORM F0 Schema V2 0568 — staging apply evidence

- Environment: **staging only**; D1 name `airtrust-db-staging-baseline-20260701` and ID `bf9963f4-eb12-439b-a830-20bbf577ac22`.
- Official workflow: [Apply Reviewed Schema V2 (Staging), run #40045168335](https://github.com/Airtrust-Org/airtrust/actions/runs/40045168335); concluded **SUCCESS**.
- Open candidate PR at execution: [#1719](https://github.com/Airtrust-Org/airtrust/pull/1719); exact reviewed/applied SHA `ca9039f24ff484daa926b9e23ccd517bcddfbd23`.
- Manifest SQL SHA256: `6f85d5e3d141e140c54ea5b62c2dc3143447187960b8d89d7b6ed6dc4f3eb197`; plan SHA256: `ff0e971ac739846159651689d3604c3a3bbea8add204fda1c49bbcdcb9261696`.
- Verified workflow steps: trusted-main dispatch/owner exact-SHA grant, eight CI release gates, scoped manifest and pinned D1; remote D1 schema preflight; verified D1 Time Travel recovery bookmark; exact reviewed bundle apply; physical postchecks and ledger provenance.
- Postchecks verified the single `lms_scorm_qa_evidence_bindings` table, 17 columns, 2 foreign keys, 2 indexes, 3 immutability/scope triggers and zero initial binding records. Course, package, enrollment, cycle, SCORM progress, diagnostic and qualification-history row counts were unchanged.
- Not evidence of a real candidate ZIP upload, candidate-bound learner launch/commit, functional certification, or production deployment. Those are separate governed steps.
