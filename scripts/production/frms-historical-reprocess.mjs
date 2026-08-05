#!/usr/bin/env node

// source_reference: docs/FRMS_HISTORICAL_REPROCESSING_PLAN_20260804.md and PR #811
// operational_decision: execute the specialist-approved full historical FRMS recalculation
// dry_run_required: the restored production backup must succeed before any remote write
// rollback_plan_required: preserve per-journey snapshots, full D1 backup and Time Travel recovery
// canonical_entrypoint: delegate to the reviewed executor without duplicating operational SQL

import '../../ops/production/frms-historical-reprocess.mjs';
