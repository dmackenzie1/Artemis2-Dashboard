# 2026-04-06 — Mission hourly stats axis refresh

## Summary
- Renamed the bottom histogram panel presentation to `Mission Hourly Stats` so the section is more concise and mission-focused.
- Updated timeline rendering to aggregate utterances by hour across channels before drawing bars.
- Added visible y-axis labels and x-axis time labels (6-hour marks by default, 12-hour marks for longer ranges).
- Added a stronger visual highlight treatment for the newest bars to make recent activity easier to scan.

## What Did Not Work
- A first pass that removed all section context text without retaining a compact kicker made the panel header feel visually unanchored against neighboring cards; kept a short kicker while still condensing the panel title.

## Validation Notes
- Ran workspace lint and test commands after changes.
