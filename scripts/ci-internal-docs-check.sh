#!/usr/bin/env bash
set -euo pipefail

check_files() {
  local violations=0
  for file in "$@"; do
    if [[ "$file" == docs/analysis/AUDITORIA_FINAL_PTO_*.md ]] || \
       [[ "$file" == docs/analysis/*ANAC*NC* ]] || \
       [[ "$file" == docs/analysis/*PTO*AUDITORIA* ]] || \
       [[ "$file" == docs/analysis/*CTAC* ]]; then
      echo "BLOCKED: Sensitive internal document detected: $file"
      violations=$((violations + 1))
    fi
  done
  return $violations
}

if [[ "${1:-}" == "--test" ]]; then
  # Run tests
  set +e
  
  echo "Running tests..."
  
  # Test 1: Should block AUDITORIA_FINAL_PTO_...
  check_files "docs/analysis/AUDITORIA_FINAL_PTO_H3_20260729.md" >/dev/null
  if [ $? -eq 1 ]; then echo "PASS: blocked AUDITORIA_FINAL_PTO"; else echo "FAIL: missed AUDITORIA_FINAL_PTO"; exit 1; fi
  
  # Test 2: Should block ANAC NC
  check_files "docs/analysis/2026_ANAC_NC_Report.md" >/dev/null
  if [ $? -eq 1 ]; then echo "PASS: blocked ANAC NC"; else echo "FAIL: missed ANAC NC"; exit 1; fi

  # Test 3: Should block CTAC
  check_files "docs/analysis/CTAC_compliance.md" >/dev/null
  if [ $? -eq 1 ]; then echo "PASS: blocked CTAC"; else echo "FAIL: missed CTAC"; exit 1; fi
  
  # Test 4: Should allow normal docs
  check_files "docs/analysis/public_api_design.md" >/dev/null
  if [ $? -eq 0 ]; then echo "PASS: allowed normal doc"; else echo "FAIL: blocked normal doc"; exit 1; fi
  
  echo "All tests passed!"
  exit 0
fi

# Main execution
if [ -n "${GITHUB_BASE_REF:-}" ]; then
  CHANGED_FILES=$(git diff --name-only --diff-filter=AM origin/$GITHUB_BASE_REF...HEAD || git diff-tree --no-commit-id --name-only --diff-filter=AM -r HEAD)
else
  CHANGED_FILES=$(git diff-tree --no-commit-id --name-only --diff-filter=AM -r HEAD)
fi

set +e
if [ -n "$CHANGED_FILES" ]; then
  # shellcheck disable=SC2086
  check_files $CHANGED_FILES
  RESULT=$?
else
  RESULT=0
fi
set -e

if [ "$RESULT" -gt 0 ]; then
  echo "Error: $RESULT sensitive file(s) detected."
  echo "These files contain internal regulatory or audit information and must not be published."
  exit 1
fi

echo "No sensitive internal documents detected in changed files."
exit 0
