# 2026-04-06 — EC2 deployment runbook and README linkage

## Summary

- Added a dedicated deployment runbook at `docs/deployment.md` covering:
  - EC2 target snapshot (`a2.emss-mess.org`, AL2023, `t3a.medium` baseline)
  - Local-first policy
  - Host bootstrap script (Docker, Compose fallback, Node/npm, git, swap, CloudWatch agent)
  - Environment-variable template and startup/health-check commands
  - DNS/networking and operational checklist
- Updated top-level `README.md` with a short Deployment notes section linking to the new runbook.
- Added an Unreleased changelog entry documenting this docs update with explicit intent.

## What did not work

- Installing `docker-compose-plugin` via `dnf` on Amazon Linux 2023 did not resolve (`No match for argument: docker-compose-plugin`) in the target environment.
- Documented and retained a working fallback path using standalone `docker-compose` binary installation and command usage.

## Validation

- Reviewed runbook for consistency with existing repo Docker layout and env schema.
