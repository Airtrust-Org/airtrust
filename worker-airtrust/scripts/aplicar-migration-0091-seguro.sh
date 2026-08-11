#!/usr/bin/env bash
set -euo pipefail

# Legacy 0091 executor retired on 2026-08-04.
#
# This file is intentionally kept as a fail-closed tombstone so old runbooks,
# shell history or operator habits cannot silently reach a remote database.
# Migration 0091 belongs to the historical chain and must not be selected by a
# generic remote runner. Any future reconciliation requires a new reviewed,
# single-purpose procedure with an exact target, backup, SHA and ledger plan.

echo "ERROR: worker-airtrust/scripts/aplicar-migration-0091-seguro.sh is retired." >&2
echo "No database query or migration was executed." >&2
echo "Prepare a new reviewed reconciliation procedure instead of reusing this legacy path." >&2
exit 1
