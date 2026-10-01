#!/usr/bin/env python3
"""Deprecated Training Compliance reconciler.

This historical entry point inferred current Compliance audiences from qualification history.
That behavior is unsafe: training history is evidence, not a designation or requirement source.

Use the reviewed V3 reconciliation for analysis/staging and Schema V2 for governed remote
changes. This file intentionally fails closed so the legacy production path cannot be revived.
"""
from __future__ import annotations

import sys

MESSAGE = (
    "BLOCKED: reconcile-training-compliance-requirements.py is deprecated. "
    "Qualification history must never create a current Compliance obligation. "
    "Use scripts/compliance/reconcile-training-compliance-v3.mjs for the reviewed model "
    "and the governed Schema V2 workflow for remote changes."
)


def main() -> int:
    print(MESSAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
