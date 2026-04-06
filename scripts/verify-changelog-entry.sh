#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-${GITHUB_BASE_REF:-}}"
if [[ -n "$BASE_REF" ]]; then
  RANGE="origin/${BASE_REF}...HEAD"
  CHANGED_FILES=$(git diff --name-only "$RANGE")
  CHANGELOG_DIFF=$(git diff --unified=0 "$RANGE" -- CHANGELOG.md)
else
  CHANGED_FILES=$(git diff --name-only HEAD)
  CHANGELOG_DIFF=$(git diff --unified=0 HEAD -- CHANGELOG.md)
fi

if [[ -z "$CHANGED_FILES" ]]; then
  echo "No changed files detected."
  exit 0
fi

if ! grep -q '^CHANGELOG\.md$' <<<"$CHANGED_FILES"; then
  echo "ERROR: CHANGELOG.md must be updated in every MR." >&2
  exit 1
fi

if ! grep -Eq '^\+[-*] .*Intent:' <<<"$CHANGELOG_DIFF"; then
  echo "ERROR: Add at least one new CHANGELOG bullet that includes 'Intent:' in the added text." >&2
  exit 1
fi

echo "Changelog enforcement check passed."
