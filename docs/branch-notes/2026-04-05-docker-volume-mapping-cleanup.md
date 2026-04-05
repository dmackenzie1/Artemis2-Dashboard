# Branch Notes - Docker Volume Mapping Cleanup

## What Was Built
- Updated `docker-compose.yml` so PostgreSQL now uses an internal Docker named volume (`db_data`) rather than a bind mount on the host scratch path.
- Removed backend bind mounts for `sample_data` and `/app/data` to keep cache/transient runtime state inside containers.
- Kept only operator-managed input bind mounts for transcript CSVs, prompt templates, and source documents (`TB-Artemis-Summaries`, `prompts`, `source_files`).
- Updated `README.md` ingestion guidance and added an explicit Docker volume mapping section so operators know exactly what is host-mapped versus internal-only.

## What Did Not Work
- Initial compose draft kept `sample_data` mounted alongside `TB-Artemis-Summaries`, which duplicated transcript input locations and conflicted with the cleanup goal.
- This was corrected by removing the `sample_data` bind mount and standardizing ingestion docs on `TB-Artemis-Summaries` for Docker runs.

## Follow-up Recommendations
- If FIT deployments later need durable database retention, switch `db_data` to an environment-specific external volume driver rather than reintroducing a hardcoded host-path bind mount.
- Consider adding a `docker-compose.dev.yml` override that optionally re-enables `sample_data` as a convenience mount for local-only demo datasets.
