#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: This legacy production validation script is blocked because it performs remote DB writes."
echo "Split read-only validation from write checks before re-enabling."
exit 1
