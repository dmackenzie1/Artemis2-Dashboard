# 2026-04-07 - About page and software version visibility

## Summary
- Added a new About page that explains the dashboard data source (`talkybot.fit.nasa.gov`) and confirms the dashboard is derived from Artemis II mission transcript data.
- Added a visible software version readout on the About page by reading the client package version.
- Added topbar navigation and routing for the new `/about` page.
- Added an Unreleased changelog entry for the feature intent.

## What Did Not Work
- The `browser_container` screenshot tool is not available in this environment, so I could not capture a UI screenshot through the required browser tool path.

## Validation
- `npm run lint`
- `npm run test`
