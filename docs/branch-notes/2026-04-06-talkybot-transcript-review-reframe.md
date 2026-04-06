# 2026-04-06 – TalkyBot Transcript Review Reframe

## Summary
- Renamed key dashboard wording from "mission intelligence" framing to "TalkyBot transcript review" and post-mission review language.
- Added a direct topbar link to TalkyBot (`https://talkybot.fit.nasa.gov/`) and replaced the topic-page placeholder with an actual TalkyBot link.
- Updated all prompt templates to explicitly frame output as retrospective review content and not real-time operational guidance.
- Added a dated daily snapshot chart (utterances + words) into the Snapshot/Stats panel.
- Updated README title and intent section to preserve and document that this site is for delayed transcript review and post-mission analysis.

## What Changed
- Expanded dashboard view model to expose per-day transcript volume for rendering in the stats panel.
- Added compact chart-style bars for daily utterance/word trend visibility with date labels.
- Updated top-level app title and panel copy to match TalkyBot transcript review intent.
- Added changelog entry with explicit implementation intent.

## What Did Not Work
- Browser-container screenshot capture was not available in this environment, so I could not attach a UI screenshot through that tool.

## Validation
- Ran repository lint and test scripts from the workspace root.
