# Production QA session gap

There is currently no sanctioned synthetic production-QA provisioning or
check-only authenticated-session mechanism. `scripts/seed-staging-smoke-user.mjs`
explicitly rejects production and must remain staging-only.

Consequently, production authenticated QA that requires a synthetic identity is
blocked until a governed mechanism is reviewed and approved. This does not
block independent staging QA or any work not requiring that identity.
