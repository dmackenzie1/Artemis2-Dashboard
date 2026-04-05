# Branch Notes - Docker Directory Standardization

## What Was Built
- Moved the backend application workspace from `/backend` into `/docker/server` while keeping the backend package name and scripts unchanged.
- Moved the frontend application workspace from `/frontend` into `/docker/client` while keeping the frontend package name and scripts unchanged.
- Updated root NPM workspace paths to point to `docker/client` and `docker/server`.
- Updated Docker build definitions so the backend image installs/builds from `/docker/server` and the frontend image installs/builds from `/docker/client`.
- Updated the backend data volume mount in `docker-compose.yml` to use `./docker/server/data`.
- Updated README wording to reflect the new source-code locations.

## What Did Not Work
- `npm run lint` initially failed after the directory move because the dependency tree had not yet been reinstalled for the new workspace paths.
- Running `npm install` regenerated workspace links and resolved the lint/test execution issue.

## Follow-up Recommendations
- Add a `docker/README.md` with quick references for local build/debug workflows.
