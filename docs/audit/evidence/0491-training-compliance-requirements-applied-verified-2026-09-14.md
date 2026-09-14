# 0491 — Training Compliance Requirements — production apply verified

- Change: `training-compliance-requirements-0491`
- Production Schema V2 run: `34860118881`
- Applied source SHA: `181e52baa77ad1855cb2833410aaf38944689e35`
- Production Worker/Pages release run: `34860594810`
- Final production read-only Compliance E2E: `34869844474`
- Result: schema apply, release and post-deploy functional verification passed.

The change introduced the canonical tenant-scoped `treinamento_requisitos` matrix. Its production state remains a prerequisite for later organizational and enrollment-reconciliation changes.
