# 2026-04-06 - Redis cache dependency and Compose hardening

## Summary
- Added Redis container healthcheck in `docker-compose.yml` so Redis readiness is explicitly monitored.
- Updated `server` service env configuration in Compose to explicitly wire Redis cache settings (`REDIS_CACHE_ENABLED`, `REDIS_URL`).
- Updated top-level README with Redis cache behavior and a troubleshooting note for missing `redis` module errors during lint.
- Updated backend README runtime notes to document Redis dependency and required env settings.
- Added changelog entry under Unreleased.

## What Did Not Work
- The root lint command initially failed before reinstalling dependencies due `Cannot find module 'redis'` in this environment; rerunning `npm install` from repo root resolved it.
