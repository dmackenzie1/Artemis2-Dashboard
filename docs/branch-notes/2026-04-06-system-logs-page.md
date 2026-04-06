# 2026-04-06 - system logs page

## Summary
- Added a dedicated backend `SystemLogsService` and `system-logs` router to expose prompt submission files plus outgoing/incoming LLM debug artifacts as a sortable API list.
- Added a new frontend `/system-logs` page that lists artifact files, supports manual refresh, and shows selected file contents in a read-only textbox.
- Wired new client API helpers and app navigation route for system logs visibility.
- Added backend unit tests for system log listing and file retrieval behavior.

## What Did Not Work
- Initial CSS module parse review showed the existing timeline mobile media block was missing a closing brace; this prevented safely appending new styles until the block was corrected.
