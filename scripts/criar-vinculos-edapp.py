#!/usr/bin/env python3
"""Blocked legacy EdApp production DB mutation helper."""

import sys

print("ERROR: This legacy production DB mutation helper is blocked.")
print(
    "Use reviewed application endpoints or scripts/run-production-db-script.sh "
    "with an allowlisted SQL file and explicit production confirmation."
)
sys.exit(1)
